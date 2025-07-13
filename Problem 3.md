Problem 1 – Google Calendar Integration Without Websockets or BaaS


Problem Statement:

Implement a UI that shows all a user's Google Calendar events in real time. The UI must respond to user-initiated changes (event creation, updates, deletions) without using WebSockets or any Backend-as-a-Service provider.


Hint:


* Use Google Calendar's push notification system (Webhooks).

* Use Google's incremental sync or sync tokens to efficiently fetch only changes.

* Consider using polling combined with browser visibility or activity detection to minimize unnecessary calls.


Your Goal:


* Integrate OAuth2 flow for user authentication.

* Display events with minimal delay after user actions.

* Handle edge cases like token refresh, deleted events, overlapping changes, and multiple device syncs.

* Ensure real-time responsiveness while minimizing API quota usage.


Expectations:


* Working OAuth-based authentication and calendar listing.

* Smart polling or webhook handling without socket or BaaS usage.

* Smooth, responsive UI that reflects user event changes within seconds.


Submission Guidelines

For all problems, please include:


* Code snippets or GitHub link (if applicable).

* System architecture diagram (if needed).


* Written explanation of decisions made.

* Trade-offs and limitations.