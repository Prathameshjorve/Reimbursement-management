const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const env = require('./env');

function configurePassport() {
  if (!env.google.clientId || !env.google.clientSecret) {
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.google.clientId,
        clientSecret: env.google.clientSecret,
        callbackURL: env.google.callbackUrl,
        passReqToCallback: true
      },
      (req, accessToken, refreshToken, profile, done) => {
        return done(null, {
          profile,
          authState: req.query && req.query.state ? req.query.state : null
        });
      }
    )
  );

  return passport;
}

module.exports = {
  configurePassport,
  passport
};
