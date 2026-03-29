const { pool } = require('../config/db');

async function execute(connection, sql, params = []) {
  const executor = connection || pool;
  const [rows] = await executor.execute(sql, params);
  return rows;
}

module.exports = {
  execute
};
