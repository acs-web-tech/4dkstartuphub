# Real-Time WebSocket - Quick Start Guide

## 🚀 Quick Start

### Starting the Application

```bash
# Terminal 1 - Start Server
cd server
npm run dev

# Terminal 2 - Start Client
cd client
npm run dev
```

### Verify WebSocket Connection

Open browser console and look for:
```
🔌 WebSocket Connected
```

## 📡 Real-Time Events Reference

### Client → Server Events

| Event | When | Data |
|-------|------|------|
| `joinPost` | User opens post detail | `postId: string` |
| `leavePost` | User leaves post detail | `postId: string` |

### Server → Client Events

| Event | Trigger | Handler Location |
|-------|---------|------------------|
| `newPost` | Post created | Feed.tsx |
| `postUpdated` | Post edited | Feed.tsx, PostDetail.tsx |
| `postDeleted` | Post deleted | Feed.tsx, PostDetail.tsx |
| `postLiked` | Like toggled | Feed.tsx, PostDetail.tsx |
| `newComment` | Comment added | PostDetail.tsx |
| `commentCountUpdated` | Comment added | Feed.tsx, PostDetail.tsx |
| `notification` | Any notification | Header.tsx |

## 💻 Code Examples

### Listening to Real-Time Events

```typescript
// In any React component
import { useSocket } from '../context/SocketContext';

function MyComponent() {
  const { socket } = useSocket();

  useEffect(() => {
    if (socket) {
      // Listen to event
      socket.on('eventName', (data) => {
        console.log('Received:', data);
        // Update state
      });

      // Cleanup
      return () => {
        socket.off('eventName');
      };
    }
  }, [socket]);
}
```

### Emitting Events from Server

```typescript
import { socketService } from '../services/socket';

// Broadcast to all clients
socketService.broadcast('eventName', { data });

// Send to specific user
socketService.sendNotification(userId, notificationData);

// Send to room
socketService.toRoom('post:123', 'newComment', commentData);

// Emit post update
socketService.emitPostUpdate(postId, updatedPost);

// Emit post deletion
socketService.emitPostDeleted(postId);

// Emit comment count update
socketService.emitCommentCountUpdate(postId, count);
```

### Creating Notifications

```typescript
// Server-side (in routes/posts.ts)
const notifId = uuidv4();
db.prepare(`
  INSERT INTO notifications (id, user_id, type, title, content, reference_id, sender_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(notifId, recipientUserId, 'comment', 'New comment!', 'Someone commented', postId, senderUserId);

// Send real-time notification
socketService.sendNotification(recipientUserId, {
  id: notifId,
  type: 'comment',
  title: 'New comment!',
  content: 'Someone commented on your post',
  referenceId: postId,
  senderId: senderUserId,
  senderDisplayName: 'John Doe',
  senderAvatarUrl: 'https://...',
  senderUsername: 'johndoe',
  isRead: 0,
  createdAt: new Date().toISOString()
});
```

### Handling @Mentions

```typescript
// Detect mentions in comment
const mentionRegex = /@(\w+)/g;
const matches = [...content.matchAll(mentionRegex)];

for (const match of matches) {
  const username = match[1].toLowerCase();
  const targetUser = db.prepare(
    'SELECT id FROM users WHERE LOWER(username) = ?'
  ).get(username);
  
  if (targetUser) {
    // Create and send notification
    socketService.sendNotification(targetUser.id, mentionNotification);
  }
}
```

## 🎨 Adding Visual Feedback

### CSS Classes for Animations

```tsx
// New item animation
<div className="realtime-new">
  New content
</div>

// Update highlight animation
<div className="realtime-update">
  Updated content
</div>
```

### Custom Animation

```css
@keyframes myAnimation {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.my-element {
  animation: myAnimation 0.3s ease-out;
}
```

## 🔍 Debugging

### Check Socket Connection

```typescript
// In browser console
console.log('Socket connected:', socket?.connected);
console.log('Socket ID:', socket?.id);
```

### Monitor Events

```typescript
// Log all incoming events
socket.onAny((eventName, ...args) => {
  console.log(`Event: ${eventName}`, args);
});
```

### Server-Side Logging

```typescript
// In socket.ts
socket.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id, 'User:', userId);
});
```

## ⚡ Performance Tips

1. **Cleanup listeners**: Always remove event listeners in useEffect cleanup
2. **Deduplicate**: Check if item exists before adding to state
3. **Throttle updates**: Use debounce for rapid updates
4. **Limit room joins**: Only join rooms when needed

## 🐛 Common Issues

### Issue: Socket not connecting
**Solution**: Check CORS settings and JWT token

### Issue: Events not received
**Solution**: Verify event name matches exactly (case-sensitive)

### Issue: Duplicate notifications
**Solution**: Check deduplication logic in handlers

### Issue: Memory leaks
**Solution**: Ensure all event listeners are cleaned up

## 📱 Mobile Considerations

- WebSocket works on mobile browsers
- Consider battery impact of persistent connections
- Implement reconnection logic for network changes
- Use service workers for background notifications

## 🔐 Security Checklist

- ✅ Authenticate WebSocket connections
- ✅ Validate all incoming data
- ✅ Sanitize content before broadcasting
- ✅ Implement rate limiting
- ✅ Use HTTPS/WSS in production

## 📊 Monitoring

### Key Metrics to Track

- Active WebSocket connections
- Events per second
- Average latency
- Reconnection rate
- Error rate

### Logging Best Practices

```typescript
// Good logging
console.log('📬 Notification sent to User', userId.slice(0, 8));

// Avoid logging sensitive data
// ❌ console.log('User data:', user);
```

## 🎯 Next Steps

1. Test all real-time features
2. Monitor performance in production
3. Implement Redis adapter for scaling
4. Add analytics for user engagement
5. Consider adding typing indicators
6. Add "user is viewing" presence

---

**Need Help?** Check the full documentation in `REALTIME_IMPLEMENTATION.md`
