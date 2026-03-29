const auditLogModel = require('../models/auditLogModel');

async function record(data, connection) {
  await auditLogModel.createAuditLog(data, connection);
}

module.exports = {
  record
};
