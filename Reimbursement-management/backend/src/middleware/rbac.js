const HttpError = require('../utils/httpError');

function requireRoles(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.auth) {
      return next(new HttpError(401, 'Authentication required'));
    }

    if (!roles.includes(req.auth.role)) {
      return next(new HttpError(403, 'Forbidden for this role'));
    }

    return next();
  };
}

module.exports = {
  requireRoles
};
