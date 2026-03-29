const express = require('express');
const approvalController = require('../controllers/approvalController');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');

const router = express.Router();

router.use(requireAuth);
router.post('/action', requireRoles('admin', 'manager'), approvalController.actionApproval);
router.get('/pending', requireRoles('admin', 'manager'), approvalController.listPendingApprovals);

module.exports = router;
