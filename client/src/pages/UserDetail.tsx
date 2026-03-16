
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { usersApi } from '../services/api';
import { CATEGORY_CONFIG } from '../config';
import { MapPin, Globe, FileText, Calendar, Heart, MessageSquare, ArrowLeft, Twitter, Briefcase, Mail, Wifi, RefreshCw } from 'lucide-react';
import { getCdnUrl } from '../utils/cdn';

export default function UserDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [user, setUser] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const loadUser = useCallback(() => {
        if (!id) return;
        setLoading(true);
        setError(false);
        usersApi.getById(id)
            .then(data => {
                setUser(data.user);
                setPosts(data.recentPosts);
            })
            .catch((err) => {
                console.error('Failed to load user profile:', err);
                setError(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    const [showAvatarViewer, setShowAvatarViewer] = useState(false);

    useEffect(() => {
        loadUser();
    }, [loadUser]);

    if (loading) return <div className="loading-container"><div className="spinner" /><p>Loading Profile...</p></div>;

    if (error) {
        return (
            <div className="error-state p-12 text-center">
                <Wifi size={48} className="text-gray-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold mb-2">Failed to load profile</h2>
                <p className="text-gray-400 mb-6">There was a problem reaching our servers.</p>
                <button className="btn btn-primary inline-flex items-center" onClick={loadUser}>
                    <RefreshCw size={18} className="mr-2" /> Try Again
                </button>
                <button className="btn btn-ghost mt-4 block mx-auto" onClick={() => navigate(-1)}>
                    Go Back
                </button>
            </div>
        );
    }

    if (!user) return <div className="empty-state"><h2>User not found</h2></div>;

    const initials = user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="page-container">
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <button
                    onClick={() => navigate(-1)}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <ArrowLeft size={20} /> Back
                </button>
                <h1>User Profile</h1>
            </div>

            <div className="card profile-card">
                <div className="profile-header">
                    <div 
                        className="avatar avatar-xl" 
                        onClick={() => { if (user.avatarUrl) setShowAvatarViewer(true); }}
                        style={{ cursor: user.avatarUrl ? 'pointer' : 'default' }}
                    >
                        {user.avatarUrl ? <img src={getCdnUrl(user.avatarUrl)} alt="" /> : <span>{initials}</span>}
                    </div>

                    {showAvatarViewer && user.avatarUrl && (
                        <div 
                            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setShowAvatarViewer(false)}
                        >
                            <button 
                                style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', color: 'white', padding: '10px', cursor: 'pointer' }}
                                onClick={() => setShowAvatarViewer(false)}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                            <img 
                                src={getCdnUrl(user.avatarUrl)} 
                                alt="Profile Avatar" 
                                style={{ width: '300px', height: '300px', borderRadius: '50%', objectFit: 'cover', border: '4px solid white', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                    )}

                    <div className="profile-info">
                        <h2>{user.displayName}</h2>
                        <span className="profile-username">@{user.username}</span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            {user.role !== 'user' && <span className={`role-badge role-${user.role}`}>{user.role}</span>}
                            {user.userType && (
                                <span className={`role-badge role-${user.userType}`} style={{
                                    background: user.userType === 'investor' ? 'rgba(96, 165, 250, 0.1)' :
                                        user.userType === 'startup' ? 'rgba(74, 222, 128, 0.1)' :
                                            'rgba(167, 139, 250, 0.1)',
                                    color: user.userType === 'investor' ? '#60a5fa' :
                                        user.userType === 'startup' ? '#4ade80' :
                                            '#a78bfa',
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    {user.userType === 'startup' ? '🚀 Startup' :
                                        user.userType === 'investor' ? '💰 Investor' :
                                            user.userType === 'freelancer' ? '🛠 Freelancer' : user.userType}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="profile-details">
                    {user.bio && <p className="profile-bio">{user.bio}</p>}
                    <div className="profile-meta-grid">
                        {user.location && (
                            <div className="profile-meta-item">
                                <span className="meta-label"><MapPin size={14} className="inline mr-1" /> LOCATION</span>
                                <span style={{ fontWeight: 600 }}>{user.location}</span>
                            </div>
                        )}
                        <div className="profile-meta-item">
                            <span className="meta-label"><FileText size={14} className="inline mr-1" /> POSTS</span>
                            <span style={{ fontWeight: 600 }}>{user.postCount || 0}</span>
                        </div>
                        <div className="profile-meta-item">
                            <span className="meta-label"><Calendar size={14} className="inline mr-1" /> JOINED</span>
                            <span style={{ fontWeight: 600 }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB') : 'N/A'}</span>
                        </div>
                    </div>

                    {(user.website || user.linkedin || user.twitter || user.email) && (
                        <div className="profile-social-links" style={{
                            display: 'flex',
                            gap: '12px',
                            marginTop: '24px',
                            flexWrap: 'wrap',
                            borderTop: '1px solid var(--border)',
                            paddingTop: '20px'
                        }}>
                            {user.email && (
                                <a href={`mailto:${user.email}`}
                                    className="social-btn email-btn"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: '20px', color: 'var(--text-primary)', textDecoration: 'none', transition: 'all 0.2s', border: '1px solid var(--border)' }}
                                >
                                    <Mail size={16} /> <span style={{ fontSize: '14px', fontWeight: '500' }}>Email</span>
                                </a>
                            )}
                            {user.website && (
                                <a href={user.website.startsWith('http') ? user.website : `https://${user.website}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="social-btn website-btn"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: '20px', color: 'var(--text-primary)', textDecoration: 'none', transition: 'all 0.2s', border: '1px solid var(--border)' }}
                                >
                                    <Globe size={16} /> <span style={{ fontSize: '14px', fontWeight: '500' }}>Website</span>
                                </a>
                            )}
                            {user.linkedin && (
                                <a href={user.linkedin.startsWith('http') ? user.linkedin : `https://${user.linkedin}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="social-btn linkedin-btn"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(10, 102, 194, 0.1)', borderRadius: '20px', color: '#0a66c2', textDecoration: 'none', transition: 'all 0.2s', border: '1px solid rgba(10, 102, 194, 0.2)' }}
                                >
                                    <Briefcase size={16} /> <span style={{ fontSize: '14px', fontWeight: '500' }}>LinkedIn</span>
                                </a>
                            )}
                            {user.twitter && (
                                <a href={user.twitter.startsWith('http') ? user.twitter : `https://twitter.com/${user.twitter.replace('@', '')}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="social-btn twitter-btn"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(29, 155, 240, 0.1)', borderRadius: '20px', color: '#1d9bf0', textDecoration: 'none', transition: 'all 0.2s', border: '1px solid rgba(29, 155, 240, 0.2)' }}
                                >
                                    <Twitter size={16} /> <span style={{ fontSize: '14px', fontWeight: '500' }}>Twitter</span>
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {posts.length > 0 && (
                <section className="user-posts-section">
                    <h2>Recent Posts</h2>
                    <div className="posts-list">
                        {posts.map((p: any) => {
                            const cat = CATEGORY_CONFIG[p.category as keyof typeof CATEGORY_CONFIG];
                            const Icon = cat?.icon;
                            return (
                                <Link to={`/posts/${p.id}`} state={{ background: location }} key={p.id} className="post-card">
                                    <div className="post-card-header">
                                        {cat && (
                                            <span className="post-category-badge" style={{ background: cat.color + '22', color: cat.color }}>
                                                <Icon size={14} className="inline mr-1" /> {cat.label}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="post-title">{p.title}</h3>
                                    <div className="post-stats">
                                        <span className="stat"><Heart size={14} /> {p.likeCount}</span>
                                        <span className="stat"><MessageSquare size={14} /> {p.commentCount}</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}
        </div>
    );
}
