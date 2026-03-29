const asyncHandler = require('../utils/asyncHandler');
const userService = require('../services/userService');

const createUser = asyncHandler(async (req, res) => {
  const result = await userService.createUser(req.auth, req.body, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json(result);
});

const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.auth);
  res.status(200).json(result);
});

module.exports = {
  createUser,
  listUsers
};
