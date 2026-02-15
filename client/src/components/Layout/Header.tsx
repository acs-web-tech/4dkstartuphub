
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usersApi } from '../../services/api';
import { AppNotification } from '../../types';
import {
    Rocket, Search, Bell, Heart, MessageSquare, AtSign, Megaphone, MessageCircle, Sparkles,
    User, Bookmark, Settings, LogOut, X, ExternalLink, Menu, Repeat, Wifi
} from 'lucide-react';
import { markImageAsLoaded, isImageInSession } from '../../utils/imageCache';
import { SmartImage } from '../Common/SmartImage';

// ── Notification Sound (Web Audio API — no external file needed) ──
let sharedAudioCtx: AudioContext | null = null;

async function playNotificationSound() {
    try {
        if (!sharedAudioCtx) {
            sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        const ctx = sharedAudioCtx;
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        // A pleasant two-tone chime
        const playTone = (freq: number, startTime: number, duration: number, volume: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const now = ctx.currentTime;
        playTone(880, now, 0.15, 0.3);       // A5
        playTone(1174.66, now + 0.12, 0.2, 0.25); // D6
        playTone(1318.51, now + 0.24, 0.3, 0.2);  // E6
    } catch {
        // AudioContext not supported or restricted — silently skip
    }
}

import { useSocket } from '../../context/SocketContext';

function Header({ toggleSidebar }: { toggleSidebar?: () => void }) {
    const { user, logout } = useAuth();
    const { socket } = useSocket();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [showNotif, setShowNotif] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [selectedNotif, setSelectedNotif] = useState<AppNotification | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const [bellRing, setBellRing] = useState(false);

    // Track previous state to detect NEW notifications
    const isFirstFetchRef = useRef(true);

    const fetchNotifs = useCallback(() => {
        if (!user) return;
        usersApi.getNotifications().then(d => {
            const newNotifications = d.notifications.slice(0, 20);
            const newUnread = d.unreadCount;

            setUnreadCount(newUnread);
            setNotifications(newNotifications);
            isFirstFetchRef.current = false;
        }).catch(() => { });
    }, [user]);

    // Initial fetch - Only trigger IF user ID changed
    useEffect(() => {
        if (user?.id) {
            fetchNotifs();
        }
    }, [user?.id, fetchNotifs]);

    // Request notification permission
    useEffect(() => {
        if (user && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    import('../../utils/pushNotifications').then(m => m.subscribeToPushNotifications());
                }
            });
        }
    }, [user]);

    // WebSocket listener for new notifications
    useEffect(() => {
        if (socket) {
            socket.on('notification', (newNotif: AppNotification) => {
                console.log('📬 Real-time notification received:', newNotif);

                // Add to list if not already present
                setNotifications(prev => {
                    if (prev.some(n => n.id === newNotif.id)) return prev;
                    return [newNotif, ...prev].slice(0, 20);
                });

                setUnreadCount(prev => prev + 1);

                // Alert animations & sound
                playNotificationSound();
                setBellRing(true);
                setTimeout(() => setBellRing(false), 700);

                // Browser Native Notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    const cleanContent = newNotif.content.replace(/<[^>]*>?/gm, ''); // Remove HTML tags
                    new Notification(newNotif.senderDisplayName || 'Startup Hub', {
                        body: cleanContent,
                        icon: '/logo.png',
                    });
                }
            });

            socket.on('notificationsRead', () => {
                console.log('📬 Notifications marked as read elsewhere');
                setUnreadCount(0);
                setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
            });

            socket.on('broadcast', (data: any) => {
                console.log('📢 Administrative Broadcast:', data);

                const notif: AppNotification = {
                    id: `bc-${Date.now()}`,
                    type: 'admin',
                    title: data.title || 'Broadcast',
                    content: data.content,
                    isRead: 0,
                    createdAt: new Date().toISOString(),
                    senderDisplayName: 'Admin Team',
                    senderId: 'admin',
                    senderAvatarUrl: '',
                    senderUsername: 'admin',
                    referenceId: data.referenceId || ''
                };

                setNotifications(prev => [notif, ...prev].slice(0, 20));
                setUnreadCount(prev => prev + 1);
                playNotificationSound();
                setBellRing(true);
                setTimeout(() => setBellRing(false), 700);

                // Browser Native Notification for Broadcast
                if ('Notification' in window && Notification.permission === 'granted') {
                    const cleanContent = (data.content || '').replace(/<[^>]*>?/gm, '');
                    new Notification(data.title || 'Broadcast Alert', {
                        body: cleanContent,
                        icon: '/logo.png',
                    });
                }
            });

            return () => {
                socket.off('notification');
                socket.off('notificationsRead');
                socket.off('broadcast');
            };
        }
    }, [socket]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Close modal on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedNotif(null);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (search.trim()) {
            navigate(`/feed?search=${encodeURIComponent(search.trim())}`);
            setSearch('');
        }
    };

    const handleMarkRead = async () => {
        await usersApi.markNotificationsRead();
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const handleNotifClick = (n: AppNotification) => {
        setSelectedNotif(n);
        setShowNotif(false);
    };

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const getNotifIcon = (type: string) => {
        switch (type) {
            case 'like': return <Heart size={14} />;
            case 'comment': return <MessageSquare size={14} />;
            case 'mention': return <AtSign size={14} />;
            case 'admin': return <Megaphone size={14} />;
            case 'chat': return <MessageCircle size={14} />;
            case 'welcome': return <Sparkles size={14} />;
            case 'comment_reply': return <Repeat size={14} />;
            default: return <Bell size={14} />;
        }
    };

    const getNotifTypeLabel = (n: AppNotification) => {
        switch (n.type) {
            case 'like': return 'liked your post';
            case 'comment':
                if (n.title === 'New reply') return 'also commented on a post you follow';
                return 'commented on your post';
            case 'mention': return 'mentioned you';
            case 'admin': return 'sent a broadcast';
            case 'chat': return 'sent you a message';
            case 'welcome': return 'Welcome!';
            case 'comment_reply': return 'also commented on a post you follow';
            default: return '';
        }
    };

    const getNotifTypeColor = (type: string) => {
        switch (type) {
            case 'like': return '#f85149';
            case 'comment': return '#58a6ff';
            case 'mention': return '#db6d28';
            case 'admin': return '#a371f7';
            case 'chat': return '#3fb950';
            case 'welcome': return '#d29922';
            case 'comment_reply': return '#58a6ff';
            default: return '#8b949e';
        }
    };

    return (
        <>
            <header className="header">
                <div className="header-left">
                    <button className="menu-toggle" onClick={toggleSidebar}>
                        <Menu size={24} />
                    </button>
                    <Link to="/" className="logo">
                        <div className='w-12' style={{ color: 'var(--accent)' }}>
                            <img src="/logo.png" alt="Logo" className='rounded' />
                        </div>
                        <span className="logo-text">Startup Hub</span>
                    </Link>
                </div>

                <form className="search-bar" onSubmit={handleSearch}>
                    <Search size={18} className="search-icon text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search posts, people..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        maxLength={100}
                        id="global-search"
                    />
                </form>

                <div className="header-right">
                    {user ? (
                        <>
                            <div className="notif-container" ref={notifRef}>
                                <button
                                    className={`icon-btn notif-btn${bellRing ? ' bell-ring' : ''}`}
                                    onClick={() => setShowNotif(!showNotif)}
                                    id="notifications-btn"
                                    aria-label="Notifications"
                                >
                                    <Bell size={20} />
                                    {unreadCount > 0 && <span className="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                                </button>
                                {showNotif && (
                                    <div className="dropdown notif-dropdown">
                                        <div className="dropdown-header">
                                            <h3>Notifications</h3>
                                            {unreadCount > 0 && (
                                                <button className="text-btn" onClick={handleMarkRead}>Mark all read</button>
                                            )}
                                        </div>
                                        {notifications.length === 0 ? (
                                            <p className="dropdown-empty">No notifications yet</p>
                                        ) : (
                                            <div className="notif-list">
                                                {notifications.map(n => (
                                                    <div
                                                        key={n.id}
                                                        className={`notif-card ${!n.isRead ? 'unread' : ''}`}
                                                        onClick={() => handleNotifClick(n)}
                                                    >
                                                        <div className="notif-card-avatar">
                                                            {n.senderAvatarUrl ? (
                                                                <SmartImage
                                                                    src={n.senderAvatarUrl}
                                                                    alt={n.senderDisplayName}
                                                                />
                                                            ) : (
                                                                <span className="notif-card-initials">
                                                                    {getInitials(n.senderDisplayName || 'SH')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="notif-card-body">
                                                            <div className="notif-card-header-text">
                                                                <strong>{n.senderDisplayName || 'StartupHub'}</strong>
                                                                <span className="notif-card-action">{getNotifTypeLabel(n)}</span>
                                                            </div>
                                                            <div className="notif-card-title">{n.title}</div>
                                                            <div className="notif-card-preview ql-editor-display" dangerouslySetInnerHTML={{ __html: n.content }} />
                                                            <span className="notif-card-time">{timeAgo(n.createdAt)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="profile-container" ref={dropdownRef}>
                                <button
                                    className="avatar-btn"
                                    onClick={() => setShowDropdown(!showDropdown)}
                                    id="profile-menu-btn"
                                >
                                    <div className="avatar">
                                        {user.avatarUrl ? (
                                            <SmartImage
                                                src={user.avatarUrl}
                                                alt={user.displayName}
                                                loading="eager"
                                            />
                                        ) : (
                                            <span>{getInitials(user.displayName)}</span>
                                        )}
                                    </div>
                                </button>
                                {showDropdown && (
                                    <div className="dropdown profile-dropdown">
                                        <div className="dropdown-user-info">
                                            <strong>{user.displayName}</strong>
                                            <span>@{user.username}</span>
                                        </div>
                                        <hr />
                                        <Link to="/profile" className="dropdown-item" onClick={() => setShowDropdown(false)}>
                                            <User size={16} className="mr-2" /> My Profile
                                        </Link>
                                        <Link to="/bookmarks" className="dropdown-item" onClick={() => setShowDropdown(false)}>
                                            <Bookmark size={16} className="mr-2" /> Bookmarks
                                        </Link>
                                        {user.role === 'admin' && (
                                            <Link to="/admin" className="dropdown-item admin-link" onClick={() => setShowDropdown(false)}>
                                                <Settings size={16} className="mr-2" /> Admin Panel
                                            </Link>
                                        )}
                                        <hr />
                                        <button className="dropdown-item logout-btn" onClick={handleLogout}>
                                            <LogOut size={16} className="mr-2" /> Logout
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="auth-buttons">
                            <Link to="/login" className="btn btn-ghost" id="login-btn">Log In</Link>
                            <Link to="/register" className="btn btn-primary" id="register-btn">Sign Up</Link>
                        </div>
                    )}
                </div>
            </header>

            {/* Notification Detail Modal */}
            {selectedNotif && (
                <div className="notif-modal-overlay" onClick={() => setSelectedNotif(null)}>
                    <div className="notif-modal" onClick={e => e.stopPropagation()}>
                        <div className="notif-modal-header">
                            <div className="notif-modal-sender">
                                <div className="notif-modal-avatar">
                                    {selectedNotif.senderAvatarUrl ? (
                                        <SmartImage src={selectedNotif.senderAvatarUrl} alt={selectedNotif.senderDisplayName} />
                                    ) : (
                                        <span className="notif-modal-initials">
                                            {getInitials(selectedNotif.senderDisplayName || 'SH')}
                                        </span>
                                    )}
                                </div>
                                <div className="notif-modal-sender-info">
                                    <strong>{selectedNotif.senderDisplayName || 'StartupHub'}</strong>
                                    {selectedNotif.senderUsername && <span>@{selectedNotif.senderUsername}</span>}
                                </div>
                                <span className="notif-modal-type-pill" style={{ background: getNotifTypeColor(selectedNotif.type) }}>
                                    {getNotifIcon(selectedNotif.type)}
                                    <span>{selectedNotif.type}</span>
                                </span>
                            </div>
                            <button className="notif-modal-close" onClick={() => setSelectedNotif(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="notif-modal-meta">
                            <span className="notif-modal-action">{selectedNotif.senderDisplayName || 'StartupHub'} {getNotifTypeLabel(selectedNotif)}</span>
                            <span className="notif-modal-time">{timeAgo(selectedNotif.createdAt)}</span>
                        </div>

                        <div className="notif-modal-title-section">
                            <h2>{selectedNotif.title}</h2>
                        </div>

                        {(() => {
                            let content = selectedNotif.content;
                            let embedUrl = null;

                            // Extract video URL if present (similar to how we handle it in PostDetail but from content)
                            const match = content.match(/href="([^"]+)"[^>]*>🎬 Watch Video/);
                            if (match) {
                                const url = match[1];
                                content = content.replace(/<div class="broadcast-video">.*?<\/div>/, '');

                                // Conversion logic from PostDetail
                                if (url.includes('youtube.com') || url.includes('youtu.be')) {
                                    let videoId = '';
                                    if (url.includes('youtube.com/watch')) {
                                        try { videoId = new URL(url).searchParams.get('v') || ''; } catch { }
                                    } else if (url.includes('youtu.be')) {
                                        videoId = url.split('/').pop() || '';
                                    } else if (url.includes('youtube.com/embed')) {
                                        embedUrl = url;
                                    }
                                    if (videoId && !embedUrl) embedUrl = `https://www.youtube.com/embed/${videoId}`;
                                } else if (url.includes('vimeo.com')) {
                                    const videoId = url.split('/').pop();
                                    if (videoId) embedUrl = `https://player.vimeo.com/video/${videoId}`;
                                } else {
                                    embedUrl = url;
                                }
                            }

                            return (
                                <>
                                    <div className="notif-modal-content ql-editor-display" dangerouslySetInnerHTML={{ __html: content }} />
                                    {embedUrl && (
                                        <div className="notif-modal-video">
                                            <iframe
                                                src={embedUrl}
                                                title="Video"
                                                frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            />
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                        {selectedNotif.referenceId && (
                            <div className="notif-modal-footer">
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                        // Specific handling for Pitch Requests
                                        const isPitch = selectedNotif.type === 'admin' &&
                                            (selectedNotif.title?.startsWith('Pitch') ||
                                                selectedNotif.content?.toLowerCase().includes('pitch request'));

                                        if (isPitch) {
                                            navigate('/pitch-requests');
                                        } else {
                                            navigate(`/posts/${selectedNotif.referenceId}`);
                                        }

                                        setSelectedNotif(null);
                                    }}
                                >
                                    <ExternalLink size={14} />
                                    {selectedNotif.type === 'admin' && (selectedNotif.title?.startsWith('Pitch') || selectedNotif.content?.toLowerCase().includes('pitch request'))
                                        ? 'View Pitch Request'
                                        : 'View Post'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

export default memo(Header);

function timeAgo(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr + 'Z').getTime();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
}
