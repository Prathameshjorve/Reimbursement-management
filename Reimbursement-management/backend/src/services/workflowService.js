const { withTransaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const workflowModel = require('../models/workflowModel');
const userModel = require('../models/userModel');
const auditService = require('./auditService');
const {
  VALID_WORKFLOW_CATEGORIES,
  VALID_APPROVAL_MODES,
  VALID_STEP_TYPES,
  normalizeString,
  normalizeUppercase,
  isPositiveInteger
} = require('../utils/validation');

function validateWorkflowInput(payload) {
  const name = normalizeString(payload.name);
  const approvalMode = normalizeUppercase(payload.approvalMode);
  const appliesToCategory = normalizeString(payload.appliesToCategory || 'all').toLowerCase();
  const steps = Array.isArray(payload.steps) ? payload.steps : [];

  if (!name || !approvalMode || !steps.length) {
    throw new HttpError(400, 'name, approvalMode and at least one step are required');
  }

  if (name.length > 120) {
    throw new HttpError(400, 'Workflow name must be 120 characters or less');
  }

  if (!VALID_APPROVAL_MODES.includes(approvalMode)) {
    throw new HttpError(400, 'Please choose a valid approval mode');
  }

  if (!VALID_WORKFLOW_CATEGORIES.includes(appliesToCategory)) {
    throw new HttpError(400, 'Please choose a valid workflow category');
  }

  const seenOrders = new Set();

  for (const step of steps) {
    const stepName = normalizeString(step.name);
    const stepType = normalizeUppercase(step.stepType);
    const stepOrder = Number(step.stepOrder);
    const approverIds = Array.isArray(step.approverUserIds)
      ? step.approverUserIds.map((value) => Number(value))
      : [];

    if (!stepName || !isPositiveInteger(stepOrder) || !VALID_STEP_TYPES.includes(stepType) || !approverIds.length) {
      throw new HttpError(400, 'Each step requires a valid name, order, type, and at least one approver');
    }

    if (stepName.length > 120) {
      throw new HttpError(400, 'Workflow step names must be 120 characters or less');
    }

    if (seenOrders.has(stepOrder)) {
      throw new HttpError(400, 'Each workflow step must have a unique order');
    }
    seenOrders.add(stepOrder);

    if (approverIds.some((id) => !isPositiveInteger(id))) {
      throw new HttpError(400, 'Approver IDs must be positive integers');
    }

    if (stepType === 'PERCENTAGE') {
      const percent = Number(step.requiredApprovalPercent);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        throw new HttpError(400, 'Percentage steps require requiredApprovalPercent between 0 and 100');
      }
    }
  }

  if ((approvalMode === 'PERCENTAGE' || approvalMode === 'HYBRID') && !Number.isFinite(Number(payload.requiredApprovalPercent))) {
    throw new HttpError(400, 'This approval mode requires requiredApprovalPercent');
  }

  if (payload.requiredApprovalPercent !== undefined && payload.requiredApprovalPercent !== null) {
    const percent = Number(payload.requiredApprovalPercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new HttpError(400, 'requiredApprovalPercent must be between 0 and 100');
    }
  }

  if ((approvalMode === 'SPECIFIC_OVERRIDE' || approvalMode === 'HYBRID') && !isPositiveInteger(Number(payload.overrideApproverUserId))) {
    throw new HttpError(400, 'This approval mode requires a valid overrideApproverUserId');
  }
}

async function createWorkflow(auth, payload, meta) {
  validateWorkflowInput(payload);

  return withTransaction(async (connection) => {
    const allApproverIds = [...new Set(
      payload.steps
        .flatMap((step) => step.approverUserIds || [])
        .map((value) => Number(value))
        .concat(payload.overrideApproverUserId ? [Number(payload.overrideApproverUserId)] : [])
    )];

    const users = await userModel.findByIdsForCompany(auth.companyId, allApproverIds, connection);
    const activeUserIds = new Set(users.filter((user) => user.is_active).map((user) => user.id));

    if (activeUserIds.size !== allApproverIds.length) {
      throw new HttpError(400, 'One or more approvers were not found or are inactive');
    }

    const workflowId = await workflowModel.createWorkflow(
      {
        companyId: auth.companyId,
        name: normalizeString(payload.name),
        description: normalizeString(payload.description) || null,
        appliesToCategory: normalizeString(payload.appliesToCategory || 'all').toLowerCase(),
        approvalMode: normalizeUppercase(payload.approvalMode),
        requiredApprovalPercent: payload.requiredApprovalPercent || null,
        overrideApproverUserId: payload.overrideApproverUserId ? Number(payload.overrideApproverUserId) : null,
        isActive: payload.isActive !== false,
        version: 1,
        createdByUserId: auth.userId
      },
      connection
    );

    for (const step of payload.steps) {
      const workflowStepId = await workflowModel.createWorkflowStep(
        {
          companyId: auth.companyId,
          workflowId,
          stepOrder: Number(step.stepOrder),
          name: normalizeString(step.name),
          stepType: normalizeUppercase(step.stepType),
          requiredApprovalPercent: step.requiredApprovalPercent || null,
          isMandatory: step.isMandatory !== false
        },
        connection
      );

      for (const approverUserId of [...new Set(step.approverUserIds.map((value) => Number(value)))]) {
        await workflowModel.addStepApprover(
          {
            companyId: auth.companyId,
            workflowStepId,
            approverUserId,
            isRequired: true
          },
          connection
        );
      }
    }

    await auditService.record(
      {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        entityType: 'workflow',
        entityId: workflowId,
        action: 'WORKFLOW_CREATED',
        newValues: payload,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      },
      connection
    );

    return getWorkflowDetails(auth.companyId, workflowId, connection);
  });
}

async function getWorkflowDetails(companyId, workflowId, connection = null) {
  const workflow = await workflowModel.getWorkflowById(workflowId, companyId, connection);
  if (!workflow) {
    throw new HttpError(404, 'Workflow not found');
  }

  const steps = await workflowModel.getWorkflowSteps(workflowId, companyId, connection);
  const approvers = await workflowModel.getStepApprovers(workflowId, companyId, connection);

  const stepsWithApprovers = steps.map((step) => ({
    ...step,
    approverUserIds: approvers
      .filter((item) => item.workflow_step_id === step.id)
      .map((item) => item.approver_user_id)
  }));

  return {
    ...workflow,
    steps: stepsWithApprovers
  };
}

async function listWorkflows(auth) {
  const workflows = await workflowModel.listWorkflows(auth.companyId, null);
  if (!workflows.length) {
    return [];
  }

  const workflowIds = workflows.map((item) => item.id);
  const [steps, approvers] = await Promise.all([
    workflowModel.getStepsByWorkflowIds(auth.companyId, workflowIds, null),
    workflowModel.getApproversByWorkflowIds(auth.companyId, workflowIds, null)
  ]);

  return workflows.map((workflow) => {
    const workflowSteps = steps.filter((step) => step.workflow_id === workflow.id);
    const workflowApprovers = approvers.filter((item) => item.workflow_id === workflow.id);

    return {
      ...workflow,
      steps: workflowSteps.map((step) => ({
        ...step,
        approverUserIds: workflowApprovers
          .filter((item) => item.workflow_step_id === step.id)
          .map((item) => item.approver_user_id)
      }))
    };
  });
}

module.exports = {
  createWorkflow,
  listWorkflows
};
