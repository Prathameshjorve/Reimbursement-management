const express = require('express');
const authRoutes = require('./authRoutes');
const expenseRoutes = require('./expenseRoutes');
const approvalRoutes = require('./approvalRoutes');
const workflowRoutes = require('./workflowRoutes');
const userRoutes = require('./userRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/expenses', expenseRoutes);
router.use('/approvals', approvalRoutes);
router.use('/workflows', workflowRoutes);
router.use('/users', userRoutes);

module.exports = router;
