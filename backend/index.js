require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { passport } = require('./auth'); // Import the configured passport
const { getAuthenticatedClient, getCalendar, listEvents } = require('./calendar');

// --- In-memory store for active SSE client connections ---
// In a production app, this might be managed by a separate service or a more robust pub/sub system.
const sseClients = new Map();
// In-memory store to map Google's channel ID to our user ID
const channelUserMap = new Map();

const app = express();
const port = 3001;

// --- Middleware Setup ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_super_secret_session_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json()); // Middleware to parse JSON bodies, needed for webhook handler

// Middleware to check if the user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Not authenticated' });
}

// --- Server-Sent Events (SSE) Route ---
app.get('/api/events/sse', ensureAuthenticated, (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Flush the headers to establish the connection

  const userId = req.user.id;
  sseClients.set(userId, res);
  console.log(`User ${userId} connected for SSE.`);

  // Send a welcome message
  res.write('data: {"message":"Connection established"}\n\n');

  // Handle client disconnect
  req.on('close', () => {
    sseClients.delete(userId);
    console.log(`User ${userId} disconnected from SSE.`);
    res.end();
  });
});

// --- Webhook Notification Handler ---
// Google sends a POST request to this endpoint when a calendar event changes.
app.post('/api/notifications', (req, res) => {
  console.log('Received Google Calendar notification:');
  // Log headers for debugging, as they contain the channel and resource info.
  console.log('Headers:', req.headers);

  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];

  if (resourceState === 'sync') {
    // This is the initial sync notification from Google after setting up the watch.
    // We don't need to do anything here, just acknowledge it.
    console.log(`Sync notification received for channel: ${channelId}`);
  } else {
    // This is a notification about a change (add, update, delete).
    const userId = channelUserMap.get(channelId);

    if (userId && sseClients.has(userId)) {
      console.log(`Notifying user ${userId} of a calendar update.`);
      const sseClient = sseClients.get(userId);
      // Send a simple "update" message. The client will then fetch the actual changes.
      sseClient.write('data: {"type":"calendar_update"}\n\n');
    } else {
      console.log(`No active user or SSE connection found for channelId: ${channelId}`);
    }
  }

  // Respond to Google with a 200 OK to acknowledge receipt of the notification.
  res.status(200).send();
});


// --- Authentication Routes ---

// 1. Initiates the authentication request with Google
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar.events.readonly'] })
);

// 2. Google redirects here after user grants permission
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }), // Redirect to a failure page on error
  (req, res) => {
    // Successful authentication, redirect home to the frontend.
    res.redirect('http://localhost:5173');
  }
);

// 3. A route to check if the user is authenticated
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// 4. A route for logging out
app.post('/api/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      // --- Close SSE connection on logout ---
      const userId = req.user?.id;
      if (userId && sseClients.has(userId)) {
        sseClients.get(userId).end();
        sseClients.delete(userId);
        console.log(`Closed SSE connection for user ${userId} on logout.`);
      }
      res.status(200).json({ message: 'Logged out successfully' });
    });
  });
});

// --- Calendar API Route ---
app.get('/api/events', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const auth = getAuthenticatedClient(req.user);
    const calendar = getCalendar(auth);
    const events = await listEvents(calendar, userId, channelUserMap); // Pass the map here
    res.json(events);
  } catch (error) {
    console.error('Error in /api/events:', error.message);
    res.status(500).json({ message: 'Failed to retrieve calendar events.', error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('Google Calendar Integration Backend is running!');
});

app.listen(port, () => {
  console.log(`Backend server listening on http://localhost:${port}`);
});

// module.exports = { channelUserMap }; // REMOVED to break circular dependency 