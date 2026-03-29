const { withTransaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const companyModel = require('../models/companyModel');
const workflowModel = require('../models/workflowModel');
const expenseModel = require('../models/expenseModel');
const ruleEngineService = require('./ruleEngineService');
const currencyService = require('./currencyService');
const auditService = require('./auditService');
const {
  CURRENCY_CODE_REGEX,
  VALID_EXPENSE_CATEGORIES,
  normalizeString,
  normalizeUppercase,
  isPositiveNumber,
  isValidIsoDate
} = require('../utils/validation');

function roundCurrency(num) {
  return Math.round(Number(num) * 100) / 100;
}

async function createExpense(auth, payload, meta) {
  const title = normalizeString(payload.title);
  const description = normalizeString(payload.description);
  const category = normalizeString(payload.category).toLowerCase();
  const expenseDate = normalizeString(payload.expenseDate);
  const originalCurrency = normalizeUppercase(payload.originalCurrency);
  const originalAmount = Number(payload.originalAmount);

  if (!title || !category || !expenseDate || payload.originalAmount === undefined || !originalCurrency) {
    throw new HttpError(400, 'Title, category, date, amount, and currency are required');
  }

  if (title.length > 150) {
    throw new HttpError(400, 'Expense title must be 150 characters or less');
  }

  if (description.length > 5000) {
    throw new HttpError(400, 'Expense description is too long');
  }

  if (!VALID_EXPENSE_CATEGORIES.includes(category)) {
    throw new HttpError(400, 'Please choose a valid expense category');
  }

  if (!isValidIsoDate(expenseDate)) {
    throw new HttpError(400, 'Expense date must be in YYYY-MM-DD format');
  }

  if (!isPositiveNumber(originalAmount)) {
    throw new HttpError(400, 'Expense amount must be greater than 0');
  }

  if (!CURRENCY_CODE_REGEX.test(originalCurrency)) {
    throw new HttpError(400, 'Currency must be a valid 3-letter currency code');
  }

  return withTransaction(async (connection) => {
    const company = await companyModel.findById(auth.companyId, connection);
    if (!company) {
      throw new HttpError(404, 'Company not found');
    }

    const workflow = await workflowModel.getApplicableWorkflow(auth.companyId, category, connection);
    if (!workflow) {
      throw new HttpError(400, 'No active workflow configured for this category');
    }

    const { rate } = await currencyService.getExchangeRate(
      auth.companyId,
      originalCurrency,
      company.base_currency,
      expenseDate,
      connection
    );

    const convertedAmount = roundCurrency(originalAmount * Number(rate));
    const steps = await workflowModel.getWorkflowSteps(workflow.id, auth.companyId, connection);

    const expenseId = await expenseModel.createExpense(
      {
        companyId: auth.companyId,
        submittedByUserId: auth.userId,
        workflowId: workflow.id,
        title,
        description: description || null,
        category,
        expenseDate,
        originalAmount,
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
        newValues: {
          title,
          description: description || null,
          category,
          expenseDate,
          originalAmount,
          originalCurrency
        },
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
  const filters = {
    status: query.status || null,
    userId: auth.role === 'employee' ? auth.userId : query.userId ? Number(query.userId) : null
  };

  return expenseModel.listExpenses(auth.companyId, filters, null);
}

module.exports = {
  createExpense,
  getExpenseById,
  listExpenses
};
