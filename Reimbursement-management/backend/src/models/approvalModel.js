const { execute } = require('./dbExecutor');

async function upsertApproval(data, connection) {
  await execute(
    connection,
    `INSERT INTO expense_approvals
     (company_id, expense_id, workflow_step_id, approver_user_id, action, comment)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       action = VALUES(action),
       comment = VALUES(comment),
       acted_at = CURRENT_TIMESTAMP`,
    [
      data.companyId,
      data.expenseId,
      data.workflowStepId,
      data.approverUserId,
      data.action,
      data.comment || null
    ]
  );
}

async function listExpenseApprovals(expenseId, companyId, connection) {
  return execute(
    connection,
    `SELECT id, expense_id, workflow_step_id, approver_user_id, action, comment, acted_at
     FROM expense_approvals
     WHERE expense_id = ? AND company_id = ?`,
    [expenseId, companyId]
  );
}

async function listApprovalsByExpenseIds(expenseIds, companyId, connection) {
  if (!expenseIds.length) {
    return [];
  }

  const placeholders = expenseIds.map(() => '?').join(', ');
  return execute(
    connection,
    `SELECT id, expense_id, workflow_step_id, approver_user_id, action, comment, acted_at
     FROM expense_approvals
     WHERE company_id = ? AND expense_id IN (${placeholders})`,
    [companyId, ...expenseIds]
  );
}

async function hasApproverActed(expenseId, workflowStepId, approverUserId, companyId, connection) {
  const rows = await execute(
    connection,
    `SELECT id
     FROM expense_approvals
     WHERE expense_id = ? AND workflow_step_id = ? AND approver_user_id = ? AND company_id = ?`,
    [expenseId, workflowStepId, approverUserId, companyId]
  );

  return rows.length > 0;
}

module.exports = {
  upsertApproval,
  listExpenseApprovals,
  listApprovalsByExpenseIds,
  hasApproverActed
};
