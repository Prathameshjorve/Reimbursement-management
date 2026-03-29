const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPANY_CODE_REGEX = /^[A-Z0-9]{2,20}$/;
const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const VALID_ROLES = ['admin', 'manager', 'employee', 'finance', 'director'];
const VALID_EXPENSE_CATEGORIES = ['travel', 'food', 'accommodation', 'transport', 'supplies', 'other'];
const VALID_WORKFLOW_CATEGORIES = ['all', ...VALID_EXPENSE_CATEGORIES];
const VALID_APPROVAL_MODES = ['SEQUENTIAL', 'PERCENTAGE', 'SPECIFIC_OVERRIDE', 'HYBRID'];
const VALID_STEP_TYPES = ['ANY_OF', 'ALL_OF', 'PERCENTAGE'];

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeUppercase(value) {
  return normalizeString(value).toUpperCase();
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function isValidIsoDate(value) {
  if (!ISO_DATE_REGEX.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = {
  EMAIL_REGEX,
  COMPANY_CODE_REGEX,
  CURRENCY_CODE_REGEX,
  COUNTRY_CODE_REGEX,
  VALID_ROLES,
  VALID_EXPENSE_CATEGORIES,
  VALID_WORKFLOW_CATEGORIES,
  VALID_APPROVAL_MODES,
  VALID_STEP_TYPES,
  normalizeString,
  normalizeEmail,
  normalizeUppercase,
  isPositiveInteger,
  isPositiveNumber,
  isValidIsoDate
};
