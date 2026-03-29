const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const env = require('../config/env');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json(result);
});

const googleCallback = asyncHandler(async (req, res) => {
  const payload = req.oauthPayload;
  const result = await authService.googleOAuthLogin(payload, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  const query = new URLSearchParams({
    token: result.token,
    user: JSON.stringify(result.user)
  });

  res.redirect(`${env.frontend.baseUrl}/index.html?${query.toString()}`);
});

function googleFailure(req, res) {
  res.redirect(`${env.frontend.baseUrl}/index.html?oauthError=google_auth_failed`);
}

module.exports = {
  register,
  login,
  googleCallback,
  googleFailure
};
