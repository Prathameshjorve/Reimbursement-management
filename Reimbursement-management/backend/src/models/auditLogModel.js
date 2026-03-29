const { execute } = require('./dbExecutor');

async function createAuditLog(data, connection) {
  await execute(
    connection,
    `INSERT INTO audit_logs
     (company_id, actor_user_id, entity_type, entity_id, action, old_values, new_values, metadata, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.companyId,
      data.actorUserId || null,
      data.entityType,
      data.entityId || null,
      data.action,
      data.oldValues ? JSON.stringify(data.oldValues) : null,
      data.newValues ? JSON.stringify(data.newValues) : null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      data.ipAddress || null,
      data.userAgent || null
    ]
  );
}

module.exports = {
  createAuditLog
};
