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
    const sqlMessage = String(err.sqlMessage || '');

    if (sqlMessage.includes('uq_companies_code')) {
      return res.status(409).json({ message: 'That company code is already in use' });
    }

    if (sqlMessage.includes('uq_users_company_email')) {
      return res.status(409).json({ message: 'That email is already registered for this company' });
    }

    if (sqlMessage.includes('uq_workflows_name_version')) {
      return res.status(409).json({ message: 'A workflow with this name already exists' });
    }

    if (sqlMessage.includes('uq_workflow_steps_order')) {
      return res.status(409).json({ message: 'Workflow step order must be unique' });
    }

    if (sqlMessage.includes('uq_step_approver')) {
      return res.status(409).json({ message: 'That approver is already assigned to this step' });
    }

    if (sqlMessage.includes('uq_expense_step_approver')) {
      return res.status(409).json({ message: 'You have already acted on this expense step' });
    }

    return res.status(409).json({ message: 'Duplicate record conflict' });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    const sqlMessage = String(err.sqlMessage || '');

    if (sqlMessage.includes('fk_users_manager')) {
      return res.status(400).json({ message: 'Selected manager was not found' });
    }

    if (sqlMessage.includes('fk_step_approvers_user') || sqlMessage.includes('fk_workflows_override_user')) {
      return res.status(400).json({ message: 'Selected approver was not found in this company' });
    }

    return res.status(400).json({ message: 'Invalid reference provided' });
  }

  return res.status(statusCode).json(body);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
