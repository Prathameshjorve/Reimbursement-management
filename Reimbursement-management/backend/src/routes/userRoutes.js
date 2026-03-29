const express = require('express');
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');

const router = express.Router();

router.use(requireAuth);
router.get('/', requireRoles('admin', 'director', 'manager', 'employee', 'finance'), userController.listUsers);
router.post('/', requireRoles('admin'), userController.createUser);

module.exports = router;
