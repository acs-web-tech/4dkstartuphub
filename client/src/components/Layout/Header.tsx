
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usersApi, postsApi } from '../../services/api';
import { AppNotification } from '../../types';
import {
    Rocket, Search, Bell, Heart, MessageSquare, AtSign, Megaphone, MessageCircle, Sparkles,
    User, Bookmark, Settings, LogOut, X, ExternalLink, Menu, Repeat, Wifi, Mail
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
    const [showContactModal, setShowContactModal] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [selectedNotif, setSelectedNotif] = useState<AppNotification | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const [bellRing, setBellRing] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const [searchResults, setSearchResults] = useState<{ users: any[]; posts: any[] }>({ users: [], posts: [] });
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track previous state to detect NEW notifications
    const isFirstFetchRef = useRef(true);

    const fetchNotifs = useCallback(() => {
        if (!user) return;
        usersApi.getNotifications().then(d => {
            const newNotifications = d.notifications;
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

                setUnreadCount(0);
                setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
            });

            socket.on('broadcast', (data: any) => {

                // Use the persisted notification id from the server if available
                const notifId = (data._notifMap && user?.id && data._notifMap[user.id]) || `bc-${Date.now()}`;

                const notif: AppNotification = {
                    id: notifId,
                    type: 'broadcast',
                    title: data.title || 'Broadcast',
                    content: data.content,
                    imageUrl: data.imageUrl || '',
                    videoUrl: data.videoUrl || '',
                    isRead: 0,
                    createdAt: new Date().toISOString(),
                    senderDisplayName: 'Admin Team',
                    senderId: 'admin',
                    senderAvatarUrl: '',
                    senderUsername: 'admin',
                    referenceId: data.referenceId || ''
                };

                setNotifications(prev => {
                    if (prev.some(n => n.id === notifId)) return prev;
                    return [notif, ...prev];
                });
                setUnreadCount(prev => prev + 1);
                playNotificationSound();
                setBellRing(true);
                setTimeout(() => setBellRing(false), 700);

                // Browser Native Notification for Broadcast (with banner image)
                if ('Notification' in window && Notification.permission === 'granted') {
                    const cleanContent = (data.content || '').replace(/<[^>]*>?/gm, '');
                    const notifOptions: any = {
                        body: cleanContent,
                        icon: '/logo.png',
                    };
                    if (data.imageUrl) {
                        notifOptions.image = data.imageUrl;
                    }
                    new Notification(data.title || 'Broadcast Alert', notifOptions);
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
            setShowSearchDropdown(false);
        }
    };

    // Debounced live search
    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (!search.trim() || search.trim().length < 2) {
            setSearchResults({ users: [], posts: [] });
            setShowSearchDropdown(false);
            return;
        }
        setSearchLoading(true);
        searchTimerRef.current = setTimeout(() => {
            Promise.all([
                usersApi.getAll({ search: search.trim(), page: 1 }).catch(() => ({ users: [] })),
                postsApi.getAll({ search: search.trim(), limit: 5 }).catch(() => ({ posts: [] }))
            ]).then(([userData, postData]) => {
                setSearchResults({
                    users: (userData.users || []).slice(0, 4),
                    posts: (postData.posts || []).slice(0, 4)
                });
                setShowSearchDropdown(true);
            }).finally(() => setSearchLoading(false));
        }, 300);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [search]);

    // Close search dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSearchDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

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
        if (!n.isRead) {
            usersApi.markOneRead(n.id).catch(() => { });
            setNotifications(prev => prev.map(notification =>
                notification.id === n.id ? { ...notification, isRead: 1 } : notification
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
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
            case 'broadcast': return <Megaphone size={14} />;
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
            case 'admin': return 'sent a notification';
            case 'broadcast': return 'sent a broadcast';
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
            case 'broadcast': return '#a371f7';
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

                <div className="search-wrapper" ref={searchRef}>
                    <form className="search-bar" onSubmit={handleSearch}>
                        <Search size={18} className="search-icon text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search posts, people..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onFocus={() => { if (searchResults.users.length || searchResults.posts.length) setShowSearchDropdown(true); }}
                            maxLength={100}
                            id="global-search"
                        />
                        {search && (
                            <button
                                type="button"
                                className="search-clear-btn"
                                onClick={() => { setSearch(''); setShowSearchDropdown(false); setSearchResults({ users: [], posts: [] }); }}
                                aria-label="Clear search"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </form>
                    {showSearchDropdown && (searchResults.users.length > 0 || searchResults.posts.length > 0) && (
                        <div className="search-dropdown">
                            {searchResults.users.length > 0 && (
                                <div className="search-section">
                                    <div className="search-section-title">People</div>
                                    {searchResults.users.map((u: any) => (
                                        <Link
                                            key={u.id}
                                            to={`/users/${u.id}`}
                                            className="search-result-item"
                                            onClick={() => { setSearch(''); setShowSearchDropdown(false); }}
                                        >
                                            <div className="search-result-avatar">
                                                {u.avatarUrl ? (
                                                    <img src={u.avatarUrl} alt="" />
                                                ) : (
                                                    <span>{getInitials(u.displayName)}</span>
                                                )}
                                            </div>
                                            <div className="search-result-info">
                                                <strong>{u.displayName}</strong>
                                                <span>@{u.username}</span>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                            {searchResults.posts.length > 0 && (
                                <div className="search-section">
                                    <div className="search-section-title">Posts</div>
                                    {searchResults.posts.map((p: any) => (
                                        <Link
                                            key={p.id}
                                            to={`/posts/${p.id}`}
                                            className="search-result-item"
                                            onClick={() => { setSearch(''); setShowSearchDropdown(false); }}
                                        >
                                            <div className="search-result-icon">
                                                <Search size={14} />
                                            </div>
                                            <div className="search-result-info">
                                                <strong>{p.title}</strong>
                                                <span>by {p.displayName}</span>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                            <Link
                                to={`/feed?search=${encodeURIComponent(search.trim())}`}
                                className="search-view-all"
                                onClick={() => { setSearch(''); setShowSearchDropdown(false); }}
                            >
                                View all results for "{search.trim()}"
                            </Link>
                        </div>
                    )}
                </div>

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
                                        <button className="dropdown-item" onClick={() => { setShowDropdown(false); setShowContactModal(true); }}>
                                            <Mail size={16} className="mr-2" /> Contact Us
                                        </button>
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
                            let content = selectedNotif.content || '';
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
                                    {selectedNotif.imageUrl && (
                                        <div style={{ margin: '12px 0', borderRadius: '8px', overflow: 'hidden' }}>
                                            <img
                                                src={selectedNotif.imageUrl}
                                                alt="Notification Banner"
                                                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }}
                                            />
                                        </div>
                                    )}
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

                                        const isChatMention = selectedNotif.type === 'mention' && selectedNotif.title?.includes('in ');

                                        if (isPitch) {
                                            navigate('/pitch-requests');
                                        } else if (isChatMention) {
                                            navigate(`/chat/${selectedNotif.referenceId}`);
                                        } else {
                                            navigate(`/posts/${selectedNotif.referenceId}`);
                                        }

                                        setSelectedNotif(null);
                                    }}
                                >
                                    <ExternalLink size={14} />
                                    {selectedNotif.type === 'admin' && (selectedNotif.title?.startsWith('Pitch') || selectedNotif.content?.toLowerCase().includes('pitch request'))
                                        ? 'View Pitch Request'
                                        : (selectedNotif.type === 'mention' && selectedNotif.title?.includes('in ') ? 'View Chat' : 'View Post')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Contact Us Modal */}
            {showContactModal && (
                <div className="notif-modal-overlay" onClick={() => setShowContactModal(false)}>
                    <div className="notif-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                        <div className="notif-modal-header" style={{ borderBottom: 'none', justifyContent: 'flex-end' }}>
                            <button className="notif-modal-close" onClick={() => setShowContactModal(false)} style={{ color: 'var(--text-secondary)' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ padding: '0 20px 30px' }}>
                            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <Mail size={32} />
                            </div>
                            <h2 style={{ fontSize: '24px', marginBottom: '10px', color: 'var(--text-main)', fontWeight: '800' }}>Contact Support</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                                Need help? Reach out to our team directly.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <a href="mailto:support@4dk.in" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '12px' }}>
                                    <Mail size={18} /> support@4dk.in
                                </a>
                                <a href="mailto:founder@4dk.in" className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-main)' }}>
                                    <User size={18} /> founder@4dk.in
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default memo(Header);

function timeAgo(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
