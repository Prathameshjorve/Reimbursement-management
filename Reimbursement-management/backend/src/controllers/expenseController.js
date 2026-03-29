const asyncHandler = require('../utils/asyncHandler');
const expenseService = require('../services/expenseService');

const createExpense = asyncHandler(async (req, res) => {
  const result = await expenseService.createExpense(req.auth, req.body, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json(result);
});

const listExpenses = asyncHandler(async (req, res) => {
  const result = await expenseService.listExpenses(req.auth, req.query);
  res.status(200).json(result);
});

const getExpenseById = asyncHandler(async (req, res) => {
  const result = await expenseService.getExpenseById(req.auth, Number(req.params.id));
  res.status(200).json(result);
});

module.exports = {
  createExpense,
  listExpenses,
  getExpenseById
};
