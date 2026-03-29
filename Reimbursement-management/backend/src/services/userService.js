const bcrypt = require('bcrypt');
const { withTransaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const userModel = require('../models/userModel');
const auditService = require('./auditService');

const ALLOWED_ROLES = new Set(['employee', 'manager', 'finance', 'director', 'admin']);

function sanitizeUser(user) {
  return {
    id: user.id,
    companyId: user.company_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    managerUserId: user.manager_user_id,
    isActive: Boolean(user.is_active)
  };
}

async function createUser(auth, payload, meta) {
  if (auth.role !== 'admin') {
    throw new HttpError(403, 'Only admins can create users');
  }

  const required = ['firstName', 'lastName', 'email', 'password', 'role'];
  for (const field of required) {
    if (!payload[field]) {
      throw new HttpError(400, `Missing required field: ${field}`);
    }
  }

  const role = String(payload.role).toLowerCase();
  if (!ALLOWED_ROLES.has(role)) {
    throw new HttpError(400, 'Invalid role');
  }

  if (role === 'admin') {
    throw new HttpError(400, 'Use controlled onboarding flow for admin creation');
  }

  return withTransaction(async (connection) => {
    const existing = await userModel.findByCompanyAndEmail(auth.companyId, payload.email, connection);
    if (existing) {
      throw new HttpError(409, 'User email already exists for this company');
    }

    if (payload.managerUserId) {
      const manager = await userModel.findById(Number(payload.managerUserId), connection);
      if (!manager || manager.company_id !== auth.companyId) {
        throw new HttpError(400, 'Invalid managerUserId');
      }
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const userId = await userModel.createUser(
      {
        companyId: auth.companyId,
        email: payload.email,
        passwordHash,
        firstName: payload.firstName,
        lastName: payload.lastName,
        role,
        managerUserId: payload.managerUserId || null
      },
      connection
    );

    const created = await userModel.findById(userId, connection);

    await auditService.record(
      {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        entityType: 'user',
        entityId: userId,
        action: 'USER_CREATED',
        newValues: {
          email: payload.email,
          role,
          managerUserId: payload.managerUserId || null
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      },
      connection
    );

    return sanitizeUser(created);
  });
}

async function listUsers(auth) {
  if (auth.role === 'admin' || auth.role === 'director') {
    const users = await userModel.listUsers(auth.companyId, null);
    return users.map(sanitizeUser);
  }

  if (auth.role === 'manager') {
    const managedUserIds = await userModel.getManagedUserIds(auth.companyId, auth.userId, null);
    const ids = [auth.userId, ...managedUserIds];
    const users = await userModel.listUsersByIds(auth.companyId, ids, null);
    return users.map(sanitizeUser);
  }

  const user = await userModel.findById(auth.userId, null);
  return user ? [sanitizeUser(user)] : [];
}

module.exports = {
  createUser,
  listUsers
};
