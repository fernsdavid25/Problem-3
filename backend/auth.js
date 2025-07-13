const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// --- In-memory store for user profiles and tokens for this demo ---
// In a production app, use a proper database (e.g., PostgreSQL, Redis).
const userStore = new Map();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar']
  },
  function(accessToken, refreshToken, profile, done) {
    // This function is called after a successful authentication.
    // We save the user's profile, access token, and refresh token.
    const user = {
      id: profile.id,
      displayName: profile.displayName,
      email: profile.emails[0].value,
      accessToken,
      refreshToken
    };
    userStore.set(profile.id, user);
    return done(null, user);
  }
));

// --- Session Management ---

// Serializing user information to store in the session.
// We only store the user's Google ID to keep the session lightweight.
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

// Deserializing user information from the session.
// We use the stored ID to retrieve the full user object.
passport.deserializeUser(function(id, done) {
  const user = userStore.get(id);
  done(null, user);
});

module.exports = { passport, userStore }; 