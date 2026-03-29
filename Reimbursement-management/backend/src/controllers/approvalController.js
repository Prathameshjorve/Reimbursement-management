const asyncHandler = require('../utils/asyncHandler');
const approvalService = require('../services/approvalService');

const actionApproval = asyncHandler(async (req, res) => {
  const result = await approvalService.actionApproval(req.auth, req.body, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json(result);
});

const listPendingApprovals = asyncHandler(async (req, res) => {
  const result = await approvalService.listPendingForApprover(req.auth);
  res.status(200).json(result);
});

module.exports = {
  actionApproval,
  listPendingApprovals
};
