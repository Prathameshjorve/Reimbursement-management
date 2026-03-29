const express = require('express');
const workflowController = require('../controllers/workflowController');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');

const router = express.Router();

router.use(requireAuth);
router.post('/', requireRoles('admin'), workflowController.createWorkflow);
router.get('/', requireRoles('admin'), workflowController.listWorkflows);

module.exports = router;
