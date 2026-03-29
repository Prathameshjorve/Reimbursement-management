const { pool } = require('../src/config/db');

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log('Applying expense receipt migration...');

    const [columns] = await connection.query('SHOW COLUMNS FROM expenses');
    const hasReceiptDataUrl = columns.some((col) => col.Field === 'receipt_data_url');
    const hasReceiptFileName = columns.some((col) => col.Field === 'receipt_file_name');

    if (!hasReceiptDataUrl) {
      await connection.query('ALTER TABLE expenses ADD COLUMN receipt_data_url LONGTEXT NULL AFTER description');
      console.log('Added column: receipt_data_url');
    }

    if (!hasReceiptFileName) {
      await connection.query('ALTER TABLE expenses ADD COLUMN receipt_file_name VARCHAR(255) NULL AFTER receipt_data_url');
      console.log('Added column: receipt_file_name');
    }

    console.log('Migration complete.');
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
