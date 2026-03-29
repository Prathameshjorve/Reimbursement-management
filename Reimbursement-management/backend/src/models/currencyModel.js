const { execute } = require('./dbExecutor');

async function getValidRate(companyId, baseCurrency, targetCurrency, rateDate, connection) {
  const rows = await execute(
    connection,
    `SELECT rate, fetched_at, expires_at
     FROM currency_rates_cache
     WHERE company_id <=> ?
       AND base_currency = ?
       AND target_currency = ?
       AND rate_date = ?
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY fetched_at DESC
     LIMIT 1`,
    [companyId, baseCurrency, targetCurrency, rateDate]
  );

  return rows[0] || null;
}

async function upsertRate(data, connection) {
  await execute(
    connection,
    `INSERT INTO currency_rates_cache
     (company_id, base_currency, target_currency, rate_date, rate, rate_source, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rate = VALUES(rate),
       rate_source = VALUES(rate_source),
       fetched_at = CURRENT_TIMESTAMP,
       expires_at = VALUES(expires_at)`,
    [
      data.companyId || null,
      data.baseCurrency,
      data.targetCurrency,
      data.rateDate,
      data.rate,
      data.rateSource || 'manual',
      data.expiresAt
    ]
  );
}

module.exports = {
  getValidRate,
  upsertRate
};
