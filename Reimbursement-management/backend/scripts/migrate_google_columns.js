require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'reimbursement_db'
  });

  const [rows] = await connection.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
  );
  const columns = new Set(rows.map((r) => r.COLUMN_NAME));

  if (!columns.has('google_id')) {
    await connection.query('ALTER TABLE users ADD COLUMN google_id VARCHAR(191) NULL AFTER password_hash');
    console.log('Added column: google_id');
  } else {
    console.log('Column exists: google_id');
  }

  if (!columns.has('auth_provider')) {
    await connection.query("ALTER TABLE users ADD COLUMN auth_provider ENUM('local','google') NOT NULL DEFAULT 'local' AFTER google_id");
    console.log('Added column: auth_provider');
  } else {
    console.log('Column exists: auth_provider');
  }

  const [idxRows] = await connection.query(
    "SELECT COUNT(1) AS c FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_company_google'"
  );

  if (Number(idxRows[0].c) === 0) {
    await connection.query('ALTER TABLE users ADD CONSTRAINT uq_users_company_google UNIQUE (company_id, google_id)');
    console.log('Added unique key: uq_users_company_google');
  } else {
    console.log('Index exists: uq_users_company_google');
  }

  await connection.end();
}

run().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
