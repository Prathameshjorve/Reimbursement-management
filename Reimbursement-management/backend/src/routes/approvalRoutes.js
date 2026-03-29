const express = require('express');
const approvalController = require('../controllers/approvalController');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');

const router = express.Router();

router.use(requireAuth);
router.post('/action', requireRoles('admin', 'manager', 'finance', 'director'), approvalController.actionApproval);
router.get('/pending', requireRoles('admin', 'manager', 'finance', 'director'), approvalController.listPendingApprovals);

module.exports = router;
