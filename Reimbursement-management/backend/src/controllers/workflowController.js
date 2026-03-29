const asyncHandler = require('../utils/asyncHandler');
const workflowService = require('../services/workflowService');

const createWorkflow = asyncHandler(async (req, res) => {
  const result = await workflowService.createWorkflow(req.auth, req.body, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json(result);
});

const listWorkflows = asyncHandler(async (req, res) => {
  const result = await workflowService.listWorkflows(req.auth);
  res.status(200).json(result);
});

module.exports = {
  createWorkflow,
  listWorkflows
};
