import { useState, useEffect, useCallback } from 'react';
import './index.css';

// The base URL of our backend server
const API_URL = 'http://localhost:3001';

function App() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);

  // --- API Fetch Abstraction with credentials ---
  const fetchAPI = useCallback(async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      credentials: 'include' // Send cookies with every request
    });
    if (!res.ok) {
      const errorInfo = await res.json();
      throw new Error(errorInfo.message || `An error occurred: ${res.statusText}`);
    }
    return res.json();
  }, []);

  // --- Effect to check user session on initial load ---
  useEffect(() => {
    const checkUserSession = async () => {
      try {
        const userData = await fetchAPI(`${API_URL}/api/user`);
        setUser(userData);
      } catch (error) {
        console.log('No active session found.');
        setUser(null);
      }
    };
    checkUserSession();
  }, [fetchAPI]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      console.log('Fetching events...');
      const payload = await fetchAPI(`${API_URL}/api/events`);
      const { syncType, items: eventData } = payload;

      console.log(`Received ${syncType} update with ${eventData.length} items.`);

      if (syncType === 'full') {
        // Full sync: Replace the entire list of events.
        setEvents(eventData.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date)));
      } else {
        // Delta sync: Merge the changes with the existing events.
        setEvents(prevEvents => {
          const eventMap = new Map(prevEvents.map(e => [e.id, e]));
          eventData.forEach(event => {
            if (event.status === 'cancelled') {
              eventMap.delete(event.id);
            } else {
              eventMap.set(event.id, event);
            }
          });
          return Array.from(eventMap.values()).sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
        });
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    }
  }, [user, fetchAPI]);

  // --- Effect to set up SSE connection when user logs in ---
  useEffect(() => {
    if (!user) return;

    console.log('Connecting to SSE...');
    // The `withCredentials` option is necessary to send the session cookie
    const eventSource = new EventSource(`${API_URL}/api/events/sse`, { withCredentials: true });

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('SSE message received:', data);
      if (data.type === 'calendar_update') {
        console.log('Calendar update detected, re-fetching events.');
        fetchEvents();
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      eventSource.close();
    };

    // Cleanup on component unmount or user logout
    return () => {
      console.log('Closing SSE connection.');
      eventSource.close();
    };
  }, [user, fetchEvents]);

  // --- Effect to fetch initial events when user logs in ---
  useEffect(() => {
    if (user) {
      fetchEvents();
    }
  }, [user, fetchEvents]);

  const handleLogin = () => {
    // Redirect to the backend's Google auth route
    window.location.href = `${API_URL}/auth/google`;
  };

  const handleLogout = async () => {
    try {
      await fetchAPI(`${API_URL}/api/logout`, { method: 'POST' });
      setUser(null);
      setEvents([]);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Google Calendar Real-time Sync</h1>
        {user ? (
          <div>
            <p>Welcome, {user.displayName}!</p>
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <button onClick={handleLogin}>Login with Google</button>
        )}
      </header>
      <main>
        {user && (
          <div>
            <h2>Your Upcoming Events</h2>
            <button onClick={fetchEvents}>Refresh Events</button>
            {/* A more user-friendly event list */}
            {events.length > 0 ? (
              <ul>
                {events.map(event => (
                  <li key={event.id}>
                    <strong>{event.summary}</strong>
                    <br />
                    <small>
                      {new Date(event.start.dateTime || event.start.date).toLocaleString()} -
                      {new Date(event.end.dateTime || event.end.date).toLocaleString()}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No upcoming events found.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
