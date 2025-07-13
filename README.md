# Real-Time Google Calendar Integration

This project demonstrates a solution to display Google Calendar events in a UI that updates in real-time without using WebSockets or Backend-as-a-Service (BaaS) providers. The implementation consists of a Node.js backend and a React frontend.


```

## Setup and Running the Application

### 1. Google Cloud Platform Configuration

1.  **Create a Project:** Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2.  **Enable API:** Navigate to **APIs & Services > Library**, search for "Google Calendar API", and enable it.
3.  **Configure OAuth Consent Screen:**
    *   Go to **APIs & Services > OAuth consent screen**.
    *   Choose **External** and fill in the required application details (name, support email).
    *   Add the necessary scopes: `.../auth/userinfo.profile`, `.../auth/userinfo.email`, and `.../auth/calendar`.
    *   Add your Google account as a **test user** while your app is in testing mode.
4.  **Create Credentials:**
    *   Go to **APIs & Services > Credentials**.
    *   Click **Create Credentials > OAuth client ID**.
    *   Select **Web application** as the type.
    *   Add an **Authorized JavaScript origin**: `http://localhost:5173`.
    *   Add an **Authorized redirect URI**: `http://localhost:3001/auth/google/callback`.
    *   Click **Create** and copy the **Client ID** and **Client Secret**.

### 2. Backend Setup

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```
2.  **Create a `.env` file** in the `backend` directory and add your credentials:
    ```
    GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
    GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
    SESSION_SECRET="a_very_secret_key_for_sessions"
    # This will be your ngrok URL from the next step
    WEBHOOK_URL="https://YOUR_NGROK_SUBDOMAIN.ngrok.io"
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    ```
4.  **Expose your local server with ngrok:** Since Google's webhooks require a public HTTPS URL, you need a tunneling service like [ngrok](https://ngrok.com/) for local development.
    ```bash
    # Expose the backend port (3001)
    ngrok http 3001
    ```
    Copy the HTTPS forwarding URL (e.g., `https://random-string.ngrok.io`) and set it as your `WEBHOOK_URL` in the `.env` file.
5.  **Start the backend server:**
    ```bash
    node index.js
    ```

### 3. Frontend Setup

1.  **Navigate to the frontend client directory in a new terminal:**
    ```bash
    cd frontend/client
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the frontend development server:**
    ```bash
    npm run dev
    ```
4.  Open your browser and navigate to `http://localhost:5173`. You should see the login button.

## Decisions, Trade-offs, and Limitations

### Key Decisions

*   **Server-Sent Events (SSE) over Long-Polling:** SSE was chosen as the primary method to push updates from the server to the client. It's a standard web API designed for this one-way communication, making it more efficient and less complex than implementing long-polling from scratch. It perfectly fits the constraint of not using WebSockets.
*   **Webhook (`events.watch`) as the Primary Trigger:** Using Google's push notifications is far more efficient than polling the calendar API repeatedly. It minimizes API quota usage and provides near-instant notifications.
*   **Incremental Sync (`syncToken`):** After receiving a webhook notification, the client fetches *only the changes* using a `syncToken`. This is crucial for performance and quota management, as we don't need to re-fetch the entire event list on every update.
*   **In-Memory Storage for Demo:** For simplicity, user sessions, sync tokens, and channel ID mappings are stored in memory. This is not suitable for production but keeps the demo self-contained and easy to run without a database dependency.

### Trade-offs and Limitations

*   **No Persistent Storage:** The in-memory storage means all user sessions, sync tokens, and webhook subscriptions are lost when the server restarts. A production application would require a persistent database (e.g., Redis for sessions/tokens, PostgreSQL for user data) to manage this state reliably.
*   **Webhook Management:** The current implementation sets up a new webhook every time `listEvents` is called. A more robust solution would store `channelId` and `resourceId` in a database and include logic to renew or stop old channels to prevent orphaned subscriptions.
*   **Local Development Complexity:** The requirement for a public webhook URL adds a layer of complexity to local development, necessitating the use of a tunneling service like ngrok.
*   **Scalability:** The current SSE implementation holds an open connection for each active client in a simple map. In a large-scale, multi-instance deployment, this would not work. A more scalable solution would involve a pub/sub messaging system (like Redis Pub/Sub) to distribute notifications across different server instances. 