
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { chatApi } from '../services/api';
import { ChatRoom, ChatMessage } from '../types';
import { MessageCircle, Trash2, Send, Plus, Lock, Shield } from 'lucide-react';
import LinkPreview from '../components/Common/LinkPreview';

export default function ChatRooms() {
    const { user } = useAuth();
    const { socket, status } = useSocket();
    const [rooms, setRooms] = useState<ChatRoom[]>([]);
    const [activeRoom, setActiveRoom] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [roomInfo, setRoomInfo] = useState<any>(null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newRoom, setNewRoom] = useState({ name: '', description: '', accessType: 'invite' });
    const [isMuted, setIsMuted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // @mention state
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionStartPos, setMentionStartPos] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);

    const isAdmin = user?.role === 'admin';
    // Track rooms the user has been kicked from to prevent UI glitches
    const [kickedRooms, setKickedRooms] = useState<Set<string>>(new Set());

    // User Actions Modal State
    const [userActionsTarget, setUserActionsTarget] = useState<{ userId: string; displayName: string; avatarUrl: string } | null>(null);

    const handleDeleteMessage = async (messageId: string) => {
        if (!activeRoom) return;
        if (!window.confirm('Delete this message?')) return;
        try {
            await chatApi.deleteMessage(activeRoom, messageId);
            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (err) {
            console.error('Failed to delete message:', err);
        }
    };

    const handleDeleteAllUserMessages = async () => {
        if (!activeRoom || !userActionsTarget) return;
        if (!window.confirm(`Delete ALL messages from ${userActionsTarget.displayName}? This cannot be undone.`)) return;
        try {
            await chatApi.deleteUserMessages(activeRoom, userActionsTarget.userId);
            setUserActionsTarget(null);
        } catch (err) {
            console.error('Failed to delete user messages:', err);
        }
    };

    useEffect(() => {
        chatApi.getRooms()
            .then(d => setRooms(d.rooms))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const loadMessages = useCallback(async (roomId: string) => {
        try {
            const data = await chatApi.getMessages(roomId);
            setMessages(data.messages);
            setMembers(data.members);
            setRoomInfo(data.room);
            setIsMuted(!!data.isMuted);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (err: any) {
            // Attempt auto-join for open rooms on 403
            if (err.message?.includes('403')) {
                const room = rooms.find(r => r.id === roomId);
                if (room && (room.accessType === 'open' || isAdmin)) {
                    try {
                        await chatApi.joinRoom(roomId);
                        const data = await chatApi.getMessages(roomId);
                        setMessages(data.messages);
                        setMembers(data.members);
                        setRoomInfo(data.room);
                        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isJoined: true, memberCount: r.memberCount + 1 } : r));
                        return;
                    } catch { }
                }
            }
            setError(err.message || 'Failed to load messages');
        }
    }, [rooms, isAdmin]);

    const handleSelectRoom = async (room: ChatRoom) => {
        // Block if user was kicked from this room
        if (kickedRooms.has(room.id)) {
            setError('You have been kicked from this room. Only an admin can add you back.');
            setTimeout(() => setError(null), 4000);
            return;
        }
        if (!room.isJoined) {
            if (room.accessType === 'open' || isAdmin) {
                try {
                    await chatApi.joinRoom(room.id);
                    setRooms(prev => prev.map(r => r.id === room.id ? { ...r, isJoined: true, memberCount: r.memberCount + 1 } : r));
                } catch (err: any) {
                    const msg = err?.message || '';
                    if (msg.includes('kicked')) {
                        setKickedRooms(prev => new Set(prev).add(room.id));
                        setError('You have been kicked from this room. Only an admin can add you back.');
                        setTimeout(() => setError(null), 4000);
                    }
                    return; // Don't open if join failed
                }
            } else {
                return; // Cannot open invite-only if not joined
            }
        }
        setActiveRoom(room.id);
        setError(null);
        await loadMessages(room.id);
    };

    useEffect(() => {
        if (!socket || !activeRoom) return;

        // Join the room
        socket.emit('joinChat', activeRoom);

        const handleNewMessage = ({ roomId, message }: { roomId: string, message: ChatMessage }) => {
            if (roomId === activeRoom) {
                setMessages(prev => {
                    if (prev.find(m => m.id === message.id)) return prev;
                    return [...prev, message];
                });
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
            }
        };

        const handleChatError = ({ roomId, error: errText }: { roomId: string, error: string }) => {
            if (roomId === activeRoom) {
                setError(errText);
                // If it's a kick-related error, force exit the room
                if (errText.toLowerCase().includes('kicked') || errText.toLowerCase().includes('no longer a member')) {
                    // Immediately leave the socket room
                    socket.emit('leaveChat', roomId);
                    setIsMuted(true); // Disable input immediately
                    setKickedRooms(prev => new Set(prev).add(roomId));
                    setTimeout(() => {
                        setActiveRoom(null);
                        setRoomInfo(null);
                        setMessages([]);
                        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isJoined: false, memberCount: Math.max(0, r.memberCount - 1) } : r));
                    }, 2000); // Show error for 2 seconds before clearing
                } else {
                    setTimeout(() => setError(null), 5000);
                }
            }
        };

        socket.on('newChatMessage', handleNewMessage);
        socket.on('chatError', handleChatError);
        socket.on('messageDeleted', ({ roomId, messageId }: { roomId: string, messageId: string }) => {
            if (activeRoom === roomId) {
                setMessages(prev => prev.filter(m => m.id !== messageId));
            }
        });
        socket.on('userMessagesDeleted', ({ roomId, userId }: { roomId: string, userId: string }) => {
            if (activeRoom === roomId) {
                setMessages(prev => prev.filter(m => m.userId !== userId));
            }
        });

        socket.on('memberKicked', ({ roomId }: { roomId: string }) => {
            // ── FRONTEND LEVEL: Immediate forced eviction ──
            // Step 1: Force-leave the socket room to stop receiving messages
            socket.emit('leaveChat', roomId);

            // Step 2: Track this room as kicked to prevent re-selection glitch
            setKickedRooms(prev => new Set(prev).add(roomId));

            if (roomId === activeRoom) {
                // Step 3: Disable input immediately
                setIsMuted(true);
                setError('You have been kicked from this room by an admin.');

                // Step 4: Clear room state after brief delay for user to see the message
                setTimeout(() => {
                    setActiveRoom(null);
                    setRoomInfo(null);
                    setMessages([]);
                    setMembers([]);
                }, 2000);
            }

            // Step 5: Update room list
            setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isJoined: false, memberCount: Math.max(0, r.memberCount - 1) } : r));
        });

        socket.on('roomAccessChanged', ({ roomId, accessType }: { roomId: string, accessType: 'open' | 'invite' }) => {
            setRooms(prev => prev.map(r => r.id === roomId ? { ...r, accessType } : r));
        });

        socket.on('memberListUpdated', ({ roomId }: { roomId: string }) => {
            if (roomId === activeRoom) {
                loadMessages(roomId);
            }
        });

        return () => {
            socket.emit('leaveChat', activeRoom);
            socket.off('newChatMessage', handleNewMessage);
            socket.off('chatError', handleChatError);
            socket.off('memberKicked');
            socket.off('roomAccessChanged');
            socket.off('memberListUpdated');
        };
    }, [socket, activeRoom, status === 'connected']);

    const handleJoin = async (room: ChatRoom) => {
        try {
            await chatApi.joinRoom(room.id);
            const joinedRoom = { ...room, isJoined: true, memberCount: room.memberCount + 1 };
            setRooms(prev => prev.map(r => r.id === room.id ? joinedRoom : r));
            await handleSelectRoom(joinedRoom);
        } catch { }
    };

    const handleLeave = async (roomId: string) => {
        try {
            await chatApi.leaveRoom(roomId);
            setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isJoined: false, memberCount: r.memberCount - 1 } : r));
            if (activeRoom === roomId) {
                if (socket) socket.emit('leaveChat', roomId);
                setActiveRoom(null);
                setMessages([]);
            }
        } catch { }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeRoom || !newMessage.trim() || !socket) return;

        // Final guard: don't send if kicked
        if (kickedRooms.has(activeRoom)) {
            setError('You have been kicked from this room.');
            setIsMuted(true);
            return;
        }

        setSending(true);
        setError(null);
        try {
            socket.emit('sendChatMessage', { roomId: activeRoom, content: newMessage.trim() });
            setNewMessage('');
            setShowMentionDropdown(false);
        } catch (err: any) {
            setError(err.message || 'Failed to send message');
        }
        setSending(false);
    };

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRoom.name.trim()) return;
        try {
            await chatApi.createRoom({
                name: newRoom.name.trim(),
                description: newRoom.description.trim(),
                accessType: newRoom.accessType
            });
            const data = await chatApi.getRooms();
            setRooms(data.rooms);
            setNewRoom({ name: '', description: '', accessType: 'open' });
            setShowCreateForm(false);
        } catch { }
    };

    const handleDeleteRoom = async (roomId: string) => {
        if (!confirm('Are you sure you want to delete this chat room?')) return;
        try {
            await chatApi.deleteRoom(roomId);
            setRooms(prev => prev.filter(r => r.id !== roomId));
            if (activeRoom === roomId) {
                setActiveRoom(null);
                setMessages([]);
            }
        } catch { }
    };

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // @mention helpers
    const filteredMentionMembers = members.filter(m =>
        m.id !== user?.id &&
        (m.username.toLowerCase().includes(mentionQuery.toLowerCase()) ||
            m.displayName.toLowerCase().includes(mentionQuery.toLowerCase()))
    ).slice(0, 8);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNewMessage(val);

        const cursorPos = e.target.selectionStart || 0;
        const textBeforeCursor = val.substring(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex >= 0) {
            const charBefore = lastAtIndex > 0 ? val[lastAtIndex - 1] : ' ';
            const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
            if ((charBefore === ' ' || lastAtIndex === 0) && !/\s/.test(textAfterAt)) {
                setMentionQuery(textAfterAt);
                setMentionStartPos(lastAtIndex);
                setShowMentionDropdown(true);
                setMentionIndex(0);
                return;
            }
        }
        setShowMentionDropdown(false);
    };

    const insertMention = (username: string) => {
        if (mentionStartPos < 0) return;
        const before = newMessage.substring(0, mentionStartPos);
        const cursorPos = inputRef.current?.selectionStart || newMessage.length;
        const after = newMessage.substring(cursorPos);
        const newVal = `${before}@${username} ${after}`;
        setNewMessage(newVal);
        setShowMentionDropdown(false);
        setMentionStartPos(-1);
        setTimeout(() => {
            const pos = before.length + username.length + 2;
            inputRef.current?.setSelectionRange(pos, pos);
            inputRef.current?.focus();
        }, 0);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showMentionDropdown || filteredMentionMembers.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMentionIndex(prev => (prev + 1) % filteredMentionMembers.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMentionIndex(prev => (prev - 1 + filteredMentionMembers.length) % filteredMentionMembers.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insertMention(filteredMentionMembers[mentionIndex].username);
        } else if (e.key === 'Escape') {
            setShowMentionDropdown(false);
        }
    };

    // Extract first URL from a message for link preview
    const extractFirstUrl = (text: string): string | null => {
        const match = text.match(/https?:\/\/[^\s]+/);
        return match ? match[0] : null;
    };

    // Render message content with highlighted @mentions
    const renderMessageContent = (content: string) => {
        const parts = content.split(/(@[a-zA-Z0-9_]+)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                const username = part.slice(1);
                const isSelf = username.toLowerCase() === user?.username?.toLowerCase();
                return (
                    <span key={i} className={`chat-mention ${isSelf ? 'self' : ''}`}>
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    if (loading) return <div className="loading-container"><div className="spinner" /><p>Loading...</p></div>;

    return (
        <div className="chatrooms-page">
            <div className="chat-sidebar">
                <div className="chat-sidebar-header">
                    <h2><MessageCircle className="inline-icon" size={24} /> Chat Rooms</h2>
                    {isAdmin && (
                        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(!showCreateForm)} id="create-room-btn">
                            <Plus size={16} className="inline mr-1" /> New Room
                        </button>
                    )}
                </div>

                {showCreateForm && (
                    <form className="create-room-form" onSubmit={handleCreateRoom}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Room name..."
                            value={newRoom.name}
                            onChange={e => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                            maxLength={100}
                            required
                            id="room-name-input"
                        />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Description (optional)"
                            value={newRoom.description}
                            onChange={e => setNewRoom(prev => ({ ...prev, description: e.target.value }))}
                            maxLength={500}
                        />
                        <div className="form-group mb-2">
                            <select
                                className="form-input w-full"
                                value={newRoom.accessType}
                                onChange={e => setNewRoom(prev => ({ ...prev, accessType: e.target.value }))}
                            >
                                <option value="open">Open for All</option>
                                <option value="invite">Invite Only</option>
                            </select>
                        </div>
                        <button type="submit" className="btn btn-primary btn-sm btn-full" id="create-room-submit">Create Room</button>
                    </form>
                )}

                <div className="room-list">
                    {rooms.map(room => (
                        <div
                            key={room.id}
                            className={`room-item ${activeRoom === room.id ? 'active' : ''}`}
                            onClick={() => (room.isJoined || room.accessType === 'open' || isAdmin) ? handleSelectRoom(room) : undefined}
                        >
                            <div className="room-item-info">
                                <div className="flex items-center gap-1">
                                    <h4>{room.name}</h4>
                                    {room.accessType === 'invite' && <Lock size={12} className="text-gray-500" />}
                                </div>
                                <span className="room-meta">{room.memberCount} members · {room.messageCount} messages</span>
                            </div>
                            <div className="room-item-actions">
                                {room.isJoined ? (
                                    <>
                                        <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); handleLeave(room.id); }}>Leave</button>
                                        {activeRoom !== room.id && (
                                            <button className="btn btn-primary btn-xs" onClick={() => handleSelectRoom(room)}>Open</button>
                                        )}
                                    </>
                                ) : (
                                    (room.accessType === 'open' || isAdmin) ? (
                                        <button className="btn btn-primary btn-xs" onClick={() => handleJoin(room)} id={`join-${room.id}`}>Join</button>
                                    ) : (
                                        <span className="text-xs text-gray-500 italic flex items-center" title="Only an admin can invite you to this room">
                                            <Shield size={10} className="mr-1" /> Invite Only
                                        </span>
                                    )
                                )}
                                {isAdmin && (
                                    <button className="btn btn-ghost btn-xs danger-text" onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id); }}>
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="chat-main">
                {activeRoom && roomInfo ? (
                    <>
                        <div className="chat-header">
                            <div>
                                <h3>{roomInfo.name}</h3>
                                {roomInfo.description && <p className="chat-desc">{roomInfo.description}</p>}
                            </div>
                            <div className="chat-members-count">{members.length} members</div>
                        </div>

                        <div className="chat-messages">
                            {messages.map(msg => {
                                const isOwn = msg.userId === user?.id;
                                const msgUrl = extractFirstUrl(msg.content);
                                // Remove URL from display text if it exists
                                const cleanContent = msgUrl ? msg.content.replace(msgUrl, '').trim() : msg.content;

                                return (
                                    <div key={msg.id} className={`chat-message ${isOwn ? 'own' : ''}`}>
                                        {!isOwn && (
                                            <div
                                                className="chat-msg-avatar cursor-pointer"
                                                onClick={() => setUserActionsTarget({ userId: msg.userId, displayName: msg.displayName, avatarUrl: msg.avatarUrl })}
                                                title="Click for options"
                                            >
                                                {msg.avatarUrl ? <img src={msg.avatarUrl} alt="" /> : <span>{getInitials(msg.displayName)}</span>}
                                            </div>
                                        )}
                                        <div className="chat-msg-body">
                                            {!isOwn && (
                                                <span
                                                    className="chat-msg-author cursor-pointer hover:underline"
                                                    onClick={() => setUserActionsTarget({ userId: msg.userId, displayName: msg.displayName, avatarUrl: msg.avatarUrl })}
                                                >
                                                    {msg.displayName}
                                                </span>
                                            )}

                                            {/* Only show text bubble if there is non-URL text */}
                                            {cleanContent && (
                                                <div className="chat-msg-content">
                                                    {renderMessageContent(cleanContent)}
                                                </div>
                                            )}

                                            {/* Show Link Preview if URL exists */}
                                            {msgUrl && (
                                                <div className="chat-msg-link-preview">
                                                    <LinkPreview url={msgUrl} compact initialData={msg.linkPreview} />
                                                </div>
                                            )}


                                            <div className="chat-msg-actions">
                                                <span className="chat-msg-time">{formatTime(msg.createdAt)}</span>
                                                {(isOwn || isAdmin) && (
                                                    <button
                                                        className="chat-msg-delete-btn"
                                                        onClick={() => handleDeleteMessage(msg.id)}
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {error && (
                            <div className="chat-error-bar" onClick={() => setError(null)}>
                                {error}
                            </div>
                        )}

                        {isMuted && (
                            <div className="muted-bar">
                                <Shield size={16} /> You are muted in this room and cannot send messages.
                            </div>
                        )}

                        <form className="chat-input-form" onSubmit={handleSend} style={{ position: 'relative' }}>
                            {showMentionDropdown && filteredMentionMembers.length > 0 && (
                                <div className="mention-dropdown">
                                    {filteredMentionMembers.map((m, i) => (
                                        <div
                                            key={m.id}
                                            className={`mention-item ${i === mentionIndex ? 'active' : ''}`}
                                            onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
                                            onMouseEnter={() => setMentionIndex(i)}
                                        >
                                            <div className="mention-avatar">
                                                {m.avatarUrl
                                                    ? <img src={m.avatarUrl} alt="" />
                                                    : <span>{getInitials(m.displayName)}</span>
                                                }
                                            </div>
                                            <div className="mention-info">
                                                <span className="mention-name">{m.displayName}</span>
                                                <span className="mention-username">@{m.username}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <textarea
                                ref={inputRef as any}
                                className="form-input chat-input chat-textarea"
                                placeholder="Type a message..."
                                value={newMessage}
                                onChange={(e) => {
                                    handleInputChange(e as any);
                                    e.target.style.height = 'auto'; // Reset height
                                    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'; // Expand up to 150px
                                }}
                                onKeyDown={(e) => {
                                    // Allow Enter to insert new line (default behavior)
                                    // Handle mentions navigation if needed
                                    handleInputKeyDown(e as any);
                                }}
                                maxLength={2000}
                                id="chat-message-input"
                                disabled={isMuted}
                                rows={1}
                                style={{ resize: 'none', overflowY: 'auto' }}
                            />
                            <button type="submit" className="btn btn-primary" disabled={sending || !newMessage.trim() || isMuted} id="send-message-btn">
                                {sending ? '...' : <Send size={20} />}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="chat-empty">
                        <span className="empty-icon"><MessageCircle size={48} /></span>
                        <h2>Select a Chat Room</h2>
                        <p>Join a room and start chatting with the community</p>
                        {isAdmin && <p className="admin-hint">As an admin, you can create new chat rooms using the "+ New Room" button</p>}
                    </div>
                )}
            </div>

            {/* User Actions Modal */}
            {userActionsTarget && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setUserActionsTarget(null)}>
                    <div className="bg-[var(--bg-primary)] p-6 rounded-lg shadow-xl w-full max-w-xs border border-[var(--border-color)]" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-6">
                            <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden bg-[var(--bg-secondary)] flex items-center justify-center">
                                {userActionsTarget.avatarUrl
                                    ? <img src={userActionsTarget.avatarUrl} className="w-full h-full object-cover" />
                                    : <span className="text-2xl font-bold text-[var(--text-secondary)]">{getInitials(userActionsTarget.displayName)}</span>
                                }
                            </div>
                            <h3 className="font-bold text-lg">{userActionsTarget.displayName}</h3>
                        </div>
                        <div className="flex flex-col gap-3">
                            <Link to={`/users/${userActionsTarget.userId}`} className="btn btn-secondary w-full text-center py-2" onClick={() => setUserActionsTarget(null)}>
                                View Profile
                            </Link>
                            {isAdmin && (
                                <button className="btn btn-danger w-full py-2 flex items-center justify-center gap-2" onClick={handleDeleteAllUserMessages}>
                                    <Trash2 size={16} /> Delete All Messages
                                </button>
                            )}
                        </div>
                        <button className="btn btn-ghost w-full mt-2" onClick={() => setUserActionsTarget(null)}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatTime(dateStr: string): string {
    // Only append Z if it's missing (SQLite dates don't have it)
    const normalized = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z';
    const d = new Date(normalized);
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 86400) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString();
}
