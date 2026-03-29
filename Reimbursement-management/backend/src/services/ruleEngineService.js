const expenseModel = require('../models/expenseModel');
const workflowModel = require('../models/workflowModel');
const approvalModel = require('../models/approvalModel');

function unique(numbers) {
  return [...new Set(numbers)];
}

function evaluateStep(step, stepApprovers, approvals) {
  const allowedApproverIds = stepApprovers
    .filter((item) => item.workflow_step_id === step.id)
    .map((item) => item.approver_user_id);

  const stepApprovals = approvals.filter(
    (item) => item.workflow_step_id === step.id && allowedApproverIds.includes(item.approver_user_id)
  );

  const approvedCount = stepApprovals.filter((item) => item.action === 'approved').length;
  const rejectedCount = stepApprovals.filter((item) => item.action === 'rejected').length;
  const totalApprovers = unique(allowedApproverIds).length;

  if (rejectedCount > 0) {
    return { status: 'rejected', approvedCount, rejectedCount, totalApprovers };
  }

  if (totalApprovers === 0) {
    return { status: 'pending', approvedCount, rejectedCount, totalApprovers };
  }

  if (step.step_type === 'ANY_OF') {
    return {
      status: approvedCount >= 1 ? 'approved' : 'pending',
      approvedCount,
      rejectedCount,
      totalApprovers
    };
  }

  if (step.step_type === 'ALL_OF') {
    return {
      status: approvedCount >= totalApprovers ? 'approved' : 'pending',
      approvedCount,
      rejectedCount,
      totalApprovers
    };
  }

  const requiredPercent = Number(step.required_approval_percent || 100);
  const achievedPercent = (approvedCount / totalApprovers) * 100;
  return {
    status: achievedPercent >= requiredPercent ? 'approved' : 'pending',
    approvedCount,
    rejectedCount,
    totalApprovers
  };
}

function buildEvaluationContext(expense, workflow, steps, stepApprovers, approvals) {
  const stepEvaluations = steps.map((step) => ({
    step,
    evaluation: evaluateStep(step, stepApprovers, approvals)
  }));

  const firstRejected = approvals.find((item) => item.action === 'rejected');
  const hasAnyRejection = Boolean(firstRejected);
  const sequentialComplete = stepEvaluations.every((item) => item.evaluation.status === 'approved');
  const firstPendingStep = stepEvaluations.find((item) => item.evaluation.status !== 'approved');

  const allConfiguredApprovers = unique(stepApprovers.map((item) => item.approver_user_id));
  const approvedApprovers = unique(
    approvals
      .filter((item) => item.action === 'approved')
      .map((item) => item.approver_user_id)
  );

  const approvalPercent = allConfiguredApprovers.length
    ? (approvedApprovers.length / allConfiguredApprovers.length) * 100
    : 0;

  const percentageMet = approvalPercent >= Number(workflow.required_approval_percent || 100);

  const overrideApproved = workflow.override_approver_user_id
    ? approvals.some(
        (item) => item.approver_user_id === workflow.override_approver_user_id && item.action === 'approved'
      )
    : false;

  return {
    expense,
    workflow,
    steps,
    stepApprovers,
    approvals,
    hasAnyRejection,
    firstRejected,
    sequentialComplete,
    firstPendingStep,
    approvalPercent,
    percentageMet,
    overrideApproved
  };
}

function deriveFinalState(context) {
  if (context.hasAnyRejection) {
    return {
      status: 'rejected',
      currentStepOrder: context.firstPendingStep ? context.firstPendingStep.step.step_order : null,
      rejectionReason: context.firstRejected.comment || 'Rejected by approver'
    };
  }

  const mode = context.workflow.approval_mode;

  if (mode === 'SPECIFIC_OVERRIDE') {
    return {
      status: context.overrideApproved ? 'approved' : 'pending',
      currentStepOrder: context.overrideApproved ? null : (context.firstPendingStep ? context.firstPendingStep.step.step_order : 1),
      rejectionReason: null
    };
  }

  if (mode === 'PERCENTAGE') {
    return {
      status: context.percentageMet ? 'approved' : 'pending',
      currentStepOrder: context.percentageMet ? null : (context.firstPendingStep ? context.firstPendingStep.step.step_order : 1),
      rejectionReason: null
    };
  }

  if (mode === 'HYBRID') {
    const approved = context.overrideApproved || (context.sequentialComplete && context.percentageMet);
    return {
      status: approved ? 'approved' : 'pending',
      currentStepOrder: approved ? null : (context.firstPendingStep ? context.firstPendingStep.step.step_order : 1),
      rejectionReason: null
    };
  }

  return {
    status: context.sequentialComplete ? 'approved' : 'pending',
    currentStepOrder: context.sequentialComplete
      ? null
      : (context.firstPendingStep ? context.firstPendingStep.step.step_order : 1),
    rejectionReason: null
  };
}

function canUserAct(context, userId, role) {
  const derived = deriveFinalState(context);
  if (derived.status !== 'pending') {
    return false;
  }

  if (role === 'admin') {
    return true;
  }

  const mode = context.workflow.approval_mode;

  if (mode === 'SPECIFIC_OVERRIDE' && context.workflow.override_approver_user_id) {
    return context.workflow.override_approver_user_id === userId;
  }

  const actedByUserStepIds = new Set(
    context.approvals.filter((item) => item.approver_user_id === userId).map((item) => item.workflow_step_id)
  );

  if (mode === 'PERCENTAGE') {
    const userStepIds = context.stepApprovers
      .filter((item) => item.approver_user_id === userId)
      .map((item) => item.workflow_step_id);

    return userStepIds.some((stepId) => !actedByUserStepIds.has(stepId));
  }

  const pendingStep = context.firstPendingStep;
  if (!pendingStep) {
    return false;
  }

  const userIsApproverForPendingStep = context.stepApprovers.some(
    (item) => item.workflow_step_id === pendingStep.step.id && item.approver_user_id === userId
  );

  if (!userIsApproverForPendingStep) {
    return false;
  }

  return !actedByUserStepIds.has(pendingStep.step.id);
}

async function recalculateApproval(expenseId, companyId, connection) {
  const expense = await expenseModel.getExpenseById(expenseId, companyId, connection);
  if (!expense) {
    return null;
  }

  const workflow = await workflowModel.getWorkflowById(expense.workflow_id, companyId, connection);
  const steps = await workflowModel.getWorkflowSteps(expense.workflow_id, companyId, connection);
  const stepApprovers = await workflowModel.getStepApprovers(expense.workflow_id, companyId, connection);
  const approvals = await approvalModel.listExpenseApprovals(expenseId, companyId, connection);

  const context = buildEvaluationContext(expense, workflow, steps, stepApprovers, approvals);
  const derived = deriveFinalState(context);

  return {
    ...derived,
    context,
    expense,
    workflow,
    steps,
    stepApprovers,
    approvals
  };
}

module.exports = {
  recalculateApproval,
  buildEvaluationContext,
  deriveFinalState,
  canUserAct
};
