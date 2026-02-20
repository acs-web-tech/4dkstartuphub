
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { chatApi } from '../services/api';
import { ChatRoom, ChatMessage } from '../types';
import { MessageCircle, Trash2, Send, Plus, Lock, Shield } from 'lucide-react';
import LinkPreview from '../components/Common/LinkPreview';

export default function ChatRooms() {
    const { user } = useAuth();
    const { socket, status } = useSocket();
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();

    const [rooms, setRooms] = useState<ChatRoom[]>([]);
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
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // @mention state
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionStartPos, setMentionStartPos] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);

    const isAdmin = user?.role === 'admin';
    // Track rooms the user has been kicked from to prevent UI glitches
    const [kickedRooms, setKickedRooms] = useState<Set<string>>(new Set());

    // User Actions Modal State (mainly for admin actions)
    const [userActionsTarget, setUserActionsTarget] = useState<{ userId: string; displayName: string; avatarUrl: string } | null>(null);

    const handleDeleteMessage = async (messageId: string) => {
        if (!roomId) return;
        if (!window.confirm('Delete this message?')) return;
        try {
            await chatApi.deleteMessage(roomId, messageId);
            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (err) {
            console.error('Failed to delete message:', err);
        }
    };

    const handleDeleteAllUserMessages = async () => {
        if (!roomId || !userActionsTarget) return;
        if (!window.confirm(`Delete ALL messages from ${userActionsTarget.displayName}? This cannot be undone.`)) return;
        try {
            await chatApi.deleteUserMessages(roomId, userActionsTarget.userId);
            setUserActionsTarget(null);
        } catch (err) {
            console.error('Failed to delete user messages:', err);
        }
    };

    const loadRooms = useCallback(async () => {
        try {
            const d = await chatApi.getRooms();
            setRooms(d.rooms);
        } catch (err) {
            console.error('Failed to load rooms:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRooms();
    }, [loadRooms]);

    const loadMessages = useCallback(async (rId: string) => {
        try {
            const data = await chatApi.getMessages(rId);
            setMessages(data.messages);
            setMembers(data.members);
            setRoomInfo(data.room);
            setIsMuted(!!data.isMuted);

            // Restore scroll position
            const savedScroll = sessionStorage.getItem(`chat_scroll_${rId}`);
            if (savedScroll && parseInt(savedScroll, 10) > 0) {
                setTimeout(() => {
                    if (chatContainerRef.current) {
                        chatContainerRef.current.scrollTop = parseInt(savedScroll, 10);
                    }
                }, 100);
            } else {
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
        } catch (err: any) {
            // Attempt auto-join for open rooms on 403
            if (err.message?.includes('403')) {
                const room = rooms.find(r => r.id === rId);
                if (room && (room.accessType === 'open' || isAdmin)) {
                    try {
                        await chatApi.joinRoom(rId);
                        // Force socket to join room after DB join
                        if (socket) socket.emit('joinChat', rId);
                        const data = await chatApi.getMessages(rId);
                        setMessages(data.messages);
                        setMembers(data.members);
                        setRoomInfo(data.room);
                        setRooms(prev => prev.map(r => r.id === rId ? { ...r, isJoined: true, memberCount: r.memberCount + 1 } : r));
                        return; // Successfully joined and loaded
                    } catch (joinErr) {
                        console.error('Auto-join failed:', joinErr);
                    }
                }
            }
            setError(err.message || 'Failed to load messages');
        }
    }, [rooms, isAdmin, socket]);

    // Handle room selection and synchronization with roomId param
    useEffect(() => {
        if (roomId) {
            const roomInList = rooms.find(r => r.id === roomId);
            if (roomInList) {
                // If the room is not joined and not open/admin, redirect away
                if (!roomInList.isJoined && roomInList.accessType !== 'open' && !isAdmin) {
                    navigate('/chatrooms');
                    return;
                }
                loadMessages(roomId);
            } else if (rooms.length > 0) {
                // If we have rooms but current roomId isn't there, it might be an admin-opened room not in active list
                // or just a stale id. We attempt to load it anyway as it might just be missing from the summary list.
                loadMessages(roomId);
            }
        } else {
            setRoomInfo(null);
            setMessages([]);
        }
    }, [roomId, rooms, isAdmin, navigate, loadMessages]);

    const handleSelectRoom = (room: ChatRoom) => {
        if (kickedRooms.has(room.id)) {
            setError('You have been kicked from this room. Only an admin can add you back.');
            setTimeout(() => setError(null), 4000);
            return;
        }

        if (room.id !== roomId) {
            navigate(`/chatrooms/${room.id}`);
        }
    };

    // Socket Events Effect
    useEffect(() => {
        if (!socket || !roomId || status !== 'connected') return;

        // Join the room via socket
        socket.emit('joinChat', roomId);

        const handleNewMessage = ({ roomId: msgRoomId, message }: { roomId: string, message: ChatMessage }) => {
            if (msgRoomId === roomId) {
                setMessages(prev => {
                    if (prev.find(m => m.id === message.id)) return prev;
                    return [...prev, message];
                });

                // Only auto-scroll if user is already near the bottom
                if (chatContainerRef.current) {
                    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
                    const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
                    if (isNearBottom) {
                        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                    }
                }
            }
        };

        const handleChatError = ({ roomId: errRoomId, error: errText }: { roomId: string, error: string }) => {
            if (errRoomId === roomId) {
                setError(errText);
                if (errText.toLowerCase().includes('kicked') || errText.toLowerCase().includes('no longer a member')) {
                    socket.emit('leaveChat', errRoomId);
                    setIsMuted(true);
                    setKickedRooms(prev => new Set(prev).add(errRoomId));
                    setTimeout(() => {
                        navigate('/chatrooms');
                        setRoomInfo(null);
                        setMessages([]);
                        setRooms(prev => prev.map(r => r.id === errRoomId ? { ...r, isJoined: false, memberCount: Math.max(0, r.memberCount - 1) } : r));
                    }, 2000);
                } else {
                    setTimeout(() => setError(null), 5000);
                }
            }
        };

        socket.on('newChatMessage', handleNewMessage);
        socket.on('chatError', handleChatError);

        socket.on('messageDeleted', ({ roomId: delRoomId, messageId }: { roomId: string, messageId: string }) => {
            if (delRoomId === roomId) {
                setMessages(prev => prev.filter(m => m.id !== messageId));
            }
        });

        socket.on('userMessagesDeleted', ({ roomId: delRoomId, userId }: { roomId: string, userId: string }) => {
            if (delRoomId === roomId) {
                setMessages(prev => prev.filter(m => m.userId !== userId));
            }
        });

        socket.on('memberKicked', ({ roomId: kickedRoomId }: { roomId: string }) => {
            socket.emit('leaveChat', kickedRoomId);
            setKickedRooms(prev => new Set(prev).add(kickedRoomId));
            if (kickedRoomId === roomId) {
                setIsMuted(true);
                setError('You have been kicked from this room by an admin.');
                setTimeout(() => {
                    navigate('/chatrooms');
                }, 2000);
            }
            setRooms(prev => prev.map(r => r.id === kickedRoomId ? { ...r, isJoined: false, memberCount: Math.max(0, r.memberCount - 1) } : r));
        });

        socket.on('roomAccessChanged', ({ roomId: changeRoomId, accessType }: { roomId: string, accessType: 'open' | 'invite' }) => {
            setRooms(prev => prev.map(r => r.id === changeRoomId ? { ...r, accessType } : r));
        });

        socket.on('memberListUpdated', ({ roomId: updateRoomId }: { roomId: string }) => {
            if (updateRoomId === roomId) {
                loadMessages(roomId);
            }
        });

        return () => {
            socket.emit('leaveChat', roomId);
            socket.off('newChatMessage', handleNewMessage);
            socket.off('chatError', handleChatError);
            socket.off('messageDeleted');
            socket.off('userMessagesDeleted');
            socket.off('memberKicked');
            socket.off('roomAccessChanged');
            socket.off('memberListUpdated');
        };
    }, [socket, roomId, status, navigate, loadMessages]);

    const handleJoin = async (room: ChatRoom) => {
        try {
            await chatApi.joinRoom(room.id);
            setRooms(prev => prev.map(r => r.id === room.id ? { ...r, isJoined: true, memberCount: r.memberCount + 1 } : r));
            navigate(`/chatrooms/${room.id}`);
        } catch (err) {
            console.error('Join failed:', err);
        }
    };

    const handleLeave = async (rId: string) => {
        try {
            await chatApi.leaveRoom(rId);
            setRooms(prev => prev.map(r => r.id === rId ? { ...r, isJoined: false, memberCount: Math.max(0, r.memberCount - 1) } : r));
            if (rId === roomId) {
                navigate('/chatrooms');
            }
        } catch (err) {
            console.error('Leave failed:', err);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomId || !newMessage.trim() || !socket) return;

        if (kickedRooms.has(roomId)) {
            setError('You have been kicked from this room.');
            setIsMuted(true);
            return;
        }

        setSending(true);
        setError(null);
        try {
            socket.emit('sendChatMessage', { roomId, content: newMessage.trim() });
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
            loadRooms();
            setNewRoom({ name: '', description: '', accessType: 'open' });
            setShowCreateForm(false);
        } catch (err) {
            console.error('Create room failed:', err);
        }
    };

    const handleDeleteRoom = async (rId: string) => {
        if (!confirm('Are you sure you want to delete this chat room?')) return;
        try {
            await chatApi.deleteRoom(rId);
            setRooms(prev => prev.filter(r => r.id !== rId));
            if (roomId === rId) {
                navigate('/chatrooms');
            }
        } catch (err) {
            console.error('Delete room failed:', err);
        }
    };

    const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';

    // @mention helpers
    const filteredMentionMembers = members.filter(m =>
        m.id !== user?.id &&
        (m.username.toLowerCase().includes(mentionQuery.toLowerCase()) ||
            m.displayName.toLowerCase().includes(mentionQuery.toLowerCase()))
    ).slice(0, 8);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
            e.preventDefault();
            handleSend(e as any);
            return;
        }

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

    const extractFirstUrl = (text: string): string | null => {
        const match = text.match(/https?:\/\/[^\s]+/);
        return match ? match[0] : null;
    };

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

    if (loading) return <div className="loading-container"><div className="spinner" /><p>Loading Chat...</p></div>;

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
                        <button type="submit" className="btn btn-primary btn-sm btn-full">Create Room</button>
                    </form>
                )}

                <div className="room-list">
                    {rooms.map(room => (
                        <div
                            key={room.id}
                            className={`room-item ${roomId === room.id ? 'active' : ''}`}
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
                                        {roomId !== room.id && (
                                            <button className="btn btn-primary btn-xs" onClick={() => handleSelectRoom(room)}>Open</button>
                                        )}
                                    </>
                                ) : (
                                    (room.accessType === 'open' || isAdmin) ? (
                                        <button className="btn btn-primary btn-xs" onClick={() => handleJoin(room)}>Join</button>
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
                {roomId && roomInfo ? (
                    <>
                        <div className="chat-header">
                            <div>
                                <h3>{roomInfo.name}</h3>
                                {roomInfo.description && <p className="chat-desc">{roomInfo.description}</p>}
                            </div>
                            <div className="chat-members-count">{members.length} members</div>
                        </div>

                        <div
                            className="chat-messages"
                            ref={chatContainerRef}
                            onScroll={(e) => {
                                const target = e.currentTarget;
                                if (roomId) {
                                    sessionStorage.setItem(`chat_scroll_${roomId}`, target.scrollTop.toString());
                                }
                            }}
                        >
                            {messages.map(msg => {
                                const isOwn = msg.userId === user?.id;
                                const msgUrl = extractFirstUrl(msg.content);
                                const cleanContent = msgUrl ? msg.content.replace(msgUrl, '').trim() : msg.content;

                                return (
                                    <div key={msg.id} className={`chat-message ${isOwn ? 'own' : ''}`}>
                                        {!isOwn && (
                                            <div
                                                className="chat-msg-avatar cursor-pointer"
                                                onClick={() => navigate(`/users/${msg.userId}`)}
                                                title="View Profile"
                                            >
                                                {msg.avatarUrl ? <img src={msg.avatarUrl} alt="" /> : <span>{getInitials(msg.displayName)}</span>}
                                            </div>
                                        )}
                                        <div className="chat-msg-body">
                                            {!isOwn && (
                                                <span
                                                    className="chat-msg-author cursor-pointer hover:underline"
                                                    onClick={() => navigate(`/users/${msg.userId}`)}
                                                >
                                                    {msg.displayName}
                                                </span>
                                            )}

                                            {cleanContent && (
                                                <div className="chat-msg-content">
                                                    {renderMessageContent(cleanContent)}
                                                </div>
                                            )}

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
                                                {isAdmin && !isOwn && (
                                                    <button
                                                        className="chat-msg-delete-btn"
                                                        onClick={() => setUserActionsTarget({ userId: msg.userId, displayName: msg.displayName, avatarUrl: msg.avatarUrl })}
                                                        title="Admin Options"
                                                    >
                                                        <Shield size={13} />
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
                                onChange={handleInputChange}
                                onKeyDown={handleInputKeyDown}
                                maxLength={2000}
                                disabled={isMuted}
                                rows={1}
                                style={{ resize: 'none', overflowY: 'auto' }}
                            />
                            <button type="submit" className="btn btn-primary" disabled={sending || !newMessage.trim() || isMuted}>
                                {sending ? '...' : <Send size={20} />}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="chat-empty">
                        <span className="empty-icon"><MessageCircle size={48} /></span>
                        <h2>Select a Chat Room</h2>
                        <p>Join a room and start chatting with the community</p>
                    </div>
                )}
            </div>

            {/* Admin User Actions Modal */}
            {userActionsTarget && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setUserActionsTarget(null)}>
                    <div className="bg-[var(--bg-primary)] p-6 rounded-lg shadow-xl w-full max-w-xs border border-[var(--border-color)]" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-6">
                            <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden bg-[var(--bg-secondary)] flex items-center justify-center">
                                {userActionsTarget.avatarUrl
                                    ? <img src={userActionsTarget.avatarUrl} className="w-full h-full object-cover" alt="" />
                                    : <span className="text-2xl font-bold text-[var(--text-secondary)]">{getInitials(userActionsTarget.displayName)}</span>
                                }
                            </div>
                            <h3 className="font-bold text-lg">{userActionsTarget.displayName}</h3>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button className="btn btn-secondary w-full py-2" onClick={() => { navigate(`/users/${userActionsTarget.userId}`); setUserActionsTarget(null); }}>
                                View Profile
                            </button>
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
    if (!dateStr) return '';
    const normalized = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z';
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return '';
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 86400) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString();
}
