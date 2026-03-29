const { withTransaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const companyModel = require('../models/companyModel');
const workflowModel = require('../models/workflowModel');
const expenseModel = require('../models/expenseModel');
const userModel = require('../models/userModel');
const ruleEngineService = require('./ruleEngineService');
const currencyService = require('./currencyService');
const auditService = require('./auditService');

function roundCurrency(num) {
  return Math.round(Number(num) * 100) / 100;
}

async function createExpense(auth, payload, meta) {
  const required = ['title', 'category', 'expenseDate', 'originalAmount', 'originalCurrency'];
  for (const field of required) {
    if (!payload[field]) {
      throw new HttpError(400, `Missing required field: ${field}`);
    }
  }

  return withTransaction(async (connection) => {
    const company = await companyModel.findById(auth.companyId, connection);
    if (!company) {
      throw new HttpError(404, 'Company not found');
    }

    const workflow = await workflowModel.getApplicableWorkflow(auth.companyId, payload.category, connection);
    if (!workflow) {
      throw new HttpError(400, 'No active workflow configured for this category');
    }

    const originalCurrency = String(payload.originalCurrency).toUpperCase();
    const { rate } = await currencyService.getExchangeRate(
      auth.companyId,
      originalCurrency,
      company.base_currency,
      payload.expenseDate,
      connection
    );

    const convertedAmount = roundCurrency(Number(payload.originalAmount) * Number(rate));
    const steps = await workflowModel.getWorkflowSteps(workflow.id, auth.companyId, connection);

    const expenseId = await expenseModel.createExpense(
      {
        companyId: auth.companyId,
        submittedByUserId: auth.userId,
        workflowId: workflow.id,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        expenseDate: payload.expenseDate,
        originalAmount: Number(payload.originalAmount),
        originalCurrency,
        exchangeRate: Number(rate),
        convertedAmount,
        currentStepOrder: steps.length ? steps[0].step_order : null
      },
      connection
    );

    const state = await ruleEngineService.recalculateApproval(expenseId, auth.companyId, connection);

    await expenseModel.updateExpenseStatus(
      {
        expenseId,
        companyId: auth.companyId,
        status: state.status,
        currentStepOrder: state.currentStepOrder,
        rejectionReason: state.rejectionReason,
        resolvedAt: state.status === 'pending' ? null : new Date()
      },
      connection
    );

    await auditService.record(
      {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        entityType: 'expense',
        entityId: expenseId,
        action: 'EXPENSE_SUBMITTED',
        newValues: payload,
        metadata: { convertedAmount, exchangeRate: rate },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      },
      connection
    );

    return expenseModel.getExpenseById(expenseId, auth.companyId, connection);
  });
}

async function getExpenseById(auth, expenseId) {
  const expense = await expenseModel.getExpenseById(expenseId, auth.companyId, null);
  if (!expense) {
    throw new HttpError(404, 'Expense not found');
  }

  if (auth.role === 'employee' && expense.submitted_by_user_id !== auth.userId) {
    throw new HttpError(403, 'Employees can only view their own expenses');
  }

  if (auth.role === 'manager') {
    const managedIds = await userModel.getManagedUserIds(auth.companyId, auth.userId, null);
    if (expense.submitted_by_user_id !== auth.userId && !managedIds.includes(expense.submitted_by_user_id)) {
      throw new HttpError(403, 'Managers can only view their team expenses');
    }
  }

  const state = await ruleEngineService.recalculateApproval(expenseId, auth.companyId, null);

  return {
    ...expense,
    computedStatus: state.status,
    approvalSummary: {
      approvalMode: state.workflow.approval_mode,
      currentStepOrder: state.currentStepOrder,
      rejectionReason: state.rejectionReason,
      approvals: state.approvals
    }
  };
}

async function listExpenses(auth, query) {
  const status = query.status || null;

  if (auth.role === 'employee') {
    return expenseModel.listExpenses(auth.companyId, { status, userId: auth.userId }, null);
  }

  if (auth.role === 'manager') {
    const managedUserIds = await userModel.getManagedUserIds(auth.companyId, auth.userId, null);
    const scopedIds = [auth.userId, ...managedUserIds];
    const scopedExpenses = await Promise.all(
      scopedIds.map((userId) => expenseModel.listExpenses(auth.companyId, { status, userId }, null))
    );

    return scopedExpenses
      .flat()
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  }

  const filters = {
    status,
    userId: query.userId ? Number(query.userId) : null
  };
  return expenseModel.listExpenses(auth.companyId, filters, null);
}

module.exports = {
  createExpense,
  getExpenseById,
  listExpenses
};
