const express = require('express');
const expenseController = require('../controllers/expenseController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/', expenseController.createExpense);
router.get('/', expenseController.listExpenses);
router.get('/:id', expenseController.getExpenseById);

module.exports = router;
