const { execute } = require('./dbExecutor');

async function createExpense(data, connection) {
  const result = await execute(
    connection,
    `INSERT INTO expenses
     (company_id, submitted_by_user_id, workflow_id, title, description, category,
      receipt_data_url, receipt_file_name,
      expense_date, original_amount, original_currency, exchange_rate, converted_amount,
      status, current_step_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `,
    [
      data.companyId,
      data.submittedByUserId,
      data.workflowId,
      data.title,
      data.description || null,
      data.category,
      data.receiptDataUrl || null,
      data.receiptFileName || null,
      data.expenseDate,
      data.originalAmount,
      data.originalCurrency,
      data.exchangeRate,
      data.convertedAmount,
      data.currentStepOrder || null
    ]
  );

  return result.insertId;
}

async function getExpenseById(expenseId, companyId, connection) {
  const rows = await execute(
    connection,
    `SELECT e.id, e.company_id, e.submitted_by_user_id, e.workflow_id, e.title, e.description,
            e.category, e.receipt_data_url, e.receipt_file_name,
            e.expense_date, e.original_amount, e.original_currency, e.exchange_rate,
            e.converted_amount, e.status, e.current_step_order, e.rejection_reason,
            e.submitted_at, e.resolved_at, e.created_at, e.updated_at,
            u.first_name AS submitted_by_first_name, u.last_name AS submitted_by_last_name
     FROM expenses e
     INNER JOIN users u ON u.id = e.submitted_by_user_id
     WHERE e.id = ? AND e.company_id = ?`,
    [expenseId, companyId]
  );

  return rows[0] || null;
}

async function listExpenses(companyId, filters, connection) {
  const where = ['e.company_id = ?'];
  const params = [companyId];

  if (filters.userId) {
    where.push('e.submitted_by_user_id = ?');
    params.push(filters.userId);
  }

  if (filters.status) {
    where.push('e.status = ?');
    params.push(filters.status);
  }

  const sql = `SELECT e.id, e.workflow_id, e.title, e.category, e.expense_date, e.original_amount,
                      e.original_currency, e.exchange_rate, e.converted_amount,
         e.receipt_file_name,
         CASE WHEN e.receipt_data_url IS NULL OR e.receipt_data_url = '' THEN 0 ELSE 1 END AS has_receipt,
                      e.status, e.current_step_order, e.rejection_reason, e.submitted_at,
                      e.resolved_at, u.first_name AS submitted_by_first_name,
                      u.last_name AS submitted_by_last_name
               FROM expenses e
               INNER JOIN users u ON u.id = e.submitted_by_user_id
               WHERE ${where.join(' AND ')}
               ORDER BY e.submitted_at DESC`;

  return execute(connection, sql, params);
}

async function updateExpenseStatus(data, connection) {
  await execute(
    connection,
    `UPDATE expenses
     SET status = ?,
         current_step_order = ?,
         rejection_reason = ?,
         resolved_at = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND company_id = ?`,
    [
      data.status,
      data.currentStepOrder || null,
      data.rejectionReason || null,
      data.resolvedAt || null,
      data.expenseId,
      data.companyId
    ]
  );
}

module.exports = {
  createExpense,
  getExpenseById,
  listExpenses,
  updateExpenseStatus
};
