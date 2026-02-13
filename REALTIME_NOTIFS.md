# Real-Time Notification Updates

## 🐛 Issues Fixed
1.  **Notification Only on Refresh**:
    - **Cause**: The previous implementation used a manual `Map` to track user sockets, which was prone to synchronization issues.
    - **Fix**: Switched to **Socket.IO Rooms**. Every user socket joins a room named `userId`. Notifications are emitted to this room.

2.  **Notification ID Mismatch**:
    - **Cause**: Bug in `posts.ts` where DB ID differed from Socket payload ID.
    - **Fix**: Aligned IDs to ensure consistency.

3.  **Authentication Stability**:
    - **Issue**: Socket connection could fail if the access token expired, and wouldn't automatically recover, or if strict cookie policies blocked the handshake on cross-port dev environments.
    - **Fix 1**: Relaxed cookie policy to `SameSite: 'Lax'` in `env.ts`.
    - **Fix 2**: Implemented auto-recovery in `SocketContext.tsx`. If `connect_error` detects an authentication failure, it triggers `refreshUser()`. This refreshes the session cookies via the API, updating the user state, which in turn seamlessly reconnects the socket.

4.  **Read Status Sync**:
    - **Feature**: Real-time synchronization for "Mark as Read".

## 🛠️ Architecture
- **Backend**: `socket.join(userId)` handles room membership. `io.to(userId).emit(...)` handles delivery.
- **Frontend**: 
    - `Header` listens for alerts.
    - `SocketContext` manages connection lifecycle and auth recovery.
- **Database**: Notifications persisted in SQLite.

## ✅ Verification
- **Scenario**: User leaves tab open, token expires.
- **Result**: Socket disconnects -> Reconnects -> Auth Error -> `refreshUser()` calls API -> Token Refreshed -> Socket Reconnects -> Success.
