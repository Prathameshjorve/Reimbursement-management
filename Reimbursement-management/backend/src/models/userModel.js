const { execute } = require('./dbExecutor');

async function createUser(data, connection) {
  const result = await execute(
    connection,
    `INSERT INTO users
     (company_id, email, password_hash, first_name, last_name, role, manager_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.companyId,
      data.email,
      data.passwordHash,
      data.firstName,
      data.lastName,
      data.role,
      data.managerUserId || null
    ]
  );

  return result.insertId;
}

async function findByCompanyAndEmail(companyId, email, connection) {
  const rows = await execute(
    connection,
    `SELECT id, company_id, email, password_hash, first_name, last_name, role, manager_user_id, is_active
     FROM users
     WHERE company_id = ? AND email = ?`,
    [companyId, email]
  );

  return rows[0] || null;
}

async function findById(userId, connection) {
  const rows = await execute(
    connection,
    `SELECT id, company_id, email, password_hash, first_name, last_name, role, manager_user_id, is_active
     FROM users
     WHERE id = ?`,
    [userId]
  );

  return rows[0] || null;
}

async function findByIdsForCompany(companyId, userIds, connection) {
  if (!userIds.length) {
    return [];
  }

  const placeholders = userIds.map(() => '?').join(', ');
  return execute(
    connection,
    `SELECT id, company_id, email, first_name, last_name, role, manager_user_id, is_active
     FROM users
     WHERE company_id = ? AND id IN (${placeholders})`,
    [companyId, ...userIds]
  );
}

async function updateLastLogin(userId, connection) {
  await execute(
    connection,
    'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
    [userId]
  );
}

async function findByEmailGlobal(email, connection) {
  const rows = await execute(
    connection,
    `SELECT u.id, u.company_id, u.email, u.password_hash, u.first_name, u.last_name,
            u.role, u.manager_user_id, u.is_active, c.company_code
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     WHERE u.email = ?`,
    [email]
  );

  return rows;
}

module.exports = {
  createUser,
  findByCompanyAndEmail,
  findById,
  findByIdsForCompany,
  updateLastLogin,
  findByEmailGlobal
};
