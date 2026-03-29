/* eslint-disable no-console */
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

const TEST_PASSWORD = 'Test@1234';

async function insertUser(connection, data) {
  const [result] = await connection.execute(
    `INSERT INTO users
      (company_id, email, password_hash, auth_provider, first_name, last_name, role, manager_user_id, is_active)
     VALUES (?, ?, ?, 'local', ?, ?, ?, ?, 1)`,
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

async function resetAndSeed() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      "ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'manager', 'employee', 'finance', 'director') NOT NULL"
    );

    await connection.query('DELETE FROM expense_approvals');
    await connection.query('DELETE FROM expenses');
    await connection.query('DELETE FROM workflow_step_approvers');
    await connection.query('DELETE FROM workflow_steps');
    await connection.query('DELETE FROM workflows');
    await connection.query('DELETE FROM audit_logs');
    await connection.query('DELETE FROM currency_rates_cache');
    await connection.query('DELETE FROM users');
    await connection.query('DELETE FROM companies');

    const [companyOneResult] = await connection.execute(
      `INSERT INTO companies
        (company_code, name, base_currency, country_code, is_active)
       VALUES ('TEST01', 'Test Company One', 'USD', 'US', 1)`
    );
    const companyOneId = companyOneResult.insertId;

    await connection.execute(
      `INSERT INTO companies
        (company_code, name, base_currency, country_code, is_active)
       VALUES ('TEST02', 'Test Company Two', 'USD', 'US', 1)`
    );

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

    const adminId = await insertUser(connection, {
      companyId: companyOneId,
      email: 'admin@test01.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'One',
      role: 'admin'
    });

    const managerId = await insertUser(connection, {
      companyId: companyOneId,
      email: 'manager@test01.com',
      passwordHash,
      firstName: 'Manager',
      lastName: 'One',
      role: 'manager'
    });

    const financeId = await insertUser(connection, {
      companyId: companyOneId,
      email: 'finance@test01.com',
      passwordHash,
      firstName: 'Finance',
      lastName: 'One',
      role: 'finance'
    });

    const directorId = await insertUser(connection, {
      companyId: companyOneId,
      email: 'director@test01.com',
      passwordHash,
      firstName: 'Director',
      lastName: 'One',
      role: 'director'
    });

    const employeeOneId = await insertUser(connection, {
      companyId: companyOneId,
      email: 'employee1@test01.com',
      passwordHash,
      firstName: 'Employee',
      lastName: 'One',
      role: 'employee',
      managerUserId: managerId
    });

    const employeeTwoId = await insertUser(connection, {
      companyId: companyOneId,
      email: 'employee2@test01.com',
      passwordHash,
      firstName: 'Employee',
      lastName: 'Two',
      role: 'employee',
      managerUserId: managerId
    });

    await connection.commit();

    console.log('Database reset completed successfully.');
    console.log('Created companies: TEST01, TEST02');
    console.log('All users are in company TEST01 with password:', TEST_PASSWORD);
    console.log('admin:', adminId, 'admin@test01.com');
    console.log('manager:', managerId, 'manager@test01.com');
    console.log('finance:', financeId, 'finance@test01.com');
    console.log('director:', directorId, 'director@test01.com');
    console.log('employee1:', employeeOneId, 'employee1@test01.com');
    console.log('employee2:', employeeTwoId, 'employee2@test01.com');
  } catch (error) {
    await connection.rollback();
    console.error('Reset failed:', error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

resetAndSeed();