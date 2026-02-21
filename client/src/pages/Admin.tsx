
import { useState, useEffect, useMemo, useRef } from 'react';
import { adminApi, chatApi, uploadApi, pitchApi, usersApi } from '../services/api';
import { AdminStats, PitchRequest, User } from '../types';
import {
    Settings, BarChart2, Users, MessageCircle, Megaphone, Trash2, Send, X, Link as LinkIcon,
    Lightbulb, CheckCircle2, XCircle, Clock, Volume2, VolumeX, Shield, UserPlus, LogOut, FileText,
    CreditCard, ToggleLeft, ToggleRight, Rocket, ShieldCheck, Gem, TrendingUp, Download
} from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { editorModules, editorFormats } from '../config/editor';

export default function Admin() {
    const [tab, setTab] = useState<'dashboard' | 'users' | 'rooms' | 'pitch' | 'broadcast' | 'settings'>('dashboard');
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [postsByCategory, setPostsByCategory] = useState<any[]>([]);
    const [topPosters, setTopPosters] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [userPage, setUserPage] = useState(1);
    const [userPagination, setUserPagination] = useState<any>(null);
    const [rooms, setRooms] = useState<any[]>([]);

    // Pitch Requests State
    const [pitches, setPitches] = useState<PitchRequest[]>([]);
    const [pitchFilter, setPitchFilter] = useState<'all' | 'pending' | 'approved' | 'disapproved'>('all');
    const [selectedPitch, setSelectedPitch] = useState<PitchRequest | null>(null);
    const [reviewMessage, setReviewMessage] = useState('');

    // Broadcast State
    const [broadcast, setBroadcast] = useState({ title: '', content: '', videoUrl: '', imageUrl: '' });
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const broadcastQuillRef = useRef<ReactQuill>(null);

    // Chat Room Management State
    const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
    const [roomMembers, setRoomMembers] = useState<any[]>([]);
    const [newMemberSearch, setNewMemberSearch] = useState('');
    const [memberSearchResults, setMemberSearchResults] = useState<User[]>([]);

    // Welcome notification ref
    const welcomeQuillRef = useRef<ReactQuill>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');

    // Settings State
    const [paymentRequired, setPaymentRequired] = useState(true);
    const [isImageUploading, setIsImageUploading] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('950');
    const [validityMonths, setValidityMonths] = useState('12');
    const [welcomeTitle, setWelcomeTitle] = useState('');
    const [welcomeContent, setWelcomeContent] = useState('');
    const [welcomeVideoUrl, setWelcomeVideoUrl] = useState('');
    const [androidUrl, setAndroidUrl] = useState('');
    const [iosUrl, setIosUrl] = useState('');
    const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
    const [globalPaymentLock, setGlobalPaymentLock] = useState(false);
    const [pitchUploadLimit, setPitchUploadLimit] = useState('0');
    const [pitchRequestAmount, setPitchRequestAmount] = useState('950');
    const [welcomeImageUrl, setWelcomeImageUrl] = useState('');
    const [settingsLoading, setSettingsLoading] = useState(false);

    useEffect(() => {
        if (tab === 'dashboard') {
            setLoading(true);
            adminApi.getStats()
                .then(data => {
                    setStats(data.stats);
                    setPostsByCategory(data.postsByCategory);
                    setTopPosters(data.topPosters);
                })
                .catch(() => { })
                .finally(() => setLoading(false));
        } else if (tab === 'users') {
            loadUsers();
        } else if (tab === 'rooms') {
            loadRooms();
        } else if (tab === 'pitch') {
            loadPitches();
        } else if (tab === 'broadcast') {
            setLoading(false);
            loadSettings(); // Load welcome notification settings for the broadcast tab
        } else if (tab === 'settings') {
            loadSettings();
        }
    }, [tab, userPage]);

    // Settings management
    const loadSettings = () => {
        setSettingsLoading(true);
        adminApi.getSettings()
            .then(data => {
                setPaymentRequired(data.settings.registration_payment_required === 'true');
                setPaymentAmount(data.settings.registration_payment_amount || '950');
                setValidityMonths(data.settings.membership_validity_months || '12');
                setWelcomeTitle(data.settings.welcome_notification_title || '');
                setWelcomeContent(data.settings.welcome_notification_content || '');
                setWelcomeVideoUrl(data.settings.welcome_notification_video_url || '');
                setAndroidUrl(data.settings.android_app_url || '');
                setIosUrl(data.settings.ios_app_url || '');
                setEmailVerificationRequired(data.settings.registration_email_verification_required === 'true');
                setGlobalPaymentLock(data.settings.global_payment_lock === 'true');
                setPitchUploadLimit(data.settings.pitch_upload_limit || '0');
                setPitchRequestAmount(data.settings.pitch_request_payment_amount || '950');
                setWelcomeImageUrl(data.settings.welcome_notification_image_url || '');
            })
            .catch(() => { })
            .finally(() => setSettingsLoading(false));
    };

    const handleTogglePayment = async () => {
        const newValue = !paymentRequired;
        try {
            await adminApi.updateSetting('registration_payment_required', String(newValue));
            setPaymentRequired(newValue);
            setMessage(`Registration payment ${newValue ? 'enabled' : 'disabled'}`);
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update setting');
            setMessageType('error');
        }
    };

    const handleToggleEmailVerification = async () => {
        const newValue = !emailVerificationRequired;
        try {
            await adminApi.updateSetting('registration_email_verification_required', String(newValue));
            setEmailVerificationRequired(newValue);
            setMessage(`Email verification ${newValue ? 'enabled' : 'disabled'}`);
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update setting');
            setMessageType('error');
        }
    };

    const handleToggleGlobalLock = async () => {
        const newValue = !globalPaymentLock;
        try {
            await adminApi.updateSetting('global_payment_lock', String(newValue));
            setGlobalPaymentLock(newValue);
            setMessage(`Global platform lock ${newValue ? 'enabled' : 'disabled'}`);
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update setting');
            setMessageType('error');
        }
    };

    const handleSavePitchLimit = async () => {
        const num = parseInt(pitchUploadLimit, 10);
        if (isNaN(num) || num < 0) {
            setMessage('Please enter a valid limit (0 for unlimited)');
            setMessageType('error');
            return;
        }
        try {
            await adminApi.updateSetting('pitch_upload_limit', String(num));
            setPitchUploadLimit(String(num));
            setMessage(`Pitch upload limit updated to ${num === 0 ? 'unlimited' : num}`);
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update limit');
            setMessageType('error');
        }
    };

    const handleSavePitchAmount = async () => {
        const num = parseInt(pitchRequestAmount, 10);
        if (isNaN(num) || num < 0) {
            setMessage('Please enter a valid amount');
            setMessageType('error');
            return;
        }
        try {
            await adminApi.updateSetting('pitch_request_payment_amount', String(num));
            setPitchRequestAmount(String(num));
            setMessage(`Pitch request price updated to ₹${num}`);
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update amount');
            setMessageType('error');
        }
    };

    const handleSaveAmount = async () => {
        const num = parseInt(paymentAmount, 10);
        if (isNaN(num) || num < 1) {
            setMessage('Please enter a valid amount (minimum ₹1)');
            setMessageType('error');
            return;
        }
        try {
            await adminApi.updateSetting('registration_payment_amount', String(num));
            setPaymentAmount(String(num));
            setMessage(`Payment amount updated to ₹${num}`);
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update amount');
            setMessageType('error');
        }
    };

    const handleSaveValidity = async () => {
        const num = parseInt(validityMonths, 10);
        if (isNaN(num) || num < 1 || num > 120) {
            setMessage('Please enter a valid number of months (1-120)');
            setMessageType('error');
            return;
        }
        try {
            await adminApi.updateSetting('membership_validity_months', String(num));
            setValidityMonths(String(num));
            setMessage(`Membership validity updated to ${num} months`);
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update validity');
            setMessageType('error');
        }
    };

    const handleSaveWelcomeNotif = async () => {
        try {
            await adminApi.updateSetting('welcome_notification_title', welcomeTitle);
            await adminApi.updateSetting('welcome_notification_content', welcomeContent);
            await adminApi.updateSetting('welcome_notification_video_url', welcomeVideoUrl);
            await adminApi.updateSetting('welcome_notification_image_url', welcomeImageUrl);
            setMessage('Welcome notification updated successfully');
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update welcome notification');
            setMessageType('error');
        }
    };

    const handleSaveAppUrls = async () => {
        try {
            await adminApi.updateSetting('android_app_url', androidUrl);
            await adminApi.updateSetting('ios_app_url', iosUrl);
            setMessage('App URLs updated successfully');
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to update app URLs');
            setMessageType('error');
        }
    };

    // Broadcast Helpers
    const welcomeNotifImageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                setMessage('Image size exceeds 5MB limit');
                setMessageType('error');
                return;
            }

            try {
                setIsImageUploading(true);
                const { url } = await uploadApi.upload(file);
                setWelcomeImageUrl(url);
            } catch (err) {
                console.error('Welcome image upload failed:', err);
            } finally {
                setIsImageUploading(false);
            }
        };
    };

    const handleSendBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsBroadcasting(true);
            await adminApi.broadcast(broadcast.title, broadcast.content, broadcast.videoUrl, undefined, broadcast.imageUrl);
            setMessage('Broadcast sent successfully!');
            setMessageType('success');
            setBroadcast({ title: '', content: '', videoUrl: '', imageUrl: '' });
        } catch (err: any) {
            setMessage(err.message || 'Failed to send broadcast');
            setMessageType('error');
        } finally {
            setIsBroadcasting(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const broadcastNotifImageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                setMessage('Image size exceeds 5MB limit');
                setMessageType('error');
                return;
            }

            try {
                setIsImageUploading(true);
                const { url } = await uploadApi.upload(file);
                setBroadcast(prev => ({ ...prev, imageUrl: url }));
            } catch (err) {
                console.error('Notification image upload failed:', err);
            } finally {
                setIsImageUploading(false);
            }
        };
    };

    const broadcastImageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                setMessage('Image size exceeds 5MB limit');
                setMessageType('error');
                return;
            }

            try {
                setIsImageUploading(true);
                const { url } = await uploadApi.upload(file);
                const quill = broadcastQuillRef.current?.getEditor();
                if (quill) {
                    const range = quill.getSelection();
                    if (range) {
                        quill.insertEmbed(range.index, 'image', url);
                    }
                }
            } catch (err) {
                console.error('Image upload failed:', err);
            } finally {
                setIsImageUploading(false);
            }
        };
    };

    const broadcastModules = useMemo(() => ({
        ...editorModules,
        toolbar: {
            ...editorModules.toolbar,
            handlers: {
                image: broadcastImageHandler
            }
        }
    }), []);

    // User management
    const loadUsers = () => {
        setLoading(true);
        adminApi.getUsers({ page: userPage, search: userSearch || undefined })
            .then(data => {
                setUsers(data.users);
                setUserPagination(data.pagination);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    const handleUserSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUserSearch(e.target.value);
        setUserPage(1);
    };

    // Effect for debouncing user search
    useEffect(() => {
        if (tab === 'users') {
            const timer = setTimeout(() => {
                loadUsers();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [userSearch]);

    const handleRoleChange = async (userId: string, role: string) => {
        try {
            await adminApi.updateUserRole(userId, role);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
            setMessage('Role updated');
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message);
            setMessageType('error');
        }
    };

    const handleToggleActive = async (userId: string) => {
        try {
            await adminApi.toggleUserActive(userId);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: u.isActive ? 0 : 1 } : u));
            setMessage('User status updated');
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message);
            setMessageType('error');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!window.confirm('Are you sure you want to PERMANENTLY delete this user? This cannot be undone.')) return;
        try {
            await adminApi.deleteUser(userId);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, isDeleting: true } : u));
            setTimeout(() => {
                setUsers(prev => prev.filter(u => u.id !== userId));
            }, 500);
            setMessage('User deleted successfully');
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message);
            setMessageType('error');
        }
    };

    const handleUpdatePremium = async (userId: string, status: string, options?: { days?: number; months?: number }) => {
        try {
            let expiry: string | null = null;
            if (options) {
                const date = new Date();
                if (options.days) date.setDate(date.getDate() + options.days);
                if (options.months) date.setMonth(date.getMonth() + options.months);
                expiry = date.toISOString();
            }

            await adminApi.updateUserPremium(userId, { paymentStatus: status, premiumExpiry: expiry });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, paymentStatus: status, premiumExpiry: expiry } : u));
            setMessage(`Premium status updated to ${status}`);
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message);
            setMessageType('error');
        }
    };

    // Chat Room Management
    const loadRooms = () => {
        setLoading(true);
        chatApi.getRooms()
            .then(d => setRooms(d.rooms))
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    const handleManageRoom = async (roomId: string) => {
        try {
            setLoading(true);
            const data = await chatApi.getMessages(roomId, 1); // Get members via messages endpoint
            setSelectedRoom({ ...data.room, memberCount: data.members.length });
            setRoomMembers(data.members);
        } catch (err: any) {
            setMessage('Failed to load room details');
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateRoomSettings = async (accessType: string) => {
        if (!selectedRoom) return;
        try {
            await chatApi.updateRoom(selectedRoom.id, { accessType });
            setSelectedRoom((prev: any) => ({ ...prev, accessType }));
            setMessage(`Room updated to ${accessType === 'invite' ? 'Invite Only' : 'Open for All'}`);
            setMessageType('success');
            loadRooms(); // Refresh list
        } catch (err: any) {
            setMessage('Failed to update room settings');
            setMessageType('error');
        }
    };

    const handleKickMember = async (userId: string) => {
        if (!selectedRoom || !confirm('Are you sure you want to kick this user?')) return;
        try {
            await chatApi.kickMember(selectedRoom.id, userId);
            setRoomMembers(prev => prev.filter(m => m.id !== userId));
            setSelectedRoom((prev: any) => ({ ...prev, memberCount: prev.memberCount - 1 }));
            setMessage('User kicked form room');
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to kick user');
            setMessageType('error');
        }
    };

    const handleMuteMember = async (userId: string) => {
        if (!selectedRoom) return;
        try {
            const res = await chatApi.muteMember(selectedRoom.id, userId);
            setRoomMembers(prev => prev.map(m => m.id === userId ? { ...m, isMuted: res.isMuted } : m));
            setMessage(res.isMuted ? 'User muted' : 'User unmuted');
            setMessageType('success');
        } catch (err: any) {
            setMessage('Failed to update mute status');
            setMessageType('error');
        }
    };

    const handleSearchMember = async (query: string) => {
        setNewMemberSearch(query);
        if (query.length > 2) {
            try {
                const res = await adminApi.getUsers({ search: query, page: 1 });
                setMemberSearchResults(res.users.filter((u: any) => !roomMembers.some(m => m.id === u.id)));
            } catch { }
        } else {
            setMemberSearchResults([]);
        }
    };

    const handleAddMember = async (userId: string) => {
        if (!selectedRoom) return;
        try {
            await chatApi.addMember(selectedRoom.id, userId);
            // Refresh members list
            const data = await chatApi.getMessages(selectedRoom.id, 1);
            setRoomMembers(data.members);
            setSelectedRoom((prev: any) => ({ ...prev, memberCount: data.members.length }));
            setNewMemberSearch('');
            setMemberSearchResults([]);
            setMessage('Member added successfully');
            setMessageType('success');
        } catch (err: any) {
            setMessage(err.message || 'Failed to add member');
            setMessageType('error');
        }
    };

    const handleDeleteRoom = async (roomId: string) => {
        if (!confirm('Delete this chat room?')) return;
        try {
            await chatApi.deleteRoom(roomId);
            setRooms(prev => prev.filter(r => r.id !== roomId));
            if (selectedRoom?.id === roomId) setSelectedRoom(null);
            setMessage('Room deleted');
            setMessageType('success');
        } catch { }
    };

    // Pitch Requests
    const loadPitches = () => {
        setLoading(true);
        pitchApi.getAllPitches(pitchFilter === 'all' ? undefined : pitchFilter)
            .then(data => setPitches(data.pitches))
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (tab === 'pitch') {
            loadPitches();
        }
    }, [pitchFilter]);

    const handleReviewPitch = async (status: 'approved' | 'disapproved') => {
        if (!selectedPitch) return;
        try {
            await pitchApi.reviewPitch(selectedPitch.id, { status, message: reviewMessage });
            setMessage(`Pitch request ${status}`);
            setMessageType('success');
            setSelectedPitch(null);
            setReviewMessage('');
            loadPitches();
        } catch (err: any) {
            setMessage(err.message || 'Failed to review pitch');
            setMessageType('error');
        }
    };

    // Welcome Notification Editor Helpers
    const welcomeImageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            if (input.files && input.files[0]) {
                const file = input.files[0];
                if (file.size > 5 * 1024 * 1024) {
                    alert('Image size exceeds 5MB limit');
                    return;
                }
                try {
                    setIsImageUploading(true);
                    const data = await uploadApi.upload(file);
                    const range = welcomeQuillRef.current?.getEditor().getSelection();
                    if (range) {
                        welcomeQuillRef.current?.getEditor().insertEmbed(range.index, 'image', data.url);
                    }
                } catch (err) {
                    console.error('Image upload failed:', err);
                    alert('Image upload failed');
                } finally {
                    setIsImageUploading(false);
                }
            }
        };
    };

    const welcomeModules = useMemo(() => ({
        ...editorModules,
        toolbar: {
            container: editorModules.toolbar.container,
            handlers: {
                image: welcomeImageHandler
            }
        }
    }), []);


    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved': return <span className="status-badge active"><CheckCircle2 size={12} className="inline mr-1" /> Approved</span>;
            case 'disapproved': return <span className="status-badge inactive"><XCircle size={12} className="inline mr-1" /> Disapproved</span>;
            default: return <span className="status-badge pending"><Clock size={12} className="inline mr-1" /> Pending</span>;
        }
    };

    return (
        <div className="page-container admin-page">
            <div className="page-header">
                <h1><Settings className="inline-icon" size={28} /> Admin Panel</h1>
                <p className="page-subtitle">Manage your startup community</p>
            </div>

            {message && (
                <div className={`alert ${messageType === 'error' ? 'alert-danger' : 'alert-success'}`} onClick={() => setMessage('')}>
                    {message} <button className="close-alert"><X size={16} /></button>
                </div>
            )}

            <div className="admin-tabs">
                <button className={`admin-tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
                    <BarChart2 size={16} className="inline mr-1" /> Dashboard
                </button>
                <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
                    <Users size={16} className="inline mr-1" /> Users
                </button>
                <button className={`admin-tab ${tab === 'rooms' ? 'active' : ''}`} onClick={() => setTab('rooms')}>
                    <MessageCircle size={16} className="inline mr-1" /> Chat Rooms
                </button>
                <button className={`admin-tab ${tab === 'pitch' ? 'active' : ''}`} onClick={() => setTab('pitch')}>
                    <Lightbulb size={16} className="inline mr-1" /> Pitch Requests
                </button>
                <button className={`admin-tab ${tab === 'broadcast' ? 'active' : ''}`} onClick={() => setTab('broadcast')}>
                    <Megaphone size={16} className="inline mr-1" /> Broadcast
                </button>
                <button className={`admin-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
                    <CreditCard size={16} className="inline mr-1" /> Settings
                </button>
            </div>

            {loading && !selectedRoom && !selectedPitch ? (
                <div className="loading-container"><div className="spinner" /><p>Loading...</p></div>
            ) : (
                <>
                    {/* Dashboard Tab */}
                    {tab === 'dashboard' && stats && (
                        <div className="admin-dashboard">
                            <div className="stats-grid">
                                <div className="stat-card"><span className="stat-num">{stats.totalUsers}</span><span className="stat-label">Total Users</span></div>
                                <div className="stat-card"><span className="stat-num">{stats.activeUsers}</span><span className="stat-label">Active Users</span></div>
                                <div className="stat-card"><span className="stat-num">{stats.totalPosts}</span><span className="stat-label">Total Posts</span></div>
                                <div className="stat-card"><span className="stat-num">{stats.totalComments}</span><span className="stat-label">Comments</span></div>
                                <div className="stat-card"><span className="stat-num">{stats.activeChatRooms}</span><span className="stat-label">Chat Rooms</span></div>
                                <div className="stat-card"><span className="stat-num">{stats.totalMessages}</span><span className="stat-label">Messages</span></div>
                                <div className="stat-card highlight"><span className="stat-num">{stats.recentSignups}</span><span className="stat-label">New (7 days)</span></div>
                            </div>
                        </div>
                    )}

                    {/* Users Tab */}
                    {tab === 'users' && (
                        <div className="admin-users">
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search users by name, email, or username..."
                                value={userSearch}
                                onChange={handleUserSearchChange}
                                id="admin-user-search"
                            />
                            {/* User Table (Simplified for Brevity) */}
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Premium</th><th>Payment ID</th><th>Last Seen</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
                                    <tbody>
                                        {users.map(u => (
                                            <tr key={u.id} className={!u.isActive ? 'inactive-row' : ''}>
                                                <td>
                                                    <div className="table-user">
                                                        <div className="user-name-wrapper">
                                                            <strong>{u.displayName}</strong>
                                                            {u.userType === 'investor' && (
                                                                <span className="admin-user-type investor" title="Investor">
                                                                    <Gem size={12} /> Investor
                                                                </span>
                                                            )}
                                                            {u.userType === 'startup' && (
                                                                <span className="admin-user-type startup" title="Startup">
                                                                    <Rocket size={12} /> Startup
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span>@{u.username}</span>
                                                    </div>
                                                </td>
                                                <td>{u.email}</td>
                                                <td>
                                                    <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)} className="role-select">
                                                        <option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`status-badge ${u.paymentStatus === 'completed' ? 'active' : u.paymentStatus === 'expired' ? 'inactive' : 'pending'}`}>
                                                            {u.paymentStatus || 'free'}
                                                        </span>
                                                        {u.premiumExpiry && (
                                                            <span className="text-[10px] text-gray-400">
                                                                Exp: {new Date(u.premiumExpiry).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="text-xs font-mono text-gray-400">
                                                    {u.paymentId || '-'}
                                                </td>
                                                <td>{u.lastSeen ? new Date(u.lastSeen).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}</td>
                                                <td>{new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td><span className={`status-badge ${u.isActive ? 'active' : 'inactive'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                                                <td>
                                                    <div className="flex gap-1">
                                                        <button className={`btn btn-xs ${u.isActive ? 'btn-ghost danger-text' : 'btn-primary'}`} onClick={() => handleToggleActive(u.id)}>{u.isActive ? 'Deactivate' : 'Activate'}</button>
                                                        <select
                                                            className="btn btn-xs btn-secondary"
                                                            value=""
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (val === 'expire') handleUpdatePremium(u.id, 'expired', { days: 0 });
                                                                if (val === '30days') handleUpdatePremium(u.id, 'completed', { days: 30 });
                                                                if (val === 'default') handleUpdatePremium(u.id, 'completed', { months: parseInt(validityMonths) });
                                                                if (val === '1year') handleUpdatePremium(u.id, 'completed', { months: 12 });
                                                                if (val === 'free') handleUpdatePremium(u.id, 'free');
                                                                e.target.value = ""; // Reset
                                                            }}
                                                        >
                                                            <option value="" disabled>Premium Actions</option>
                                                            <option value="30days">+30 Days</option>
                                                            <option value="default">+{validityMonths} Months (Set Premium)</option>
                                                            <option value="1year">+1 Year</option>
                                                            <option value="expire">Set Expired</option>
                                                            <option value="free">Reset to Free</option>
                                                        </select>
                                                        <button
                                                            className="btn btn-xs btn-ghost"
                                                            onClick={async () => {
                                                                if (!confirm(`Send password reset link to ${u.email}?`)) return;
                                                                try {
                                                                    await adminApi.sendPasswordReset(u.id);
                                                                    setMessage('Reset link sent!');
                                                                    setMessageType('success');
                                                                } catch (e: any) {
                                                                    setMessage(e.message || 'Failed to send reset link');
                                                                    setMessageType('error');
                                                                }
                                                            }}
                                                            title="Send Password Reset Link"
                                                        >
                                                            <Send size={14} />
                                                        </button>
                                                        <button
                                                            className="btn btn-xs btn-ghost danger-text"
                                                            onClick={() => handleDeleteUser(u.id)}
                                                            title="Delete User"
                                                            id={`delete-user-${u.id}`}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Chat Rooms Tab */}
                    {tab === 'rooms' && (
                        <div className="admin-rooms">
                            {!selectedRoom ? (
                                <div className="rooms-admin-list">
                                    {rooms.map(room => (
                                        <div key={room.id} className="card room-admin-card flex justify-between items-center p-4 mb-3">
                                            <div>
                                                <h4 className="text-lg font-semibold">{room.name}</h4>
                                                <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                                                    {room.accessType === 'invite' ? <Shield size={14} className="text-yellow-500" /> : <Users size={14} />}
                                                    <span>{room.accessType === 'invite' ? 'Invite Only' : 'Open for All'}</span>
                                                    <span>•</span>
                                                    <span>{room.memberCount} members</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button className="btn btn-secondary btn-sm" onClick={() => handleManageRoom(room.id)}>
                                                    <Settings size={14} className="mr-1" /> Manage
                                                </button>
                                                <button className="btn btn-ghost btn-sm danger-text" onClick={() => handleDeleteRoom(room.id)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="room-details">
                                    <button className="btn btn-ghost mb-4" onClick={() => setSelectedRoom(null)}>
                                        &larr; Back to Rooms
                                    </button>

                                    <div className="card p-6 mb-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h2 className="text-2xl font-bold mb-2">{selectedRoom.name}</h2>
                                                <p className="text-gray-400">{selectedRoom.description}</p>
                                            </div>
                                            <div className="flex items-center gap-2 bg-dark-lighter p-2 rounded">
                                                <span className="text-sm font-medium mr-2">Access Type:</span>
                                                <button
                                                    className={`btn btn-xs ${selectedRoom.accessType === 'open' ? 'btn-primary' : 'btn-ghost'}`}
                                                    onClick={() => handleUpdateRoomSettings('open')}
                                                >
                                                    Open
                                                </button>
                                                <button
                                                    className={`btn btn-xs ${selectedRoom.accessType === 'invite' ? 'btn-primary' : 'btn-ghost'}`}
                                                    onClick={() => handleUpdateRoomSettings('invite')}
                                                >
                                                    Invite Only
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <h3 className="text-lg font-semibold mb-3 flex items-center">
                                                <UserPlus size={18} className="mr-2" /> Add Member
                                            </h3>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    className="form-input w-full"
                                                    placeholder="Search user to add..."
                                                    value={newMemberSearch}
                                                    onChange={e => handleSearchMember(e.target.value)}
                                                />
                                                {memberSearchResults.length > 0 && (
                                                    <div className="absolute top-full left-0 right-0 bg-dark-lighter border border-gray-700 rounded-b-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                                                        {memberSearchResults.map(user => (
                                                            <div
                                                                key={user.id}
                                                                className="p-2 hover:bg-dark-accent cursor-pointer flex items-center justify-between"
                                                                onClick={() => handleAddMember(user.id)}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <img src={user.avatarUrl || '/default-avatar.png'} alt="" className="w-6 h-6 rounded-full" />
                                                                    <span>{user.displayName}</span>
                                                                    <span className="text-xs text-gray-400">@{user.username}</span>
                                                                </div>
                                                                <UserPlus size={14} className="text-primary" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <h3 className="text-lg font-semibold mb-3">Members ({roomMembers.length})</h3>
                                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                            {roomMembers.map(member => (
                                                <div key={member.id} className="flex items-center justify-between p-3 bg-dark-lighter rounded">
                                                    <div className="flex items-center gap-3">
                                                        <img src={member.avatarUrl || '/default-avatar.png'} alt="" className="w-8 h-8 rounded-full" />
                                                        <div>
                                                            <div className="font-medium">{member.displayName}</div>
                                                            <div className="text-xs text-gray-400">@{member.username}</div>
                                                        </div>
                                                        {member.isMuted === 1 && <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded ml-2">Muted</span>}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            className={`btn btn-xs ${member.isMuted ? 'btn-primary' : 'btn-ghost'}`}
                                                            onClick={() => handleMuteMember(member.id)}
                                                            title={member.isMuted ? "Unmute User" : "Mute User"}
                                                        >
                                                            {member.isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                                                        </button>
                                                        <button
                                                            className="btn btn-xs btn-ghost danger-text"
                                                            onClick={() => handleKickMember(member.id)}
                                                            title="Kick User"
                                                        >
                                                            <LogOut size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pitch Requests Tab */}
                    {tab === 'pitch' && (
                        <div className="admin-pitches">
                            {!selectedPitch ? (
                                <>
                                    <div className="flex gap-4 mb-6">
                                        <button className={`btn btn-sm ${pitchFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPitchFilter('all')}>All</button>
                                        <button className={`btn btn-sm ${pitchFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPitchFilter('pending')}>Pending</button>
                                        <button className={`btn btn-sm ${pitchFilter === 'approved' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPitchFilter('approved')}>Approved</button>
                                        <button className={`btn btn-sm ${pitchFilter === 'disapproved' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPitchFilter('disapproved')}>Disapproved</button>
                                    </div>
                                    <div className="grid gap-4">
                                        {pitches.map(pitch => (
                                            <div key={pitch.id} className="card p-4 hover:border-primary transition-colors cursor-pointer" onClick={() => setSelectedPitch(pitch)}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <h3 className="font-semibold text-lg">{pitch.title}</h3>
                                                        <div className="text-sm text-gray-400 flex items-center gap-2 mt-1">
                                                            <span>By {pitch.userDisplayName}</span>
                                                            <span>•</span>
                                                            <span>{new Date(pitch.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                    {getStatusBadge(pitch.status)}
                                                </div>
                                                <p className="text-gray-400 line-clamp-2">{pitch.description}</p>
                                            </div>
                                        ))}
                                        {pitches.length === 0 && <p className="text-center text-gray-500 py-8">No pitch requests found.</p>}
                                    </div>
                                </>
                            ) : (
                                <div className="pitch-detail">
                                    <button className="btn btn-ghost mb-4" onClick={() => setSelectedPitch(null)}>
                                        &larr; Back to List
                                    </button>
                                    <div className="card p-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <h2 className="text-2xl font-bold">{selectedPitch.title}</h2>
                                            {getStatusBadge(selectedPitch.status)}
                                        </div>

                                        <div className="flex items-center gap-4 mb-6 p-4 bg-dark-lighter rounded-lg">
                                            <img src={selectedPitch.userAvatarUrl || '/default-avatar.png'} alt="" className="w-12 h-12 rounded-full" />
                                            <div>
                                                <div className="font-bold">{selectedPitch.userDisplayName}</div>
                                                <div className="text-gray-400">@{selectedPitch.username}</div>
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <h3 className="text-lg font-semibold mb-2">Description</h3>
                                            <p className="whitespace-pre-wrap text-gray-300">{selectedPitch.description}</p>
                                        </div>

                                        {selectedPitch.deckUrl && (
                                            <div className="mb-8">
                                                <h3 className="text-lg font-semibold mb-2">Pitch Deck</h3>
                                                <a
                                                    href={selectedPitch.deckUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-secondary inline-flex items-center"
                                                >
                                                    <FileText size={18} className="mr-2" /> View Attached Document
                                                </a>
                                            </div>
                                        )}

                                        <div className="border-t border-gray-700 pt-6">
                                            <h3 className="text-lg font-semibold mb-4">Admin Review</h3>
                                            <div className="form-group mb-4">
                                                <label className="block mb-2 text-sm text-gray-400">Message to User (Optional)</label>
                                                <textarea
                                                    className="form-input w-full min-h-[100px]"
                                                    placeholder="Provide feedback or reasons..."
                                                    value={reviewMessage}
                                                    onChange={e => setReviewMessage(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex gap-4">
                                                <button
                                                    className="btn btn-primary bg-green-600 hover:bg-green-700 border-none flex-1 py-3"
                                                    onClick={() => handleReviewPitch('approved')}
                                                >
                                                    <CheckCircle2 size={18} className="inline mr-2" /> Approve Request
                                                </button>
                                                <button
                                                    className="btn btn-primary bg-red-600 hover:bg-red-700 border-none flex-1 py-3"
                                                    onClick={() => handleReviewPitch('disapproved')}
                                                >
                                                    <XCircle size={18} className="inline mr-2" /> Disapprove Request
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Broadcast Tab */}
                    {tab === 'broadcast' && (
                        <div className="admin-broadcast">
                            <div className="card p-6">
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <Megaphone className="text-accent" /> Platform Broadcast
                                </h2>
                                <p className="text-gray-400 mb-6">
                                    Send a real-time notification to <strong>all</strong> platform users via WebSockets and Push Notifications.
                                </p>

                                <form onSubmit={handleSendBroadcast}>
                                    <div className="form-group">
                                        <label htmlFor="broadcast-title">Title</label>
                                        <input id="broadcast-title" type="text" className="form-input" placeholder="Notification title..."
                                            value={broadcast.title} onChange={e => setBroadcast(prev => ({ ...prev, title: e.target.value }))} required maxLength={200} />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="broadcast-content">Message</label>
                                        <div className="rich-editor-container" style={{ minHeight: '300px' }}>
                                            <ReactQuill
                                                ref={broadcastQuillRef}
                                                theme="snow"
                                                value={broadcast.content}
                                                onChange={val => setBroadcast(prev => ({ ...prev, content: val }))}
                                                modules={broadcastModules}
                                                formats={editorFormats}
                                                className="rich-editor"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="form-group">
                                            <label htmlFor="broadcast-video">Video URL (Optional)</label>
                                            <input id="broadcast-video" type="url" className="form-input" placeholder="YouTube/Vimeo link..."
                                                value={broadcast.videoUrl} onChange={e => setBroadcast(prev => ({ ...prev, videoUrl: e.target.value }))} />
                                        </div>
                                        <div className="form-group">
                                            <label>Notification Image (Optional)</label>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary flex-1"
                                                    onClick={broadcastNotifImageHandler}
                                                    disabled={isImageUploading}
                                                >
                                                    {broadcast.imageUrl ? 'Change Image' : 'Upload Banner Image'}
                                                </button>
                                                {broadcast.imageUrl && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost danger-text"
                                                        onClick={() => setBroadcast(prev => ({ ...prev, imageUrl: '' }))}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                            {broadcast.imageUrl && (
                                                <div className="mt-2 text-xs text-green-500 flex items-center gap-1">
                                                    <CheckCircle2 size={12} /> Image attached to notification
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-end">
                                        <button type="submit" className="btn btn-primary" disabled={isBroadcasting || isImageUploading}>
                                            {isBroadcasting ? 'Broadcasting...' : (
                                                <>
                                                    <Send size={18} className="mr-2" /> Send to All Users
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div className="mt-8">
                                <h3 className="text-lg font-bold mb-4">Live Preview</h3>
                                <div className="card p-4 max-w-sm">
                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white">
                                            <Megaphone size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold">{broadcast.title || 'Notification Title'}</div>
                                            <div className="text-sm text-gray-400 ql-editor-display" style={{ padding: 0 }}
                                                dangerouslySetInnerHTML={{ __html: broadcast.content || 'Your message will appear here...' }} />
                                            {broadcast.imageUrl && (
                                                <div className="mt-2 rounded overflow-hidden border border-gray-700">
                                                    <img src={broadcast.imageUrl} alt="Notification Banner" className="w-full h-auto" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Welcome Notification for New Users */}
                            <div className="card" style={{ marginTop: '32px', padding: '24px', borderLeft: '4px solid var(--accent)' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🎉 Welcome Notification for New Users
                                </h3>
                                <p className="text-muted" style={{ marginBottom: '20px', fontSize: '0.9rem' }}>
                                    This notification is automatically sent to every new user upon registration. Edit the title, content and optional video link below.
                                </p>

                                <div className="form-group">
                                    <label htmlFor="welcome-title-broadcast" style={{ fontWeight: 600, marginBottom: '6px', display: 'block' }}>Title</label>
                                    <input
                                        id="welcome-title-broadcast"
                                        type="text"
                                        className="form-input"
                                        placeholder="Welcome to StartupHub! 🚀"
                                        value={welcomeTitle}
                                        onChange={e => setWelcomeTitle(e.target.value)}
                                        maxLength={200}
                                    />
                                </div>

                                <div className="form-group" style={{ marginTop: '16px' }}>
                                    <label htmlFor="welcome-content-broadcast" style={{ fontWeight: 600, marginBottom: '6px', display: 'block' }}>Content</label>
                                    <div className="rich-editor-container" style={{ minHeight: '180px' }}>
                                        <ReactQuill
                                            ref={welcomeQuillRef}
                                            theme="snow"
                                            value={welcomeContent}
                                            onChange={setWelcomeContent}
                                            modules={welcomeModules}
                                            formats={editorFormats}
                                            className="rich-editor"
                                            placeholder="Write a welcome message for new users..."
                                        />
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginTop: '16px' }}>
                                    <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block' }}>Welcome Banner (Optional)</label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            className="btn btn-secondary flex-1"
                                            onClick={welcomeNotifImageHandler}
                                            disabled={isImageUploading}
                                        >
                                            {welcomeImageUrl ? 'Change Image' : 'Upload Banner Image'}
                                        </button>
                                        {welcomeImageUrl && (
                                            <button
                                                type="button"
                                                className="btn btn-danger"
                                                onClick={() => setWelcomeImageUrl('')}
                                                style={{ padding: '8px 12px' }}
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                    {welcomeImageUrl && (
                                        <div style={{ marginTop: '8px' }}>
                                            <img src={welcomeImageUrl} alt="Welcome Banner Preview" style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }} />
                                        </div>
                                    )}
                                </div>

                                <div className="form-group" style={{ marginTop: '16px' }}>
                                    <label htmlFor="welcome-video-broadcast" style={{ fontWeight: 600, marginBottom: '6px', display: 'block' }}>Video Link (Optional)</label>
                                    <div style={{ position: 'relative' }}>
                                        <LinkIcon size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }} />
                                        <input
                                            id="welcome-video-broadcast"
                                            type="url"
                                            className="form-input"
                                            style={{ paddingLeft: '36px' }}
                                            placeholder="https://youtube.com/..."
                                            value={welcomeVideoUrl}
                                            onChange={e => setWelcomeVideoUrl(e.target.value)}
                                            maxLength={500}
                                        />
                                    </div>
                                </div>

                                {/* Live Preview */}
                                <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        👁️ What new users will see
                                    </div>
                                    <div style={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius)',
                                        padding: '20px',
                                        maxWidth: '400px'
                                    }}>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Megaphone size={20} color="white" />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '4px', lineHeight: 1.3 }}>{welcomeTitle || 'Welcome to StartupHub! 🚀'}</div>
                                                <div
                                                    style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}
                                                    dangerouslySetInnerHTML={{ __html: welcomeContent || '<p>Your welcome message will appear here...</p>' }}
                                                />
                                                {welcomeImageUrl && (
                                                    <div style={{ marginTop: '8px' }}>
                                                        <img src={welcomeImageUrl} alt="Banner" style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }} />
                                                    </div>
                                                )}
                                                {welcomeVideoUrl && (
                                                    <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                                                        <a href={welcomeVideoUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>🎬 Watch Video</a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSaveWelcomeNotif}
                                        disabled={settingsLoading || isImageUploading}
                                        id="save-welcome-notif-broadcast"
                                    >
                                        {isImageUploading ? 'Uploading Image...' : <><Send size={16} className="inline mr-1" /> Save Welcome Notification</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Settings Tab */}
                    {tab === 'settings' && (
                        <div className="admin-settings">
                            {/* ... (rest of settings content) ... */}
                            <div className="card" style={{ padding: '24px' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CreditCard size={20} /> Registration Payment
                                </h3>
                                <p className="text-muted" style={{ marginBottom: '24px', fontSize: '0.9rem' }}>
                                    Control whether users are required to pay during registration to access premium features like pitch requests.
                                </p>

                                {/* Global Platform Lock */}
                                <div className="settings-toggle-row" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '24px' }}>
                                    <div className="settings-toggle-info">
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                                            {globalPaymentLock ? '🔒 Platform Locked' : '🔓 Platform Unlocked'}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            {globalPaymentLock
                                                ? 'Only users with completed payment status can access the platform features. Others will be blocked.'
                                                : 'All registered users can access the platform (except specific premium features).'}
                                        </div>
                                    </div>
                                    <button
                                        className={`settings-toggle-btn ${globalPaymentLock ? 'active' : ''}`}
                                        onClick={handleToggleGlobalLock}
                                        disabled={settingsLoading}
                                        id="toggle-global-lock"
                                    >
                                        {globalPaymentLock
                                            ? <ToggleRight size={40} />
                                            : <ToggleLeft size={40} />}
                                    </button>
                                </div>

                                {/* Email Verification Toggle */}
                                <div className="settings-toggle-row" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '24px' }}>
                                    <div className="settings-toggle-info">
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                                            {emailVerificationRequired ? '🔒 Email Verification Required' : '🔓 Email Verification Optional'}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            {emailVerificationRequired
                                                ? 'New users must verify their email address before they can log in.'
                                                : 'Users can log in immediately after registration without verifying their email.'}
                                        </div>
                                    </div>
                                    <button
                                        className={`settings-toggle-btn ${emailVerificationRequired ? 'active' : ''}`}
                                        onClick={handleToggleEmailVerification}
                                        disabled={settingsLoading}
                                        id="toggle-email-verification"
                                    >
                                        {emailVerificationRequired
                                            ? <ToggleRight size={40} />
                                            : <ToggleLeft size={40} />}
                                    </button>
                                </div>

                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-info">
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                                            {paymentRequired ? '🟢 Payment Required' : '🔴 Payment Disabled'}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            {paymentRequired
                                                ? `Users must pay ₹${paymentAmount} via Razorpay during registration. They get premium access (pitch requests, etc.)`
                                                : 'Users can register for free. Pitch requests and other premium features are restricted to paid users only.'}
                                        </div>
                                    </div>
                                    <button
                                        className={`settings-toggle-btn ${paymentRequired ? 'active' : ''}`}
                                        onClick={handleTogglePayment}
                                        disabled={settingsLoading}
                                        id="toggle-registration-payment"
                                    >
                                        {paymentRequired
                                            ? <ToggleRight size={40} />
                                            : <ToggleLeft size={40} />}
                                    </button>
                                </div>

                                {/* Payment Amount */}
                                <div className="settings-toggle-row" style={{ marginTop: '16px' }}>
                                    <div className="settings-toggle-info">
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                                            💰 Registration Price
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Set the amount users must pay during registration (in INR).
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <span style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', fontWeight: 700, fontSize: '1rem' }}>₹</span>
                                            <input
                                                type="number"
                                                className="form-input"
                                                style={{ width: '120px', paddingLeft: '28px', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem' }}
                                                value={paymentAmount}
                                                onChange={e => setPaymentAmount(e.target.value)}
                                                min={1}
                                                id="payment-amount-input"
                                            />
                                        </div>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleSaveAmount}
                                            disabled={settingsLoading}
                                            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                            id="save-payment-amount"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>

                                {/* Membership Validity */}
                                <div className="settings-toggle-row" style={{ marginTop: '16px' }}>
                                    <div className="settings-toggle-info">
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                                            📅 Membership Validity
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Set how many months of premium access a user gets after payment.
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                className="form-input"
                                                style={{ width: '100px', textAlign: 'center', fontWeight: 700, fontSize: '1.1rem' }}
                                                value={validityMonths}
                                                onChange={e => setValidityMonths(e.target.value)}
                                                min={1}
                                                max={120}
                                                id="validity-months-input"
                                            />
                                            <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>months</span>
                                        </div>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleSaveValidity}
                                            disabled={settingsLoading}
                                            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                            id="save-validity-months"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>

                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '40px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Lightbulb size={20} /> Pitch Request Settings
                                </h3>
                                <p className="text-muted" style={{ marginBottom: '24px', fontSize: '0.9rem' }}>
                                    Control limits and pricing for startup pitch requests.
                                </p>

                                {/* Pitch Upload Limit */}
                                <div className="settings-toggle-row">
                                    <div className="settings-toggle-info">
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                                            🚀 Pitch Upload Limit
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Maximum number of pitch requests a user can submit. Set to 0 for unlimited.
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="number"
                                            className="form-input"
                                            style={{ width: '80px', textAlign: 'center', fontWeight: 700 }}
                                            value={pitchUploadLimit}
                                            onChange={e => setPitchUploadLimit(e.target.value)}
                                            min={0}
                                        />
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleSavePitchLimit}
                                            disabled={settingsLoading}
                                            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>

                                {/* Pitch Request Pricing */}
                                <div className="settings-toggle-row" style={{ marginTop: '16px' }}>
                                    <div className="settings-toggle-info">
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                                            🏷️ Pitch Request Price
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Default price for individual pitch requests (if applicable).
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <span style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>₹</span>
                                            <input
                                                type="number"
                                                className="form-input"
                                                style={{ width: '120px', paddingLeft: '28px', textAlign: 'right', fontWeight: 700 }}
                                                value={pitchRequestAmount}
                                                onChange={e => setPitchRequestAmount(e.target.value)}
                                                min={0}
                                            />
                                        </div>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleSavePitchAmount}
                                            disabled={settingsLoading}
                                            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>

                                <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>How it works:</div>
                                    <ul style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.8, paddingLeft: '16px' }}>
                                        <li><strong>Payment Enabled:</strong> Registration flow includes a Razorpay payment step (₹{paymentAmount}). Users who pay get full access including pitch requests.</li>
                                        <li><strong>Payment Disabled:</strong> Users can register for free. However, pitch requests remain restricted — only users who previously paid can access them.</li>
                                        <li><strong>Admins</strong> always have full access regardless of payment status.</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Welcome Notification Settings */}
                            <div className="card" style={{ marginTop: '24px', padding: '24px' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Megaphone size={20} /> Welcome Notification
                                </h3>
                                <p className="text-muted" style={{ marginBottom: '24px', fontSize: '0.9rem' }}>
                                    Customize the welcome notification automatically sent to new users upon registration.
                                </p>

                                <div className="form-group">
                                    <label htmlFor="welcome-title">Title</label>
                                    <input
                                        id="welcome-title"
                                        type="text"
                                        className="form-input"
                                        placeholder="Welcome to StartupHub!"
                                        value={welcomeTitle}
                                        onChange={e => setWelcomeTitle(e.target.value)}
                                        required
                                        maxLength={200}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="welcome-content">Content</label>
                                    <div className="rich-editor-container" style={{ minHeight: '200px' }}>
                                        <ReactQuill
                                            ref={welcomeQuillRef}
                                            theme="snow"
                                            value={welcomeContent}
                                            onChange={setWelcomeContent}
                                            modules={welcomeModules}
                                            formats={editorFormats}
                                            className="rich-editor"
                                            placeholder="Write a welcome message..."
                                        />
                                    </div>

                                    {/* Preview Box */}
                                    <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Live User Preview
                                        </div>
                                        <div style={{
                                            background: 'var(--bg-card)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius)',
                                            padding: '20px',
                                            maxWidth: '400px'
                                        }}>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <Megaphone size={20} color="white" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '4px', lineHeight: 1.3 }}>{welcomeTitle || 'Welcome to StartupHub!'}</div>
                                                    <div
                                                        style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}
                                                        dangerouslySetInnerHTML={{ __html: welcomeContent || '<p>Your welcome message will appear here...</p>' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="welcome-video">Video Link (Optional)</label>
                                    <div className="relative" style={{ position: 'relative' }}>
                                        <LinkIcon size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }} />
                                        <input
                                            id="welcome-video"
                                            type="url"
                                            className="form-input"
                                            style={{ paddingLeft: '36px' }}
                                            placeholder="https://youtube.com/..."
                                            value={welcomeVideoUrl}
                                            onChange={e => setWelcomeVideoUrl(e.target.value)}
                                            maxLength={500}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSaveWelcomeNotif}
                                        disabled={settingsLoading || isImageUploading}
                                    >
                                        {isImageUploading ? 'Uploading Image...' : <><Send size={16} className="inline mr-1" /> Save Welcome Notification</>}
                                    </button>
                                </div>
                            </div>

                            {/* Mobile App Settings */}
                            <div className="card" style={{ marginTop: '24px', padding: '24px' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Download size={20} /> Mobile App Configuration
                                </h3>
                                <p className="text-muted" style={{ marginBottom: '24px', fontSize: '0.9rem' }}>
                                    Configure download links for Android and iOS apps.
                                </p>

                                <div className="form-group">
                                    <label htmlFor="android-url" style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Android App URL</label>
                                    <input
                                        id="android-url"
                                        type="url"
                                        className="form-input"
                                        placeholder="https://play.google.com/..."
                                        value={androidUrl}
                                        onChange={e => setAndroidUrl(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                </div>

                                <div className="form-group" style={{ marginTop: '16px' }}>
                                    <label htmlFor="ios-url" style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>iOS App URL</label>
                                    <input
                                        id="ios-url"
                                        type="url"
                                        className="form-input"
                                        placeholder="https://apps.apple.com/..."
                                        value={iosUrl}
                                        onChange={e => setIosUrl(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSaveAppUrls}
                                        disabled={settingsLoading}
                                    >
                                        Save App URLs
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
