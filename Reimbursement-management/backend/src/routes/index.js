const express = require('express');
const authRoutes = require('./authRoutes');
const expenseRoutes = require('./expenseRoutes');
const approvalRoutes = require('./approvalRoutes');
const workflowRoutes = require('./workflowRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/expenses', expenseRoutes);
router.use('/approvals', approvalRoutes);
router.use('/workflows', workflowRoutes);

module.exports = router;
