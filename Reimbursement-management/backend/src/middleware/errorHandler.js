const HttpError = require('../utils/httpError');

function notFoundHandler(req, res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const body = {
    message: err.message || 'Internal server error'
  };

  if (err.details) {
    body.details = err.details;
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Duplicate record conflict' });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ message: 'Invalid reference provided' });
  }

  return res.status(statusCode).json(body);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
