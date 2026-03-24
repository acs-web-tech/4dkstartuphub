
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { chatApi } from '../services/api';
import { ChatRoom, ChatMessage } from '../types';
import { MessageCircle, Trash2, Send, Plus, Lock, Shield, Users, VolumeX, Wifi, RefreshCw, ArrowLeft, AlertTriangle } from 'lucide-react';
import LinkPreview from '../components/Common/LinkPreview';
import { useModal } from '../context/ModalContext';
import { getCdnUrl } from '../utils/cdn';

export default function ChatRooms() {
    const { user } = useAuth();
    const { socket, status } = useSocket();
    const { alert, confirm } = useModal();
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();

    const [rooms, setRooms] = useState<ChatRoom[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [roomInfo, setRoomInfo] = useState<ChatRoom | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newRoom, setNewRoom] = useState({ name: '', description: '', accessType: 'invite' });
    const [isMuted, setIsMuted] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // @mention state
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionStartPos, setMentionStartPos] = useState(-1);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const isAdmin = user?.role === 'admin';
    // Track rooms the user has been kicked from to prevent UI glitches
    const [kickedRooms, setKickedRooms] = useState<Set<string>>(new Set());

    // User Actions Modal State (mainly for admin actions)
    const [userActionsTarget, setUserActionsTarget] = useState<{ userId: string; displayName: string; avatarUrl: string } | null>(null);

    const handleDeleteMessage = async (messageId: string) => {
        if (!roomId) return;
        const confirmed = await confirm('Delete this message?');
        if (!confirmed) return;
        try {
            await chatApi.deleteMessage(roomId, messageId);
            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (err: any) {
            console.error('Failed to delete message:', err);
            await alert(err.message || 'Failed to delete message.');
        }
    };

    const handleDeleteAllUserMessages = async () => {
        if (!roomId || !userActionsTarget) return;
        const confirmed = await confirm(`Delete ALL messages from ${userActionsTarget.displayName}? This cannot be undone.`);
        if (!confirmed) return;
        try {
            await chatApi.deleteUserMessages(roomId, userActionsTarget.userId);
            setUserActionsTarget(null);
            await alert('All messages from this user have been deleted.');
        } catch (err: any) {
            console.error('Failed to delete user messages:', err);
            await alert(err.message || 'Failed to delete user messages.');
        }
    };

    const loadRooms = useCallback(async () => {
        try {
            const d = await chatApi.getRooms();
            setRooms(d.rooms);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load rooms:', err);
            setError(err.message || 'Failed to load rooms');
        } finally {
            setLoading(false);
        }
    }, []);

    const initialLoadDone = useRef(false);

    useEffect(() => {
        loadRooms().then(() => { initialLoadDone.current = true; });
    }, [loadRooms]);

    // Reload rooms on socket reconnection (skip the initial 'connected' event)
    useEffect(() => {
        if (status === 'connected' && initialLoadDone.current) {
            loadRooms();
        }
    }, [status, loadRooms]);

    const loadMessages = useCallback(async (rId: string, pageNum = 1, append = false) => {
        try {
            if (pageNum > 1) setLoadingMore(true);
            const data = await chatApi.getMessages(rId, pageNum, 10);
            
            if (append) {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const newMsgs = data.messages.filter(m => !existingIds.has(m.id));
                    return [...newMsgs, ...prev]; // Prepend older messages when scrolling up
                });
            } else {
                setMessages(data.messages);
            }
            
            setMembers(data.members);
            setRoomInfo(data.room);
            setIsMuted(!!data.isMuted);
            setHasMore(data.pagination.page < data.pagination.totalPages);
            setPage(pageNum);

            if (!append) {
                // Restore scroll position
                const savedScroll = sessionStorage.getItem(`chat_scroll_${rId}`);
                if (savedScroll && parseInt(savedScroll, 10) > 0) {
                    setTimeout(() => {
                        if (chatContainerRef.current) {
                            chatContainerRef.current.scrollTop = parseInt(savedScroll, 10);
                        }
                    }, 50);
                } else {
                    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
                }
            }
        } catch (err: any) {
            // Attempt auto-join for open rooms on 403
            if (err.message?.includes('403')) {
                // If the user was kicked, don't attempt auto-join
                if (kickedRooms.has(rId)) {
                    setError('You have been removed from this room.');
                    return;
                }

                const room = rooms.find(r => r.id === rId);
                if (room && (room.accessType === 'open' || isAdmin)) {
                    try {
                        await chatApi.joinRoom(rId);
                        if (socket) socket.emit('joinChat', rId);
                        const data = await chatApi.getMessages(rId, 1, 10);
                        setMessages(data.messages);
                        setMembers(data.members);
                        setRoomInfo(data.room);
                        setHasMore(data.pagination.page < data.pagination.totalPages);
                        setPage(1);
                        setRooms(prev => prev.map(r => r.id === rId ? { ...r, isJoined: true, memberCount: (r.memberCount || 0) + 1 } : r));
                        return;
                    } catch (joinErr: any) {
                        console.error('Auto-join failed:', joinErr);
                        await alert(joinErr.message || 'Unable to join this room. You may need an admin to invite you.');
                        navigate('/chatrooms');
                        return;
                    }
                }
                // Invite-only room that user can't access
                const roomName = rooms.find(r => r.id === rId)?.name || 'this room';
                await alert(`🔒 ${roomName} is a private room.\nOnly invited members can view messages. Contact an admin to get invited.`);
                navigate('/chatrooms');
                return;
            }
            setError(err.message || 'Failed to load messages');
        } finally {
            if (pageNum > 1) setLoadingMore(false);
        }
    }, [rooms, isAdmin, socket, alert, navigate, kickedRooms]);

    // Handle room selection and synchronization with roomId param
    useEffect(() => {
        if (roomId) {
            if (kickedRooms.has(roomId)) {
                // Ignore load requests if actively kicked in current session
                return;
            }

            const roomInList = rooms.find(r => r.id === roomId);
            if (roomInList) {
                // If the room is not joined and not open/admin, show message and redirect
                if (!roomInList.isJoined && roomInList.accessType !== 'open' && !isAdmin) {
                    alert(`🔒 "${roomInList.name}" is an invite-only room.\nYou need an admin to invite you before you can view or send messages.`);
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
    }, [roomId, rooms, isAdmin, navigate, loadMessages, alert, kickedRooms]);

    const handleSelectRoom = (room: ChatRoom) => {
        if (kickedRooms.has(room.id)) {
            alert('⛔ You have been removed from this room by an admin.\nOnly an admin can add you back.');
            return;
        }

        if (!room.isJoined && room.accessType === 'invite' && !isAdmin) {
            alert(`🔒 "${room.name}" is an invite-only room.\nContact an admin to get invited.`);
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
                if (errText.toLowerCase().includes('kicked') || errText.toLowerCase().includes('no longer a member')) {
                    socket.emit('leaveChat', errRoomId);
                    setIsMuted(true);
                    setKickedRooms(prev => new Set(prev).add(errRoomId));
                    setRoomInfo(null);
                    setMessages([]);
                    setRooms(prev => prev.map(r => r.id === errRoomId ? { ...r, isJoined: false, memberCount: Math.max(0, r.memberCount - 1) } : r));
                    
                    // Don't show alert if they are just quickly browsing or leaving
                    setTimeout(() => {
                        navigate('/chatrooms');
                        alert('⛔ You have been removed from this room.\nYou can no longer send or view messages here. Contact an admin if you believe this was a mistake.');
                    }, 0);
                } else if (errText.toLowerCase().includes('muted')) {
                    setIsMuted(true);
                    alert('🔇 You have been muted in this room.\nYou can still read messages, but you cannot send new ones until an admin unmutes you.');
                } else {
                    setError(errText);
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
            setRooms(prev => prev.map(r => r.id === kickedRoomId ? { ...r, isJoined: false, memberCount: Math.max(0, r.memberCount - 1) } : r));
            if (kickedRoomId === roomId) {
                setIsMuted(true);
                setRoomInfo(null);
                setMessages([]);
                setTimeout(() => {
                    navigate('/chatrooms');
                    alert('⛔ You have been removed from this room by an admin.\nYou have been redirected to the chat rooms list.');
                }, 0);
            }
        });

        socket.on('roomAccessChanged', ({ roomId: changeRoomId, accessType }: { roomId: string, accessType: 'open' | 'invite' }) => {
            setRooms(prev => prev.map(r => r.id === changeRoomId ? { ...r, accessType } : r));

            if (changeRoomId === roomId) {
                // Instantly update local room info so UI reflects change
                setRoomInfo(prev => prev ? { ...prev, accessType } : null);

                // If it became open, we try to load messages (which triggers auto-join if needed)
                if (accessType === 'open') {
                    loadMessages(changeRoomId);
                }

                // If it became invite and we are not a member, the useEffect (rooms dependency) 
                // will eventually kick us out, but we can do it faster here
                const room = rooms.find(r => r.id === changeRoomId);
                if (accessType === 'invite' && room && !room.isJoined && !isAdmin) {
                    navigate('/chatrooms');
                }
            }
        });

        socket.on('roomDeleted', ({ roomId: deletedRoomId }: { roomId: string }) => {
            setRooms(prev => prev.filter(r => r.id !== deletedRoomId));
            if (deletedRoomId === roomId) {
                setRoomInfo(null);
                setMessages([]);
                alert('🗑️ This chat room has been deleted by an admin.\nAll messages have been removed.').then(() => {
                    navigate('/chatrooms');
                });
            }
        });

        socket.on('memberListUpdated', ({ roomId: updateRoomId }: { roomId: string }) => {
            if (updateRoomId === roomId) {
                loadMessages(roomId);
            }
        });

        socket.on('memberAdded', ({ roomId: addedRoomId }: { roomId: string }) => {
            setKickedRooms(prev => {
                const next = new Set(prev);
                next.delete(addedRoomId);
                return next;
            });
            setRooms(prev => prev.map(r => r.id === addedRoomId ? { ...r, isJoined: true, memberCount: (r.memberCount || 0) + 1 } : r));
            
            if (addedRoomId === roomId) {
                setIsMuted(false);
                setError(null);
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
            socket.off('roomDeleted');
            socket.off('memberListUpdated');
            socket.off('memberAdded');
        };
    }, [socket, roomId, status, navigate, loadMessages]);

    const handleJoin = async (room: ChatRoom) => {
        try {
            await chatApi.joinRoom(room.id);
            setRooms(prev => prev.map(r => r.id === room.id ? { ...r, isJoined: true, memberCount: (r.memberCount || 0) + 1 } : r));
            navigate(`/chatrooms/${room.id}`);
        } catch (err: any) {
            console.error('Join failed:', err);
            if (err.message?.toLowerCase().includes('already')) {
                // Recover silently for race conditions
                setRooms(prev => prev.map(r => r.id === room.id ? { ...r, isJoined: true } : r));
                navigate(`/chatrooms/${room.id}`);
            } else if (err.message?.includes('kicked')) {
                await alert('⛔ You have been removed from this room.\nOnly an admin can add you back.');
            } else if (err.message?.includes('invite')) {
                await alert(`🔒 "${room.name}" is an invite-only room.\nContact an admin to get invited.`);
            } else {
                await alert(err.message || 'Failed to join this room. Please try again.');
            }
        }
    };

    const handleLeave = async (rId: string) => {
        const roomName = rooms.find(r => r.id === rId)?.name || 'this room';
        const confirmed = await confirm(`Leave "${roomName}"?\nYou can rejoin anytime if the room is public, or ask an admin to re-invite you.`, 'Confirm Leave', 'Leave Room', 'Cancel', false);
        if (!confirmed) return;
        try {
            await chatApi.leaveRoom(rId);
            setRooms(prev => prev.map(r => r.id === rId ? { ...r, isJoined: false, memberCount: Math.max(0, r.memberCount - 1) } : r));
            if (rId === roomId) {
                navigate('/chatrooms');
            }
        } catch (err: any) {
            console.error('Leave failed:', err);
            await alert(err.message || 'Failed to leave room. Please try again.');
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
            await alert(err.message || 'Failed to send message. Please check your connection and try again.');
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
        if (!roomId) return;
        const confirmed = await confirm('Are you sure you want to delete this chat room?');
        if (!confirmed) return;
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

        // Read cursor position from the native DOM ref to avoid React synthetic event pooling issues
        const cursorPos = inputRef.current?.selectionStart ?? e.target.selectionStart ?? val.length;
        const textBeforeCursor = val.substring(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex >= 0) {
            const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
            // Only trigger mention if @ is at the start or preceded by whitespace
            if (charBeforeAt === ' ' || charBeforeAt === '\n' || lastAtIndex === 0) {
                const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
                if (!/\s/.test(textAfterAt) && textAfterAt.length <= 30) {
                    setMentionQuery(textAfterAt);
                    setMentionStartPos(lastAtIndex);
                    setShowMentionDropdown(true);
                    setMentionIndex(0);
                    return;
                }
            }
        }
        setShowMentionDropdown(false);
    };

    const insertMention = (username: string) => {
        if (mentionStartPos < 0) return;
        const before = newMessage.substring(0, mentionStartPos);
        const cursorPos = inputRef.current?.selectionStart ?? newMessage.length;
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
        <div className={`chatrooms-page ${roomId ? 'has-active-room' : ''}`}>
            <div className="chat-sidebar">
                <div className="chat-sidebar-header">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2><MessageCircle className="inline-icon" size={24} /> Chat Rooms</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', marginLeft: '4px' }}>
                            <span
                                className={status === 'reconnecting' ? 'animate-pulse' : ''}
                                style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: status === 'connected' ? 'var(--green)' : status === 'reconnecting' ? 'var(--yellow)' : 'var(--red)'
                                }}
                            />
                            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                                {status === 'connected' ? 'Live' : status === 'reconnecting' ? 'Reconnecting' : 'Offline'}
                            </span>
                        </div>
                    </div>
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
                    {rooms.length === 0 && error && !loading && (
                        <div className="p-6 text-center">
                            <Wifi size={32} className="text-gray-500 mx-auto mb-2 opacity-50" />
                            <p className="text-sm text-gray-400 mb-3">Failed to load rooms</p>
                            <button className="btn btn-primary btn-sm mx-auto" onClick={loadRooms}>
                                <RefreshCw size={14} className="mr-1" /> Retry
                            </button>
                        </div>
                    )}
                    {rooms.map(room => (
                        <div
                            key={room.id}
                            className={`room-item ${roomId === room.id ? 'active' : ''} ${(!room.isJoined && room.accessType === 'invite' && !isAdmin) ? 'room-item-locked' : ''}`}
                            onClick={() => handleSelectRoom(room)}
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
                                <div className="flex items-center gap-2">
                                    <button 
                                        className="mobile-back-btn" 
                                        onClick={() => navigate('/chatrooms')}
                                        title="Back to rooms"
                                    >
                                        <ArrowLeft size={18} />
                                    </button>
                                    <h3>{roomInfo.name}</h3>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '2px 8px',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        borderRadius: '12px',
                                        whiteSpace: 'nowrap',
                                        marginLeft: '8px',
                                        background: roomInfo.accessType === 'invite' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                        color: roomInfo.accessType === 'invite' ? '#facc15' : '#4ade80',
                                        border: `1px solid ${roomInfo.accessType === 'invite' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
                                    }}>
                                        {roomInfo.accessType === 'invite' ? (
                                            <><Lock size={10} style={{ marginRight: '4px' }} /> Private</>
                                        ) : (
                                            <><Users size={10} style={{ marginRight: '4px' }} /> Public</>
                                        )}
                                    </span>
                                </div>
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
                                
                                if (target.scrollTop === 0 && hasMore && !loadingMore && roomId) {
                                    const oldHeight = target.scrollHeight;
                                    loadMessages(roomId, page + 1, true).then(() => {
                                        setTimeout(() => {
                                            if (chatContainerRef.current) {
                                                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight - oldHeight;
                                            }
                                        }, 0);
                                    });
                                }
                            }}
                        >
                            {loadingMore && (
                                <div style={{ textAlign: 'center', padding: '10px 0', opacity: 0.6 }}>
                                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto' }} />
                                </div>
                            )}
                            {messages.length === 0 && !loadingMore && (
                                <div className="chat-empty-messages">
                                    <MessageCircle size={36} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No messages yet</p>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', opacity: 0.6 }}>Be the first to say something!</p>
                                </div>
                            )}
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
                                                {msg.avatarUrl ? <img src={getCdnUrl(msg.avatarUrl)} alt="" /> : <span>{getInitials(msg.displayName)}</span>}
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
                                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                <span>{error}</span>
                                <span style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: 'auto' }}>tap to dismiss</span>
                            </div>
                        )}

                        {isMuted && (
                            <div className="muted-bar">
                                <VolumeX size={16} /> You are muted in this room. Contact an admin to get unmuted.
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
                                                    ? <img src={getCdnUrl(m.avatarUrl)} alt="" />
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
                                ref={inputRef}
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
                        <p>Choose a room from the sidebar to start chatting</p>
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={14} /> <strong>Public rooms</strong> — anyone can join and chat</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Lock size={14} /> <strong>Private rooms</strong> — admin invitation required</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Admin User Actions Modal */}
            {userActionsTarget && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                    onClick={() => setUserActionsTarget(null)}
                >
                    <div
                        className="card"
                        style={{ width: '100%', maxWidth: '340px', padding: '24px', textAlign: 'center' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mb-6">
                            <div className="avatar avatar-xl mx-auto mb-3" style={{ margin: '0 auto 12px' }}>
                                {userActionsTarget.avatarUrl
                                    ? <img src={getCdnUrl(userActionsTarget.avatarUrl)} alt="" />
                                    : <span>{getInitials(userActionsTarget.displayName)}</span>
                                }
                            </div>
                            <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)', fontSize: '1.2rem' }}>{userActionsTarget.displayName}</h3>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button
                                className="btn btn-secondary btn-full"
                                onClick={() => { navigate(`/users/${userActionsTarget.userId}`); setUserActionsTarget(null); }}
                            >
                                View Profile
                            </button>
                            {isAdmin && (
                                <button
                                    className="btn btn-full"
                                    style={{ backgroundColor: 'var(--red)', color: 'white', border: 'none' }}
                                    onClick={handleDeleteAllUserMessages}
                                >
                                    <Trash2 size={16} /> Delete All Messages
                                </button>
                            )}
                            <button className="btn btn-ghost btn-full" onClick={() => setUserActionsTarget(null)}>
                                Cancel
                            </button>
                        </div>
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
    return d.toLocaleDateString('en-GB');
}
