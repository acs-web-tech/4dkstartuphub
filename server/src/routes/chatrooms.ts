import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { createChatRoomSchema, chatMessageSchema } from '../validators/schemas';
import { sanitizeHtml } from '../utils/sanitize';
import ChatRoom from '../models/ChatRoom';
import ChatRoomMember from '../models/ChatRoomMember';
import ChatMessage from '../models/ChatMessage';
import User from '../models/User';
import Notification from '../models/Notification';
import mongoose from 'mongoose';
import { socketService } from '../services/socket';
import { getLinkPreview } from '../services/metadata';

const router = Router();

// ── GET /api/chatrooms ──────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res) => {
    try {
        const rooms = await ChatRoom.aggregate([
            { $match: { is_active: true } },
            { $sort: { created_at: -1 } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'created_by',
                    foreignField: '_id',
                    as: 'creator'
                }
            },
            { $unwind: '$creator' },
            {
                $lookup: {
                    from: 'chatroommembers',
                    localField: '_id',
                    foreignField: 'room_id',
                    as: 'members'
                }
            },
            {
                $lookup: {
                    from: 'chatmessages',
                    localField: '_id',
                    foreignField: 'room_id',
                    as: 'messages'
                }
            },
            {
                $project: {
                    id: '$_id',
                    name: 1,
                    description: 1,
                    createdBy: '$created_by',
                    creatorName: '$creator.display_name',
                    memberCount: { $size: '$members' },
                    messageCount: { $size: '$messages' },
                    accessType: '$access_type',
                    createdAt: '$created_at'
                }
            }
        ]);

        const userJoinedRooms = await ChatRoomMember.find({ user_id: req.user!.userId }).distinct('room_id');
        const joinedRoomIds = new Set(userJoinedRooms.map(id => id.toString()));

        res.json({
            rooms: rooms.map(r => ({
                ...r,
                isJoined: joinedRoomIds.has(r.id.toString())
            }))
        });
    } catch (err) {
        console.error('Get chat rooms error:', err);
        res.status(500).json({ error: 'Failed to fetch chat rooms' });
    }
});

// ── POST /api/chatrooms (Admin only) ────────────────────────
router.post('/', authenticate, requireAdmin, validate(createChatRoomSchema), async (req: AuthRequest, res) => {
    try {
        const { name, description, accessType } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user!.userId);

        const newRoom = await ChatRoom.create({
            name: sanitizeHtml(name),
            description: sanitizeHtml(description || ''),
            created_by: userId,
            access_type: accessType === 'invite' ? 'invite' : 'open'
        });

        res.status(201).json({ message: 'Chat room created', roomId: newRoom._id.toString() });
    } catch (err) {
        console.error('Create chat room error:', err);
        res.status(500).json({ error: 'Failed to create chat room' });
    }
});

// ── PUT /api/chatrooms/:id/settings (Admin only) ───────────
router.put('/:id/settings', authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { name, description, accessType } = req.body;
        const room = await ChatRoom.findById(req.params.id);
        if (!room) {
            res.status(404).json({ error: 'Chat room not found' });
            return;
        }

        if (name) room.name = sanitizeHtml(name);
        if (description !== undefined) room.description = sanitizeHtml(description);
        if (accessType && ['open', 'invite'].includes(accessType)) {
            room.access_type = accessType;
            socketService.emitRoomAccessChanged(room._id.toString(), accessType);
        }

        await room.save();
        res.json({ message: 'Room settings updated' });
    } catch (err) {
        console.error('Update room settings error:', err);
        res.status(500).json({ error: 'Failed to update room settings' });
    }
});

// ── POST /api/chatrooms/:id/join ────────────────────────────
router.post('/:id/join', authenticate, async (req: AuthRequest, res) => {
    try {
        const room = await ChatRoom.findById(req.params.id);
        if (!room || !room.is_active) {
            res.status(404).json({ error: 'Chat room not found' });
            return;
        }

        // Check if the user was recently kicked from this room
        if (socketService.isUserKicked(req.params.id as string, req.user!.userId)) {
            res.status(403).json({ error: 'You have been kicked from this room. Only an admin can add you back.' });
            return;
        }

        const user = await User.findById(req.user!.userId);
        if (room.access_type === 'invite' && user?.role !== 'admin') {
            res.status(403).json({ error: 'This room is invite-only.' });
            return;
        }

        const existing = await ChatRoomMember.findOne({ room_id: room._id, user_id: req.user!.userId });
        if (existing) {
            res.status(409).json({ error: 'Already a member' });
            return;
        }

        await ChatRoomMember.create({
            room_id: room._id,
            user_id: req.user!.userId
        });

        res.json({ message: 'Joined chat room' });
    } catch (err) {
        console.error('Join room error:', err);
        res.status(500).json({ error: 'Failed to join room' });
    }
});

// ── POST /api/chatrooms/:id/leave ───────────────────────────
router.post('/:id/leave', authenticate, async (req: AuthRequest, res) => {
    try {
        await ChatRoomMember.deleteOne({ room_id: req.params.id, user_id: req.user!.userId });
        res.json({ message: 'Left chat room' });
    } catch (err) {
        console.error('Leave room error:', err);
        res.status(500).json({ error: 'Failed to leave room' });
    }
});

// ── POST /api/chatrooms/:id/add-member (Admin only) ────────
router.post('/:id/add-member', authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ error: 'Invalid room ID' });
            return;
        }
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }

        const rObjectId = new mongoose.Types.ObjectId(req.params.id as string);
        const uObjectId = new mongoose.Types.ObjectId(userId);

        const room = await ChatRoom.findById(rObjectId);
        if (!room || !room.is_active) {
            res.status(404).json({ error: 'Chat room not found' });
            return;
        }

        const targetUser = await User.findById(uObjectId);
        if (!targetUser || !targetUser.is_active) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const existing = await ChatRoomMember.findOne({ room_id: rObjectId, user_id: uObjectId });
        if (existing) {
            res.status(409).json({ error: 'User is already a member' });
            return;
        }

        await ChatRoomMember.create({
            room_id: rObjectId,
            user_id: uObjectId
        });

        // Clear any previous kick status so the user can rejoin and chat
        socketService.clearKickStatus(req.params.id as string, userId);

        await Notification.create({
            user_id: uObjectId,
            sender_id: req.user!.userId,
            type: 'chat',
            title: `You've been added to ${room.name}`,
            content: `An admin added you to the chat room "${room.name}".`
        });

        res.json({ message: 'Member added successfully' });
    } catch (err) {
        console.error('Add member error:', err);
        res.status(500).json({ error: 'Failed to add member' });
    }
});

// ── POST /api/chatrooms/:id/kick (Admin only) ──────────────
router.post('/:id/kick', authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(400).json({ error: 'Invalid ID(s)' });
            return;
        }
        const rObjectId = new mongoose.Types.ObjectId(req.params.id as string);
        const uObjectId = new mongoose.Types.ObjectId(userId);

        if (userId === req.user!.userId) {
            res.status(400).json({ error: 'Cannot kick yourself' });
            return;
        }
        await ChatRoomMember.deleteOne({ room_id: rObjectId, user_id: uObjectId });

        // Notify user and room in real-time
        socketService.emitMemberKicked(req.params.id as string, userId);

        res.json({ message: 'Member kicked from room' });
    } catch (err) {
        console.error('Kick member error:', err);
        res.status(500).json({ error: 'Failed to kick member' });
    }
});

// ── POST /api/chatrooms/:id/mute (Admin only) ──────────────
router.post('/:id/mute', authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(400).json({ error: 'Invalid ID(s)' });
            return;
        }
        const rObjectId = new mongoose.Types.ObjectId(req.params.id as string);
        const uObjectId = new mongoose.Types.ObjectId(userId);

        const member = await ChatRoomMember.findOne({ room_id: rObjectId, user_id: uObjectId });
        if (!member) {
            res.status(404).json({ error: 'Member not found' });
            return;
        }

        member.is_muted = !member.is_muted;
        await member.save();
        res.json({ message: member.is_muted ? 'Member muted' : 'Member unmuted', isMuted: member.is_muted });
    } catch (err) {
        console.error('Mute member error:', err);
        res.status(500).json({ error: 'Failed to toggle mute' });
    }
});

// ── GET /api/chatrooms/:id/messages ─────────────────────────
router.get('/:id/messages', authenticate, async (req: AuthRequest, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ error: 'Invalid room ID' });
            return;
        }
        const rObjectId = new mongoose.Types.ObjectId(req.params.id as string);
        const isAdmin = req.user!.role === 'admin';
        const membership = await ChatRoomMember.findOne({ room_id: rObjectId, user_id: req.user!.userId });

        if (!membership && !isAdmin) {
            res.status(403).json({ error: 'You must join this room to see messages' });
            return;
        }

        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
        const skip = (page - 1) * limit;
        const messages = await ChatMessage.find({ room_id: rObjectId })
            .populate('user_id', 'username display_name avatar_url')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);

        const total = await ChatMessage.countDocuments({ room_id: rObjectId });
        const room = await ChatRoom.findById(rObjectId).populate('created_by', 'display_name');

        const members = await ChatRoomMember.find({ room_id: rObjectId })
            .populate('user_id', 'username display_name avatar_url');

        res.json({
            room: {
                id: room?._id.toString(),
                name: room?.name,
                description: room?.description,
                createdBy: room?.created_by,
                creatorName: (room?.created_by as any)?.display_name,
                accessType: room?.access_type || 'open',
                createdAt: room?.created_at,
            },
            messages: messages.reverse().map(m => {
                const mUser = m.user_id as any;
                return {
                    id: m._id.toString(),
                    content: m.content,
                    userId: mUser._id.toString(),
                    username: mUser.username,
                    displayName: mUser.display_name,
                    avatarUrl: mUser.avatar_url,
                    createdAt: m.created_at,
                    linkPreview: m.link_preview
                };
            }),
            members: members
                .map(m => {
                    const mUser = m.user_id as any;
                    return {
                        id: mUser?._id?.toString() || m.user_id?.toString() || 'unknown',
                        username: mUser?.username || 'Unknown',
                        displayName: mUser?.display_name || 'Deleted User',
                        avatarUrl: mUser?.avatar_url || '',
                        isMuted: m.is_muted ? 1 : 0,
                    };
                }),
            isMuted: membership ? (membership.is_muted ? 1 : 0) : 0,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// ── POST /api/chatrooms/:id/messages ────────────────────────
router.post('/:id/messages', authenticate, validate(chatMessageSchema), async (req: AuthRequest, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ error: 'Invalid room ID' });
            return;
        }
        const rObjectId = new mongoose.Types.ObjectId(req.params.id as string);
        const uObjectId = new mongoose.Types.ObjectId(req.user!.userId);

        // ── LEVEL 1: In-memory kick check ──
        if (socketService.isUserKicked(req.params.id as string, req.user!.userId)) {
            res.status(403).json({ error: 'You have been kicked from this room.' });
            return;
        }

        const room = await ChatRoom.findById(rObjectId);
        if (!room || !room.is_active) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }

        // ── LEVEL 2: DB membership check ──
        let membership = await ChatRoomMember.findOne({ room_id: rObjectId, user_id: uObjectId });

        // RULE 1: Invite-Only strict check
        if (room.access_type === 'invite' && !membership) {
            res.status(403).json({ error: 'Access Denied: You are not on the guest list for this private room.' });
            return;
        }

        // RULE 2: Open room auto-join — but NOT if user was kicked
        if (room.access_type === 'open' && !membership) {
            // Double-check kick status before auto-joining (belt-and-suspenders)
            if (socketService.isUserKicked(req.params.id as string, req.user!.userId)) {
                res.status(403).json({ error: 'You have been kicked from this room.' });
                return;
            }
            membership = await ChatRoomMember.create({
                room_id: rObjectId,
                user_id: uObjectId
            });
        }

        // ── LEVEL 3: Final membership verification ──
        if (!membership) {
            res.status(403).json({ error: 'You are no longer a member of this room.' });
            return;
        }

        if (membership.is_muted) {
            res.status(403).json({ error: 'You are muted in this room.' });
            return;
        }

        const content = sanitizeHtml(req.body.content);

        let linkPreview = undefined;
        try {
            const urlMatch = content.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                linkPreview = await getLinkPreview(urlMatch[0]);
            }
        } catch (error) {
            console.error('Failed to generate link preview:', error);
        }

        const newMessage = await ChatMessage.create({
            room_id: rObjectId,
            user_id: uObjectId,
            content,
            link_preview: linkPreview
        });

        const user = await User.findById(req.user!.userId);

        // Mentions
        const mentionPattern = /@([a-zA-Z0-9_]+)/g;
        const matches = [...content.matchAll(mentionPattern)];
        for (const match of matches) {
            const username = match[1];
            const targetUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
            if (targetUser && targetUser._id.toString() !== req.user!.userId) {
                // Check if target is in room
                const isMember = await ChatRoomMember.findOne({ room_id: room._id, user_id: targetUser._id });
                if (isMember) {
                    await Notification.create({
                        user_id: targetUser._id,
                        sender_id: req.user!.userId,
                        type: 'mention',
                        title: `${user?.display_name} mentioned you in ${room.name}`,
                        content: content.substring(0, 100),
                        reference_id: room._id.toString()
                    });
                }
            }
        }

        const response = {
            message: {
                id: newMessage._id.toString(),
                content,
                userId: req.user!.userId,
                username: user?.username,
                displayName: user?.display_name,
                avatarUrl: user?.avatar_url,
                createdAt: newMessage.created_at,
                linkPreview: newMessage.link_preview,
            },
        };

        // Emit via socket
        socketService.emitChatMessage(req.params.id as string, response.message);

        res.status(201).json(response);
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ── DELETE /api/chatrooms/:roomId/messages/:messageId ──
router.delete('/:roomId/messages/:messageId', authenticate, async (req: AuthRequest, res) => {
    try {
        const { roomId, messageId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(roomId) || !mongoose.Types.ObjectId.isValid(messageId)) {
            res.status(400).json({ error: 'Invalid ID(s)' });
            return;
        }
        const msg = await ChatMessage.findById(messageId);

        if (!msg) {
            res.status(404).json({ error: 'Message not found' });
            return;
        }

        if (msg.room_id.toString() !== roomId) {
            res.status(400).json({ error: 'Message does not belong to this room' });
            return;
        }

        if (msg.user_id.toString() !== req.user!.userId && req.user!.role !== 'admin') {
            res.status(403).json({ error: 'Not authorized to delete this message' });
            return;
        }

        await ChatMessage.deleteOne({ _id: messageId });
        socketService.emitMessageDeleted(String(roomId), String(messageId));

        res.json({ message: 'Message deleted' });
    } catch (err) {
        console.error('Delete message error:', err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// ── DELETE /api/chatrooms/:roomId/users/:userId/messages (Admin) ──
router.delete('/:roomId/users/:userId/messages', authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { roomId, userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(roomId) || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(400).json({ error: 'Invalid ID(s)' });
            return;
        }

        const result = await ChatMessage.deleteMany({ room_id: roomId, user_id: userId });

        if (result.deletedCount > 0) {
            socketService.emitUserMessagesDeleted(String(roomId), String(userId));
        }

        res.json({ message: `Deleted ${result.deletedCount} messages` });
    } catch (err) {
        console.error('Delete user messages error:', err);
        res.status(500).json({ error: 'Failed to delete user messages' });
    }
});

// ── DELETE /api/chatrooms/:id (Admin only) ──────────────────
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
        await ChatRoom.updateOne({ _id: req.params.id }, { $set: { is_active: false } });

        // Cleanup messages and members
        await Promise.all([
            ChatMessage.deleteMany({ room_id: req.params.id }),
            ChatRoomMember.deleteMany({ room_id: req.params.id })
        ]);

        res.json({ message: 'Chat room deactivated and cleaned up' });
    } catch (err) {
        console.error('Delete room error:', err);
        res.status(500).json({ error: 'Failed to delete chat room' });
    }
});

export default router;



