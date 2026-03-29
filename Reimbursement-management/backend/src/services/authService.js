const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { withTransaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const { signToken } = require('../utils/jwt');
const env = require('../config/env');
const companyModel = require('../models/companyModel');
const userModel = require('../models/userModel');
const auditService = require('./auditService');
const {
  EMAIL_REGEX,
  COMPANY_CODE_REGEX,
  CURRENCY_CODE_REGEX,
  COUNTRY_CODE_REGEX,
  VALID_ROLES,
  normalizeString,
  normalizeEmail,
  normalizeUppercase,
  isPositiveInteger
} = require('../utils/validation');

function decodeOAuthState(state) {
  if (!state) {
    return {};
  }

  try {
    const text = Buffer.from(String(state), 'base64url').toString('utf8');
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function deriveCompanyCodeFromEmail(email) {
  const domain = String(email).split('@')[1] || 'ORG';
  const code = domain.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  return code || 'ORG001';
}

function makeAutoCompanyName(email) {
  const domain = String(email).split('@')[1] || 'Company';
  const root = domain.split('.')[0] || 'Company';
  return `${root.charAt(0).toUpperCase()}${root.slice(1)} Reimbursement`;
}

function makeRandomPassword() {
  return `oauth_${crypto.randomBytes(16).toString('hex')}`;
}

async function register(payload, meta) {
  const companyCode = normalizeUppercase(payload.companyCode);
  const companyName = normalizeString(payload.companyName);
  const baseCurrency = normalizeUppercase(payload.baseCurrency);
  const countryCode = payload.countryCode ? normalizeUppercase(payload.countryCode) : null;
  const firstName = normalizeString(payload.firstName);
  const lastName = normalizeString(payload.lastName);
  const email = normalizeEmail(payload.email);
  const password = typeof payload.password === 'string' ? payload.password : '';
  const role = payload.role ? normalizeString(payload.role).toLowerCase() : null;
  const managerUserId = payload.managerUserId === undefined || payload.managerUserId === null
    ? null
    : Number(payload.managerUserId);

  if (!companyCode || !firstName || !lastName || !email || !password) {
    throw new HttpError(400, 'Please fill in company code, name, email, and password');
  }

  if (!COMPANY_CODE_REGEX.test(companyCode)) {
    throw new HttpError(400, 'Company code must be 2-20 characters using only letters and numbers');
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, 'Please enter a valid email address');
  }

  if (password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters long');
  }

  if (firstName.length > 80 || lastName.length > 80) {
    throw new HttpError(400, 'First name and last name must be 80 characters or less');
  }

  if (role && !VALID_ROLES.includes(role)) {
    throw new HttpError(400, 'Role must be one of admin, manager, employee, finance, or director');
  }

  if (managerUserId !== null && !isPositiveInteger(managerUserId)) {
    throw new HttpError(400, 'Manager user ID must be a positive integer');
  }

  return withTransaction(async (connection) => {
    let isNewCompany = false;
    let company = await companyModel.findByCode(companyCode, connection);

    if (!company) {
      if (!companyName || !baseCurrency) {
        throw new HttpError(400, 'companyName and baseCurrency are required for new company');
      }

      if (companyName.length > 150) {
        throw new HttpError(400, 'Company name must be 150 characters or less');
      }

      if (!CURRENCY_CODE_REGEX.test(baseCurrency)) {
        throw new HttpError(400, 'Base currency must be a valid 3-letter currency code');
      }

      if (countryCode && !COUNTRY_CODE_REGEX.test(countryCode)) {
        throw new HttpError(400, 'Country code must be a valid 2-letter code');
      }

      if (managerUserId !== null) {
        throw new HttpError(400, 'Manager cannot be assigned while creating a new company');
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

    const resolvedRole = role || (isNewCompany ? 'admin' : 'employee');
    if (isNewCompany && resolvedRole !== 'admin') {
      throw new HttpError(400, 'The first user for a company must be an admin');
    }

    const existing = await userModel.findByCompanyAndEmail(company.id, email, connection);
    if (existing) {
      throw new HttpError(409, 'User email already exists for this company');
    }

    if (managerUserId !== null) {
      const manager = await userModel.findById(managerUserId, connection);
      if (!manager || manager.company_id !== company.id || !manager.is_active) {
        throw new HttpError(400, 'Selected manager was not found in this company');
      }
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
        baseCurrency: company.base_currency,
        email,
        firstName,
        lastName,
        role: resolvedRole
      }
    };
  });
}

async function login(payload, meta) {
  const companyCode = payload.companyCode ? normalizeUppercase(payload.companyCode) : '';
  const email = normalizeEmail(payload.email);
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!email || !password) {
    throw new HttpError(400, 'Please enter both email and password');
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, 'Please enter a valid email address');
  }

  if (companyCode && !COMPANY_CODE_REGEX.test(companyCode)) {
    throw new HttpError(400, 'Company code must be 2-20 characters using only letters and numbers');
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
    company = await companyModel.findById(user.company_id, null);
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
      baseCurrency: company.base_currency,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    }
  };
}

async function googleOAuthLogin(oauthPayload, meta) {
  const profile = oauthPayload && oauthPayload.profile ? oauthPayload.profile : null;
  if (!profile || !profile.id) {
    throw new HttpError(401, 'Google profile information is missing');
  }

  const emailObj = Array.isArray(profile.emails)
    ? profile.emails.find((item) => item && item.value)
    : null;
  const email = normalizeEmail(emailObj ? emailObj.value : '');
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new HttpError(400, 'Google account does not expose a valid email');
  }

  const state = decodeOAuthState(oauthPayload.authState);
  const requestedCompanyCode = state.companyCode ? normalizeUppercase(state.companyCode) : '';
  const requestedRole = state.role ? normalizeString(state.role).toLowerCase() : 'employee';
  const roleFromState = VALID_ROLES.includes(requestedRole) ? requestedRole : 'employee';

  return withTransaction(async (connection) => {
    let company = null;
    let user = null;

    if (requestedCompanyCode) {
      company = await companyModel.findByCode(requestedCompanyCode, connection);
      if (company) {
        user = await userModel.findByGoogleIdForCompany(company.id, profile.id, connection);
        if (!user) {
          user = await userModel.findByCompanyAndEmail(company.id, email, connection);
        }
      }
    }

    if (!user) {
      const byGoogleGlobal = await userModel.findByGoogleIdGlobal(profile.id, connection);
      if (byGoogleGlobal.length === 1) {
        user = byGoogleGlobal[0];
        company = { id: user.company_id, company_code: user.company_code };
      }
    }

    if (!user) {
      const byEmailGlobal = await userModel.findByEmailGlobal(email, connection);
      if (byEmailGlobal.length === 1) {
        user = byEmailGlobal[0];
        company = { id: user.company_id, company_code: user.company_code };
      }
    }

    let isNewCompany = false;
    if (!company) {
      const resolvedCode = requestedCompanyCode || deriveCompanyCodeFromEmail(email);
      company = await companyModel.findByCode(resolvedCode, connection);

      if (!company) {
        const companyId = await companyModel.createCompany(
          {
            companyCode: resolvedCode,
            name: makeAutoCompanyName(email),
            baseCurrency: 'USD',
            countryCode: null
          },
          connection
        );
        company = await companyModel.findById(companyId, connection);
        isNewCompany = true;
      }
    }

    if (!user) {
      const role = isNewCompany ? 'admin' : (roleFromState === 'admin' ? 'employee' : roleFromState);
      const firstName = normalizeString(profile.name && profile.name.givenName ? profile.name.givenName : '') || 'Google';
      const lastName = normalizeString(profile.name && profile.name.familyName ? profile.name.familyName : '') || 'User';
      const passwordHash = await bcrypt.hash(makeRandomPassword(), 12);

      const userId = await userModel.createUser(
        {
          companyId: company.id,
          email,
          passwordHash,
          googleId: profile.id,
          authProvider: 'google',
          firstName,
          lastName,
          role,
          managerUserId: null
        },
        connection
      );

      user = await userModel.findById(userId, connection);

      await auditService.record(
        {
          companyId: company.id,
          actorUserId: user.id,
          entityType: 'auth',
          entityId: user.id,
          action: 'USER_REGISTERED_GOOGLE',
          newValues: { email, role },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent
        },
        connection
      );
    } else if (!user.google_id) {
      await userModel.setGoogleIdentity(user.id, profile.id, connection);
      user = await userModel.findById(user.id, connection);
    }

    if (!user || !user.is_active) {
      throw new HttpError(401, 'User is not active');
    }

    await userModel.updateLastLogin(user.id, connection);

    await auditService.record(
      {
        companyId: company.id,
        actorUserId: user.id,
        entityType: 'auth',
        entityId: user.id,
        action: 'USER_LOGIN_GOOGLE',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { provider: 'google' }
      },
      connection
    );

    const token = signToken({ sub: user.id, companyId: company.id, role: user.role });

    return {
      token,
      user: {
        id: user.id,
        companyId: company.id,
        companyCode: company.company_code,
        baseCurrency: company.base_currency,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        authProvider: user.auth_provider || 'google'
      },
      redirectUrl: `${env.frontend.baseUrl}/index.html`
    };
  });
}

module.exports = {
  register,
  login,
  googleOAuthLogin
};
