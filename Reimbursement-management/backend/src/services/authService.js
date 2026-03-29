const bcrypt = require('bcrypt');
const { withTransaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const { signToken } = require('../utils/jwt');
const companyModel = require('../models/companyModel');
const userModel = require('../models/userModel');
const auditService = require('./auditService');

const ALLOWED_ROLES = new Set(['admin', 'manager', 'employee', 'finance', 'director']);

async function register(payload, meta) {
  const {
    companyCode,
    companyName,
    baseCurrency,
    countryCode,
    firstName,
    lastName,
    email,
    password,
    role,
    managerUserId
  } = payload;

  if (!companyCode || !firstName || !lastName || !email || !password) {
    throw new HttpError(400, 'Missing required registration fields');
  }

  return withTransaction(async (connection) => {
    let isNewCompany = false;
    let company = await companyModel.findByCode(companyCode, connection);

    if (!company) {
      if (!companyName || !baseCurrency) {
        throw new HttpError(400, 'companyName and baseCurrency are required for new company');
      }

      const companyId = await companyModel.createCompany(
        {
          companyCode,
          name: companyName,
          baseCurrency: String(baseCurrency).toUpperCase(),
          countryCode: countryCode ? String(countryCode).toUpperCase() : null
        },
        connection
      );
      company = await companyModel.findById(companyId, connection);
      isNewCompany = true;
    }

    const resolvedRole = role ? String(role).toLowerCase() : (isNewCompany ? 'admin' : 'employee');
    if (!ALLOWED_ROLES.has(resolvedRole)) {
      throw new HttpError(400, 'Invalid role');
    }

    const existing = await userModel.findByCompanyAndEmail(company.id, email, connection);
    if (existing) {
      throw new HttpError(409, 'User email already exists for this company');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await userModel.createUser(
      {
        companyId: company.id,
        email,
        passwordHash,
        firstName,
        lastName,
        role: resolvedRole,
        managerUserId: managerUserId || null
      },
      connection
    );

    await auditService.record(
      {
        companyId: company.id,
        actorUserId: userId,
        entityType: 'auth',
        entityId: userId,
        action: 'USER_REGISTERED',
        newValues: { email, role: resolvedRole },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      },
      connection
    );

    const token = signToken({ sub: userId, companyId: company.id, role: resolvedRole });

    return {
      token,
      user: {
        id: userId,
        companyId: company.id,
        companyCode: company.company_code,
        email,
        firstName,
        lastName,
        role: resolvedRole
      }
    };
  });
}

async function login(payload, meta) {
  const { companyCode, email, password } = payload;

  if (!email || !password) {
    throw new HttpError(400, 'email and password are required');
  }

  let company = null;
  let user = null;

  if (companyCode) {
    company = await companyModel.findByCode(companyCode, null);
    if (!company) {
      throw new HttpError(401, 'Invalid credentials');
    }
    user = await userModel.findByCompanyAndEmail(company.id, email, null);
  } else {
    const matches = await userModel.findByEmailGlobal(email, null);
    if (matches.length !== 1) {
      throw new HttpError(400, 'companyCode is required for this email');
    }

    user = matches[0];
    company = { id: user.company_id, company_code: user.company_code };
  }

  if (!user || !user.is_active) {
    throw new HttpError(401, 'Invalid credentials');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new HttpError(401, 'Invalid credentials');
  }

  await userModel.updateLastLogin(user.id, null);

  await auditService.record(
    {
      companyId: company.id,
      actorUserId: user.id,
      entityType: 'auth',
      entityId: user.id,
      action: 'USER_LOGIN',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent
    },
    null
  );

  const token = signToken({ sub: user.id, companyId: company.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      companyId: company.id,
      companyCode: company.company_code,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    }
  };
}

module.exports = {
  register,
  login
};
