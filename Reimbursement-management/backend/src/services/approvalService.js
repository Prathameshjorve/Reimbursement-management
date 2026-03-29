const { withTransaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const expenseModel = require('../models/expenseModel');
const approvalModel = require('../models/approvalModel');
const workflowModel = require('../models/workflowModel');
const ruleEngineService = require('./ruleEngineService');
const auditService = require('./auditService');
const { normalizeString, isPositiveInteger } = require('../utils/validation');

function groupBy(items, keyGetter) {
  const map = new Map();
  for (const item of items) {
    const key = keyGetter(item);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

function findActionStepId(context, userId, role) {
  if (role === 'admin') {
    return null;
  }

  const mode = context.workflow.approval_mode;

  if (mode === 'SPECIFIC_OVERRIDE' && context.workflow.override_approver_user_id === userId) {
    if (context.firstPendingStep) {
      return context.firstPendingStep.step.id;
    }
    return context.steps[0] ? context.steps[0].id : null;
  }

  if (mode === 'PERCENTAGE') {
    const assignedStepIds = context.stepApprovers
      .filter((item) => item.approver_user_id === userId)
      .map((item) => item.workflow_step_id);

    const actedStepIds = new Set(
      context.approvals.filter((item) => item.approver_user_id === userId).map((item) => item.workflow_step_id)
    );

    return assignedStepIds.find((stepId) => !actedStepIds.has(stepId)) || null;
  }

  if (!context.firstPendingStep) {
    return null;
  }

  const stepId = context.firstPendingStep.step.id;
  const canActOnStep = context.stepApprovers.some(
    (item) => item.workflow_step_id === stepId && item.approver_user_id === userId
  );

  return canActOnStep ? stepId : null;
}

async function actionApproval(auth, payload, meta) {
  const expenseId = Number(payload.expenseId);
  const action = normalizeString(payload.action).toLowerCase();
  const comment = normalizeString(payload.comment);

  if (!isPositiveInteger(expenseId) || !['approved', 'rejected'].includes(action)) {
    throw new HttpError(400, 'expenseId and valid action are required');
  }

  if (comment.length > 500) {
    throw new HttpError(400, 'Approval comments must be 500 characters or less');
  }

  return withTransaction(async (connection) => {
    const expense = await expenseModel.getExpenseById(expenseId, auth.companyId, connection);
    if (!expense) {
      throw new HttpError(404, 'Expense not found');
    }

    const stateBefore = await ruleEngineService.recalculateApproval(expenseId, auth.companyId, connection);
    if (!stateBefore) {
      throw new HttpError(404, 'Expense not found for recalculation');
    }

    const canAct = ruleEngineService.canUserAct(stateBefore.context, auth.userId, auth.role);
    if (!canAct) {
      throw new HttpError(403, 'You cannot act on this expense at the current step');
    }

    const workflowStepId = findActionStepId(stateBefore.context, auth.userId, auth.role);
    if (!workflowStepId) {
      throw new HttpError(400, 'No actionable workflow step found for this user');
    }

    await approvalModel.upsertApproval(
      {
        companyId: auth.companyId,
        expenseId,
        workflowStepId,
        approverUserId: auth.userId,
        action,
        comment: comment || null
      },
      connection
    );

    const stateAfter = await ruleEngineService.recalculateApproval(expenseId, auth.companyId, connection);

    await expenseModel.updateExpenseStatus(
      {
        expenseId,
        companyId: auth.companyId,
        status: stateAfter.status,
        currentStepOrder: stateAfter.currentStepOrder,
        rejectionReason: stateAfter.rejectionReason,
        resolvedAt: stateAfter.status === 'pending' ? null : new Date()
      },
      connection
    );

    await auditService.record(
      {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        entityType: 'approval',
        entityId: expenseId,
        action: `EXPENSE_${action.toUpperCase()}`,
        oldValues: { status: stateBefore.status, currentStepOrder: stateBefore.currentStepOrder },
        newValues: { status: stateAfter.status, currentStepOrder: stateAfter.currentStepOrder },
        metadata: { comment: comment || null },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      },
      connection
    );

    return {
      expenseId,
      status: stateAfter.status,
      currentStepOrder: stateAfter.currentStepOrder,
      rejectionReason: stateAfter.rejectionReason
    };
  });
}

async function listPendingForApprover(auth) {
  const pendingExpenses = await expenseModel.listExpenses(
    auth.companyId,
    { status: 'pending', userId: null },
    null
  );

  if (!pendingExpenses.length) {
    return [];
  }

  // Visibility is driven by workflow step assignment instead of submitter hierarchy.
  // This avoids hiding valid step actions when users are not mapped under manager_user_id.
  const scopedPendingExpenses = pendingExpenses;

  const expenseIds = scopedPendingExpenses.map((item) => item.id);
  if (!expenseIds.length) {
    return [];
  }

  const workflowIds = [...new Set(scopedPendingExpenses.map((item) => item.workflow_id).filter(Boolean))];

  const [workflows, workflowSteps, workflowApprovers, approvals] = await Promise.all([
    workflowModel.getWorkflowsByIds(auth.companyId, workflowIds, null),
    workflowModel.getStepsByWorkflowIds(auth.companyId, workflowIds, null),
    workflowModel.getApproversByWorkflowIds(auth.companyId, workflowIds, null),
    approvalModel.listApprovalsByExpenseIds(expenseIds, auth.companyId, null)
  ]);

  const workflowsById = new Map(workflows.map((item) => [item.id, item]));
  const stepsByWorkflowId = groupBy(workflowSteps, (item) => item.workflow_id);
  const approversByWorkflowId = groupBy(workflowApprovers, (item) => item.workflow_id);
  const approvalsByExpenseId = groupBy(approvals, (item) => item.expense_id);

  const actionable = [];

  for (const expense of scopedPendingExpenses) {
    const workflow = workflowsById.get(expense.workflow_id);
    if (!workflow) {
      continue;
    }

    const steps = stepsByWorkflowId.get(expense.workflow_id) || [];
    const approvers = approversByWorkflowId.get(expense.workflow_id) || [];
    const expenseApprovals = approvalsByExpenseId.get(expense.id) || [];

    const context = ruleEngineService.buildEvaluationContext(
      expense,
      workflow,
      steps,
      approvers,
      expenseApprovals
    );

    if (ruleEngineService.canUserAct(context, auth.userId, auth.role)) {
      actionable.push({
        ...expense,
        workflowName: workflow.name,
        approvalMode: workflow.approval_mode,
        currentStepOrder: context.firstPendingStep ? context.firstPendingStep.step.step_order : null
      });
    }
  }

  return actionable;
}

module.exports = {
  actionApproval,
  listPendingForApprover
};
