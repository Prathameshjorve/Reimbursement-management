const app = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');

async function start() {
  try {
    // Check DB connection
    const connection = await pool.getConnection();
    connection.release();

    console.log("Connected to MySQL ✅");

    app.listen(env.port, () => {
      console.log(`Backend listening on port ${env.port}`);
    });

  } catch (error) {
    console.error('Failed to initialize server:', error.message);
    process.exit(1);
  }
}

start();