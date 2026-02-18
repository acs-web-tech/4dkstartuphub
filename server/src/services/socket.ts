import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { config } from '../config/env';
import ChatMessage from '../models/ChatMessage';
import ChatRoom from '../models/ChatRoom';
import ChatRoomMember from '../models/ChatRoomMember';
import User from '../models/User';
import Notification from '../models/Notification';
import { sanitizeHtml } from '../utils/sanitize';
import mongoose from 'mongoose';
import { escapeRegExp } from '../utils/regex';
import { pushService } from './push';
import { getLinkPreview } from './metadata';

/**
 * Socket.io service to manage real-time notifications
 */
class SocketService {
    private io: SocketIOServer | null = null;
    private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds[]
    private onlineUsers: Set<string> = new Set(); // Track online user IDs
    // Track kicked users per room: Map<roomId, Map<userId, kickedTimestamp>>
    // Entries auto-expire after KICK_BLOCK_DURATION_MS
    private kickedUsers: Map<string, Map<string, number>> = new Map();
    private static readonly KICK_BLOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes
    // Rate Limiting: Map<`${roomId}:${userId}`, timestamps[]>
    private messageRateLimits: Map<string, number[]> = new Map();

    initialize(server: HttpServer) {
        const isProd = process.env.NODE_ENV === 'production';

        this.io = new SocketIOServer(server, {
            // path: '/api/socket.io', // Reverted due to Server Crash
            cors: {
                origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
                    // No origin = same-origin / server-to-server — always allow
                    if (!origin) {
                        return callback(null, true);
                    }

                    if (isProd) {
                        // Allow all origins (reflect request origin) to fix mobile 'Failed to fetch'
                        return callback(null, true);
                    } else {
                        // Development: allow all local dev origins
                        const devOrigins = [
                            'http://localhost:5173',
                            'http://127.0.0.1:5173',
                            'http://192.168.31.152:5173',
                            'http://localhost',
                            'capacitor://localhost',
                            config.corsOrigin
                        ];
                        if (devOrigins.includes(origin)) {
                            callback(null, true);
                        } else {
                            callback(new Error('Not allowed by CORS'));
                        }
                    }
                },
                credentials: true
            }
        });

        this.io.use((socket, next) => {
            try {
                let token = socket.handshake.auth?.token;

                // Also check Authorization header
                if (!token && socket.handshake.headers.authorization) {
                    const parts = socket.handshake.headers.authorization.split(' ');
                    if (parts.length === 2 && parts[0] === 'Bearer') {
                        token = parts[1];
                    }
                }

                // Fallback to cookies
                if (!token && socket.handshake.headers.cookie) {
                    try {
                        const parsed = cookie.parse(socket.handshake.headers.cookie);
                        token = parsed.access_token;
                    } catch (parseErr: any) {
                        // ignore cookie parse error if we have no token yet
                    }
                }

                if (!token) {
                    return next(new Error('Authentication error: No token provided'));
                }

                try {
                    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
                    (socket as any).userId = decoded.userId;
                    next();
                } catch (jwtErr: any) {
                    return next(new Error(`Authentication error: ${jwtErr.message}`));
                }
            } catch (err: any) {
                next(new Error(`Authentication error: ${err.message}`));
            }
        });

        this.io.on('connection', (socket) => {
            const userId = (socket as any).userId;
            // Join a room with the user's ID for targeted notifications
            socket.join(userId);

            // Track online status
            if (!this.onlineUsers.has(userId)) {
                this.onlineUsers.add(userId);
                // Broadcast online status to all clients
                this.io?.emit('userOnline', { userId });
            }
            // Track socket per user for multi-tab support
            const sockets = this.userSockets.get(userId) || [];
            sockets.push(socket.id);
            this.userSockets.set(userId, sockets);

            // Update last_seen in DB (fire-and-forget)
            User.findByIdAndUpdate(userId, { last_seen: new Date() }).catch(() => { });

            // Handle joining post rooms for real-time comments
            socket.on('joinPost', (postId: string) => {
                socket.join(`post:${postId}`);
            });

            socket.on('leavePost', (postId: string) => {
                socket.leave(`post:${postId}`);
            });

            socket.on('joinChat', async (roomId: string) => {
                try {
                    if (typeof roomId !== 'string') return;
                    const rObjectId = new mongoose.Types.ObjectId(roomId);
                    const uObjectId = new mongoose.Types.ObjectId(userId);

                    // ── LEVEL 1: Block kicked users from re-joining the socket room ──
                    if (this.isUserKicked(roomId, userId)) {
                        socket.emit('chatError', { roomId, error: 'You have been kicked from this room.' });
                        return;
                    }

                    const room = await ChatRoom.findById(rObjectId);
                    if (!room || !room.is_active) return;

                    // ── LEVEL 2: Verify actual DB membership ──
                    const membership = await ChatRoomMember.findOne({ room_id: rObjectId, user_id: uObjectId });
                    const user = await User.findById(uObjectId);
                    const isAdmin = user?.role === 'admin';

                    // Only join if a verified member or admin
                    if (membership || isAdmin) {
                        socket.join(`chat:${roomId}`);
                    } else if (room.access_type === 'open') {
                        // For open rooms, only allow joining the socket room if not kicked
                        // (already checked above, but double-check membership exists)
                        socket.join(`chat:${roomId}`);
                    } else {
                        socket.emit('chatError', { roomId, error: 'You are not a member of this room.' });
                    }
                } catch (err) {
                    console.error('Socket Join error:', err);
                }
            });

            socket.on('leaveChat', (roomId: string) => {
                socket.leave(`chat:${roomId}`);
            });

            socket.on('sendChatMessage', async (data: { roomId: string, content: string }) => {
                await this.handleIncomingChat(socket, data);
            });

            socket.on('disconnect', () => {
                // Remove this socket from user's socket list
                const userSocketList = this.userSockets.get(userId) || [];
                const remaining = userSocketList.filter(id => id !== socket.id);
                if (remaining.length === 0) {
                    this.userSockets.delete(userId);
                    this.onlineUsers.delete(userId);
                    // Broadcast offline status
                    this.io?.emit('userOffline', { userId });
                    // Update last_seen
                    User.findByIdAndUpdate(userId, { last_seen: new Date() }).catch(() => { });
                } else {
                    this.userSockets.set(userId, remaining);
                }
            });
        });
    }

    /**
     * Get list of online user IDs
     */
    getOnlineUserIds(): string[] {
        return Array.from(this.onlineUsers);
    }

    /**
     * Check if a specific user is online
     */
    isUserOnline(userId: string): boolean {
        return this.onlineUsers.has(userId);
    }

    /**
     * Send a notification to a specific user
     */
    sendNotification(userId: string, notification: any) {
        if (!this.io) return;
        // Emit to the room corresponding to the userId
        this.io.to(userId).emit('notification', notification);

        // Native Push
        pushService.sendToUser(userId, {
            title: notification.title,
            body: (notification.content || '').replace(/<[^>]*>?/gm, ''),
            url: notification.referenceId ? `/posts/${notification.referenceId}` : '/',
            icon: notification.senderAvatarUrl || '/logo.png'
        });
    }

    /**
     * Send event to a specific room
     */
    toRoom(room: string, event: string, data: any) {
        this.io?.to(room).emit(event, data);
    }

    /**
     * Broadcast to all users
     */
    broadcast(event: string, data: any) {
        if (!this.io) {
            return;
        }
        this.io.emit(event, data);

        // Native Push for broadcasts
        if (event === 'broadcast') {
            pushService.broadcast({
                title: data.title || 'Administrative Broadcast',
                body: (data.content || '').replace(/<[^>]*>?/gm, ''),
                url: data.referenceId ? `/posts/${data.referenceId}` : '/'
            });
        }
    }

    /**
     * Emit post update event
     */
    emitPostUpdate(postId: string, updatedPost: any) {
        this.io?.emit('postUpdated', { postId, post: updatedPost });
    }

    /**
     * Emit post deletion event
     */
    emitPostDeleted(postId: string) {
        this.io?.emit('postDeleted', { postId });
    }

    /**
     * Emit message deletion event
     */
    emitMessageDeleted(roomId: string, messageId: string) {
        if (!this.io) return;
        this.io.to(`chat:${roomId}`).emit('messageDeleted', { roomId, messageId });
    }

    /**
     * Emit all messages from a user deleted event
     */
    emitUserMessagesDeleted(roomId: string, userId: string) {
        if (!this.io) return;
        this.io.to(`chat:${roomId}`).emit('userMessagesDeleted', { roomId, userId });
    }

    /**
     * Emit comment count update
     */
    emitCommentCountUpdate(postId: string, commentCount: number) {
        this.io?.emit('commentCountUpdated', { postId, commentCount });
    }

    /**
     * Check if a user is currently kick-blocked from a room
     */
    isUserKicked(roomId: string, userId: string): boolean {
        const roomKicks = this.kickedUsers.get(roomId);
        if (!roomKicks) return false;
        const kickedAt = roomKicks.get(userId);
        if (!kickedAt) return false;
        // Check if the kick has expired
        if (Date.now() - kickedAt > SocketService.KICK_BLOCK_DURATION_MS) {
            roomKicks.delete(userId);
            if (roomKicks.size === 0) this.kickedUsers.delete(roomId);
            return false;
        }
        return true;
    }

    /**
     * Record a user as kicked from a room
     */
    private recordKick(roomId: string, userId: string) {
        if (!this.kickedUsers.has(roomId)) {
            this.kickedUsers.set(roomId, new Map());
        }
        this.kickedUsers.get(roomId)!.set(userId, Date.now());
    }

    /**
     * Clear kicked status (used when admin re-adds a user)
     */
    clearKickStatus(roomId: string, userId: string) {
        const roomKicks = this.kickedUsers.get(roomId);
        if (roomKicks) {
            roomKicks.delete(userId);
            if (roomKicks.size === 0) this.kickedUsers.delete(roomId);
        }
    }

    /**
     * Notify a user they've been kicked + force-disconnect their sockets from the room
     */
    emitMemberKicked(roomId: string, userId: string) {
        if (!this.io) return;

        // ── LEVEL 3: Record the kick to prevent re-join / auto-join bypass ──
        this.recordKick(roomId, userId);

        // ── LEVEL 4: Notify the kicked user's personal room ──
        this.io.to(userId).emit('memberKicked', { roomId });

        // ── LEVEL 5: Force-remove ALL of the user's sockets from this chat room ──
        // This prevents any in-flight messages from being sent after the kick
        const userRoom = this.io.sockets.adapter.rooms.get(userId);
        if (userRoom) {
            for (const socketId of userRoom) {
                const sock = this.io.sockets.sockets.get(socketId);
                if (sock) {
                    sock.leave(`chat:${roomId}`);
                }
            }
        }

        this.io.to(`chat:${roomId}`).emit('memberListUpdated', { roomId });
    }

    /**
     * Notify all users that room access type changed
     */
    emitRoomAccessChanged(roomId: string, accessType: string) {
        if (!this.io) return;
        this.io.emit('roomAccessChanged', { roomId, accessType });
    }

    /**
     * Emit notifications read event to user
     */
    emitNotificationsRead(userId: string) {
        if (!this.io) return;
        this.io.to(userId).emit('notificationsRead');
    }

    /**
     * Emit a new chat message to a room
     */
    emitChatMessage(roomId: string, message: any) {
        if (!this.io) return;
        this.io.to(`chat:${roomId}`).emit('newChatMessage', { roomId, message });
    }

    private async handleIncomingChat(socket: Socket, data: { roomId: string, content: string }) {
        try {
            const userId = (socket as any).userId;
            const { roomId, content: rawContent } = data;

            if (!roomId || !rawContent?.trim()) return;

            const rObjectId = new mongoose.Types.ObjectId(String(roomId));
            const uObjectId = new mongoose.Types.ObjectId(String(userId));

            // ══════════════════════════════════════════════════════════════
            // MULTI-LEVEL MEMBERSHIP VALIDATION — NO TAMPERING OR GLITCH
            // Every single message goes through ALL checks, every time.
            // ══════════════════════════════════════════════════════════════

            // ── LEVEL 1: In-memory kick check (instant, no DB call) ──
            if (this.isUserKicked(roomId, userId)) {
                socket.leave(`chat:${roomId}`);
                socket.emit('chatError', { roomId, error: 'You have been kicked from this room.' });
                socket.emit('memberKicked', { roomId });
                return;
            }

            // ── LEVEL 2: Room existence and active status ──
            const room = await ChatRoom.findById(rObjectId);
            if (!room || !room.is_active) {
                socket.leave(`chat:${roomId}`);
                socket.emit('chatError', { roomId, error: 'This room no longer exists.' });
                return;
            }

            // ── LEVEL 3: User existence check ──
            const user = await User.findById(uObjectId);
            if (!user || !user.is_active) {
                socket.leave(`chat:${roomId}`);
                return;
            }

            // ── LEVEL 4: DB membership check (authoritative, fresh query every time) ──
            const membership = await ChatRoomMember.findOne({ room_id: rObjectId, user_id: uObjectId });

            // RULE 1: Invite-Only — must be in member list. NO BYPASS.
            if (room.access_type === 'invite' && !membership) {
                socket.leave(`chat:${roomId}`);
                socket.emit('chatError', { roomId, error: 'Access Denied: You are not in the member list for this private room.' });
                socket.emit('memberKicked', { roomId });
                return;
            }

            // RULE 2: Open rooms — auto-join ONLY if NOT kicked.
            // This is the critical fix: previously, a kicked user from an open room
            // would get auto-joined right back in. Now we block that.
            if (room.access_type === 'open' && !membership) {
                // Double-check the kick status again (belt-and-suspenders)
                if (this.isUserKicked(roomId, userId)) {
                    socket.leave(`chat:${roomId}`);
                    socket.emit('chatError', { roomId, error: 'You have been kicked from this room.' });
                    socket.emit('memberKicked', { roomId });
                    return;
                }
                // Only auto-join if genuinely never been a member and not kicked
                try {
                    await ChatRoomMember.create({
                        room_id: rObjectId,
                        user_id: uObjectId
                    });
                } catch (createErr: any) {
                    // If duplicate key error, the member somehow already exists so proceed
                    if (createErr?.code !== 11000) {
                        socket.emit('chatError', { roomId, error: 'Failed to join room.' });
                        return;
                    }
                }
            }

            // ── LEVEL 5: Final membership verification (re-fetch to ensure consistency) ──
            const confirmedMembership = await ChatRoomMember.findOne({ room_id: rObjectId, user_id: uObjectId });
            if (!confirmedMembership) {
                socket.leave(`chat:${roomId}`);
                socket.emit('chatError', { roomId, error: 'You are no longer a member of this room.' });
                socket.emit('memberKicked', { roomId });
                return;
            }

            // ── LEVEL 6: Muted check ──
            if (confirmedMembership.is_muted) {
                socket.emit('chatError', { roomId, error: 'You are muted in this room.' });
                return;
            }

            // ── LEVEL 7: Rate Limiting (Auto-Mute Spammers) ──
            if (user.role !== 'admin') {
                const rateLimitKey = `${roomId}:${userId}`;
                const now = Date.now();
                let timestamps = this.messageRateLimits.get(rateLimitKey) || [];
                // Keep timestamps within last 10 seconds
                timestamps = timestamps.filter(t => now - t < 10000);

                if (timestamps.length >= 10) {
                    // Auto-mute
                    await ChatRoomMember.updateOne({ room_id: rObjectId, user_id: uObjectId }, { is_muted: 1 });
                    socket.emit('chatError', { roomId, error: 'You have been automatically muted for sending messages too quickly.' });
                    // Notify room of update (mute status)
                    this.io.to(`chat:${roomId}`).emit('memberListUpdated', { roomId });
                    return;
                }

                timestamps.push(now);
                this.messageRateLimits.set(rateLimitKey, timestamps);
            }

            const content = sanitizeHtml(rawContent.trim());
            if (!content || content.length === 0) return;

            // Scrape link preview if URL exists
            let linkPreview = undefined;
            try {
                const urlMatch = content.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                    linkPreview = await getLinkPreview(urlMatch[0]);
                }
            } catch (error) {
                console.error('Failed to scrape link preview in socket chat:', error);
            }

            const newMessage = await ChatMessage.create({
                room_id: rObjectId,
                user_id: uObjectId,
                content,
                link_preview: linkPreview,
                created_at: new Date()
            });

            const messageData = {
                id: newMessage._id.toString(),
                content,
                userId: userId,
                username: user?.username,
                displayName: user?.display_name,
                avatarUrl: user?.avatar_url,
                createdAt: newMessage.created_at,
                linkPreview: newMessage.link_preview
            };

            // Broadcast to all in room
            this.emitChatMessage(roomId, messageData);

            // Mentions
            const mentionPattern = /@([a-zA-Z0-9_]+)/g;
            const matches = [...content.matchAll(mentionPattern)];
            for (const match of matches) {
                const username = match[1];
                const targetUser = await User.findOne({ username: { $regex: new RegExp(`^${escapeRegExp(username)}$`, 'i') } });
                if (targetUser && targetUser._id.toString() !== userId) {
                    const isMember = await ChatRoomMember.findOne({ room_id: room._id, user_id: targetUser._id });
                    if (isMember) {
                        await Notification.create({
                            user_id: targetUser._id,
                            sender_id: userId,
                            type: 'mention',
                            title: `${user?.display_name} mentioned you in ${room.name}`,
                            content: content.substring(0, 100),
                            reference_id: room._id.toString()
                        });
                        // Push real-time notification
                        this.sendNotification(targetUser._id.toString(), {
                            type: 'mention',
                            title: `${user?.display_name} mentioned you in ${room.name}`
                        });
                    }
                }
            }
        } catch (err) {
            console.error('Socket Chat Error:', err);
        }
    }
}

export const socketService = new SocketService();
