const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const { userStore } = require('./auth');
// const { channelUserMap } = require('./index'); // REMOVED to break circular dependency

// --- In-memory store for sync tokens ---
// In a production app, this should be stored in a database alongside user data.
const syncTokens = new Map();

/**
 * Creates and configures an OAuth2 client for the Google Calendar API.
 * @param {object} user - The user object from our userStore.
 * @returns {import('google-auth-library').OAuth2Client} An authenticated OAuth2 client.
 */
function getAuthenticatedClient(user) {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    '/auth/google/callback'
  );
  oAuth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });
  return oAuth2Client;
}

/**
 * Creates and returns an instance of the Google Calendar API.
 * @param {import('google-auth-library').OAuth2Client} auth - The authenticated OAuth2 client.
 * @returns {import('googleapis').calendar_v3.Calendar} An instance of the Calendar API.
 */
function getCalendar(auth) {
  return google.calendar({ version: 'v3', auth });
}

/**
 * Sets up a push notification channel to watch for changes on the user's primary calendar.
 * @param {import('googleapis').calendar_v3.Calendar} calendar - The Calendar API instance.
 * @param {string} userId - The user's unique ID.
 * @param {Map<string, string>} channelUserMap - The map to store channel-to-user mappings.
 */
async function setupWebhook(calendar, userId, channelUserMap) {
  // First, check if we already have a channel for this user and stop it if necessary.
  // This is a simplistic approach. A robust implementation would store and manage channel IDs more carefully.
  for (const [channelId, id] of channelUserMap.entries()) {
    if (id === userId) {
      // In a real app, you might need to stop the old channel first using its resourceId.
      // For this demo, we'll just overwrite the mapping.
      console.log(`Found existing channel for user ${userId}. A new one will be created.`);
    }
  }

  const channelId = uuidv4();
  // IMPORTANT: This URL must be a publicly accessible HTTPS endpoint.
  // Use a tool like ngrok for local development.
  const webhookUrl = process.env.WEBHOOK_URL || 'YOUR_PUBLIC_WEBHOOK_URL/api/notifications';

  try {
    const response = await calendar.events.watch({
      calendarId: 'primary',
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
      },
    });

    console.log('Successfully set up webhook. Channel ID:', response.data.id);
    // Map the new channelId to our userId so the webhook handler can find the user.
    channelUserMap.set(response.data.id, userId);
    return response.data;
  } catch (error) {
    console.error('Error setting up webhook:', error);
    throw error;
  }
}

/**
 * Lists events from the user's primary calendar.
 * Handles both initial full sync and subsequent incremental syncs.
 * @param {import('googleapis').calendar_v3.Calendar} calendar - The Calendar API instance.
 * @param {string} userId - The user's unique ID.
 * @param {Map<string, string>} channelUserMap - The map to store channel-to-user mappings.
 */
async function listEvents(calendar, userId, channelUserMap) {
  const currentSyncToken = syncTokens.get(userId);
  let eventsResponse;
  let syncType;

  try {
    // Ensure a webhook is active for this user.
    await setupWebhook(calendar, userId, channelUserMap);

    if (currentSyncToken) {
      console.log(`Performing incremental sync for user ${userId} with syncToken.`);
      syncType = 'delta';
      eventsResponse = await calendar.events.list({
        calendarId: 'primary',
        syncToken: currentSyncToken,
      });
    } else {
      console.log(`Performing full sync for user ${userId}.`);
      syncType = 'full';
      eventsResponse = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString(), // Look back 30 days
        singleEvents: true,
        orderBy: 'startTime',
      });
    }

    const newSyncToken = eventsResponse.data.nextSyncToken;
    if (newSyncToken) {
      syncTokens.set(userId, newSyncToken);
      console.log(`Stored new syncToken for user ${userId}.`);
    }

    return {
      syncType,
      items: eventsResponse.data.items || []
    };

  } catch (error) {
    if (error.code === 410) {
      // A 410 error indicates the sync token is invalid or expired.
      console.log(`Sync token invalid for user ${userId}. Clearing token and forcing full sync.`);
      syncTokens.delete(userId);
      throw new Error('Sync token invalid. Please refresh.');
    } else {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }
}

module.exports = {
  getAuthenticatedClient,
  getCalendar,
  listEvents,
  syncTokens
}; 