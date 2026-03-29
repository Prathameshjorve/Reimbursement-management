const { execute } = require('./dbExecutor');

async function createCompany(data, connection) {
  const result = await execute(
    connection,
    `INSERT INTO companies (company_code, name, base_currency, country_code)
     VALUES (?, ?, ?, ?)`,
    [data.companyCode, data.name, data.baseCurrency, data.countryCode || null]
  );

  return result.insertId;
}

async function findByCode(companyCode, connection) {
  const rows = await execute(
    connection,
    `SELECT id, company_code, name, base_currency, country_code, is_active
     FROM companies
     WHERE company_code = ?`,
    [companyCode]
  );

  return rows[0] || null;
}

async function findById(companyId, connection) {
  const rows = await execute(
    connection,
    `SELECT id, company_code, name, base_currency, country_code, is_active
     FROM companies
     WHERE id = ?`,
    [companyId]
  );

  return rows[0] || null;
}

module.exports = {
  createCompany,
  findByCode,
  findById
};
