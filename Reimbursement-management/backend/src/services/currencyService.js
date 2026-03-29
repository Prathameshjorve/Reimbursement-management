const env = require('../config/env');
const currencyModel = require('../models/currencyModel');

const fallbackRates = {
  USD_INR: 83,
  EUR_INR: 90,
  GBP_INR: 105,
  INR_USD: 0.012,
  INR_EUR: 0.011,
  INR_GBP: 0.0095
};

function addMinutes(date, minutes) {
  const output = new Date(date);
  output.setMinutes(output.getMinutes() + minutes);
  return output;
}

async function fetchLiveRate(baseCurrency, targetCurrency) {
  if (baseCurrency === targetCurrency) {
    return 1;
  }

  const pair = `${baseCurrency}_${targetCurrency}`;
  if (fallbackRates[pair]) {
    return fallbackRates[pair];
  }

  const response = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
  if (!response.ok) {
    throw new Error('Currency provider unavailable');
  }

  const payload = await response.json();
  if (!payload.rates || !payload.rates[targetCurrency]) {
    throw new Error('Unsupported currency pair');
  }

  return Number(payload.rates[targetCurrency]);
}

async function getExchangeRate(companyId, originalCurrency, targetCurrency, rateDate, connection) {
  if (originalCurrency === targetCurrency) {
    return { rate: 1, source: 'identity' };
  }

  const normalizedDate = rateDate;
  const cached = await currencyModel.getValidRate(
    companyId,
    originalCurrency,
    targetCurrency,
    normalizedDate,
    connection
  );

  if (cached) {
    return { rate: Number(cached.rate), source: 'cache' };
  }

  let rate = null;
  let source = 'live';
  try {
    rate = await fetchLiveRate(originalCurrency, targetCurrency);
  } catch (error) {
    const pair = `${originalCurrency}_${targetCurrency}`;
    if (!fallbackRates[pair]) {
      throw error;
    }

    rate = fallbackRates[pair];
    source = 'fallback';
  }

  await currencyModel.upsertRate(
    {
      companyId,
      baseCurrency: originalCurrency,
      targetCurrency,
      rateDate: normalizedDate,
      rate,
      rateSource: source,
      expiresAt: addMinutes(new Date(), env.currencyRateTtlMinutes)
    },
    connection
  );

  return { rate: Number(rate), source };
}

module.exports = {
  getExchangeRate
};
