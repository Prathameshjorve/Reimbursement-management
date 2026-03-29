const express = require('express');
const authController = require('../controllers/authController');
const HttpError = require('../utils/httpError');
const { passport } = require('../config/passport');
const env = require('../config/env');

const router = express.Router();

function ensureGoogleConfigured(req, res, next) {
	if (!env.google.clientId || !env.google.clientSecret) {
		return next(new HttpError(503, 'Google OAuth is not configured'));
	}

	return next();
}

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/google', ensureGoogleConfigured, (req, res, next) => {
	const statePayload = {
		companyCode: req.query.companyCode || '',
		role: req.query.role || 'employee'
	};
	const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

	return passport.authenticate('google', {
		scope: ['profile', 'email'],
		session: false,
		state
	})(req, res, next);
});

router.get('/google/callback', ensureGoogleConfigured, (req, res, next) => {
	passport.authenticate('google', { session: false }, (error, payload) => {
		if (error || !payload) {
			return authController.googleFailure(req, res);
		}

		req.oauthPayload = payload;
		return authController.googleCallback(req, res, next);
	})(req, res, next);
});

module.exports = router;
