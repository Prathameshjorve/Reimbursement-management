const { verifyToken } = require('../utils/jwt');
const HttpError = require('../utils/httpError');
const userModel = require('../models/userModel');

async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Missing or invalid authorization token'));
  }

  try {
    const payload = verifyToken(token);
    const user = await userModel.findById(payload.sub);

    if (!user || !user.is_active) {
      return next(new HttpError(401, 'User is not active'));
    }

    req.auth = {
      userId: user.id,
      companyId: user.company_id,
      role: user.role,
      email: user.email,
      fullName: `${user.first_name} ${user.last_name}`
    };

    return next();
  } catch (error) {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
}

module.exports = {
  requireAuth
};
