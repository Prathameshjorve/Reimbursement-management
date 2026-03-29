const { withTransaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const workflowModel = require('../models/workflowModel');
const auditService = require('./auditService');

function validateWorkflowInput(payload) {
  if (!payload.name || !payload.approvalMode || !Array.isArray(payload.steps) || !payload.steps.length) {
    throw new HttpError(400, 'name, approvalMode and at least one step are required');
  }

  const invalidStep = payload.steps.find(
    (step) =>
      !step.name ||
      !step.stepOrder ||
      !step.stepType ||
      !Array.isArray(step.approverUserIds) ||
      !step.approverUserIds.length
  );

  if (invalidStep) {
    throw new HttpError(400, 'Each step requires name, stepOrder, stepType and approverUserIds');
  }
}

async function createWorkflow(auth, payload, meta) {
  validateWorkflowInput(payload);

  return withTransaction(async (connection) => {
    const workflowId = await workflowModel.createWorkflow(
      {
        companyId: auth.companyId,
        name: payload.name,
        description: payload.description,
        appliesToCategory: payload.appliesToCategory || 'all',
        approvalMode: payload.approvalMode,
        requiredApprovalPercent: payload.requiredApprovalPercent || null,
        overrideApproverUserId: payload.overrideApproverUserId || null,
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
          stepOrder: step.stepOrder,
          name: step.name,
          stepType: step.stepType,
          requiredApprovalPercent: step.requiredApprovalPercent || null,
          isMandatory: step.isMandatory !== false
        },
        connection
      );

      for (const approverUserId of step.approverUserIds) {
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
