const { execute } = require('./dbExecutor');

async function createWorkflow(data, connection) {
  const result = await execute(
    connection,
    `INSERT INTO workflows
     (company_id, name, description, applies_to_category, approval_mode, required_approval_percent,
      override_approver_user_id, is_active, version, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.companyId,
      data.name,
      data.description || null,
      data.appliesToCategory,
      data.approvalMode,
      data.requiredApprovalPercent || null,
      data.overrideApproverUserId || null,
      data.isActive ? 1 : 0,
      data.version || 1,
      data.createdByUserId
    ]
  );

  return result.insertId;
}

async function createWorkflowStep(data, connection) {
  const result = await execute(
    connection,
    `INSERT INTO workflow_steps
     (company_id, workflow_id, step_order, name, step_type, required_approval_percent, is_mandatory)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.companyId,
      data.workflowId,
      data.stepOrder,
      data.name,
      data.stepType,
      data.requiredApprovalPercent || null,
      data.isMandatory ? 1 : 0
    ]
  );

  return result.insertId;
}

async function addStepApprover(data, connection) {
  const result = await execute(
    connection,
    `INSERT INTO workflow_step_approvers
     (company_id, workflow_step_id, approver_user_id, is_required)
     VALUES (?, ?, ?, ?)`,
    [data.companyId, data.workflowStepId, data.approverUserId, data.isRequired ? 1 : 0]
  );

  return result.insertId;
}

async function listWorkflows(companyId, connection) {
  return execute(
    connection,
    `SELECT id, company_id, name, description, applies_to_category, approval_mode,
            required_approval_percent, override_approver_user_id, is_active, version,
            created_by_user_id, created_at, updated_at
     FROM workflows
     WHERE company_id = ?
     ORDER BY updated_at DESC`,
    [companyId]
  );
}

async function getWorkflowById(workflowId, companyId, connection) {
  const rows = await execute(
    connection,
    `SELECT id, company_id, name, description, applies_to_category, approval_mode,
            required_approval_percent, override_approver_user_id, is_active
     FROM workflows
     WHERE id = ? AND company_id = ?`,
    [workflowId, companyId]
  );

  return rows[0] || null;
}

async function getWorkflowSteps(workflowId, companyId, connection) {
  return execute(
    connection,
    `SELECT id, workflow_id, step_order, name, step_type, required_approval_percent, is_mandatory
     FROM workflow_steps
     WHERE workflow_id = ? AND company_id = ?
     ORDER BY step_order ASC`,
    [workflowId, companyId]
  );
}

async function getStepApprovers(workflowId, companyId, connection) {
  return execute(
    connection,
    `SELECT wsa.workflow_step_id, wsa.approver_user_id, wsa.is_required
     FROM workflow_step_approvers wsa
     INNER JOIN workflow_steps ws ON ws.id = wsa.workflow_step_id
     WHERE ws.workflow_id = ? AND wsa.company_id = ?`,
    [workflowId, companyId]
  );
}

async function getWorkflowsByIds(companyId, workflowIds, connection) {
  if (!workflowIds.length) {
    return [];
  }

  const placeholders = workflowIds.map(() => '?').join(', ');
  return execute(
    connection,
    `SELECT id, company_id, name, approval_mode, required_approval_percent,
            override_approver_user_id, applies_to_category, is_active
     FROM workflows
     WHERE company_id = ? AND id IN (${placeholders})`,
    [companyId, ...workflowIds]
  );
}

async function getStepsByWorkflowIds(companyId, workflowIds, connection) {
  if (!workflowIds.length) {
    return [];
  }

  const placeholders = workflowIds.map(() => '?').join(', ');
  return execute(
    connection,
    `SELECT id, workflow_id, step_order, name, step_type, required_approval_percent, is_mandatory
     FROM workflow_steps
     WHERE company_id = ? AND workflow_id IN (${placeholders})
     ORDER BY workflow_id ASC, step_order ASC`,
    [companyId, ...workflowIds]
  );
}

async function getApproversByWorkflowIds(companyId, workflowIds, connection) {
  if (!workflowIds.length) {
    return [];
  }

  const placeholders = workflowIds.map(() => '?').join(', ');
  return execute(
    connection,
    `SELECT ws.workflow_id, wsa.workflow_step_id, wsa.approver_user_id, wsa.is_required
     FROM workflow_step_approvers wsa
     INNER JOIN workflow_steps ws ON ws.id = wsa.workflow_step_id
     WHERE wsa.company_id = ? AND ws.workflow_id IN (${placeholders})`,
    [companyId, ...workflowIds]
  );
}

async function getApplicableWorkflow(companyId, category, connection) {
  const rows = await execute(
    connection,
    `SELECT id, company_id, name, approval_mode, required_approval_percent,
            override_approver_user_id, applies_to_category
     FROM workflows
     WHERE company_id = ?
       AND is_active = 1
       AND (applies_to_category = ? OR applies_to_category = 'all')
     ORDER BY CASE WHEN applies_to_category = ? THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [companyId, category, category]
  );

  return rows[0] || null;
}

async function setWorkflowActive(workflowId, companyId, isActive, connection) {
  await execute(
    connection,
    `UPDATE workflows
     SET is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND company_id = ?`,
    [isActive ? 1 : 0, workflowId, companyId]
  );
}

module.exports = {
  createWorkflow,
  createWorkflowStep,
  addStepApprover,
  listWorkflows,
  getWorkflowById,
  getWorkflowSteps,
  getStepApprovers,
  getApplicableWorkflow,
  setWorkflowActive,
  getWorkflowsByIds,
  getStepsByWorkflowIds,
  getApproversByWorkflowIds
};
