
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usersApi } from '../services/api';
import { CATEGORY_CONFIG } from '../config';
import { MapPin, Globe, FileText, Calendar, Heart, MessageSquare, ArrowLeft } from 'lucide-react';

export default function UserDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        usersApi.getById(id)
            .then(data => {
                setUser(data.user);
                setPosts(data.recentPosts);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div className="loading-container"><div className="spinner" /><p>Loading...</p></div>;
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
                    <div className="avatar avatar-xl">
                        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{initials}</span>}
                    </div>
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
                        {user.website && (
                            <div className="profile-meta-item">
                                <span className="meta-label"><Globe size={14} className="inline mr-1" /> WEBSITE</span>
                                <a href={user.website} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>{user.website}</a>
                            </div>
                        )}
                        <div className="profile-meta-item">
                            <span className="meta-label"><FileText size={14} className="inline mr-1" /> POSTS</span>
                            <span style={{ fontWeight: 600 }}>{user.postCount || 0}</span>
                        </div>
                        <div className="profile-meta-item">
                            <span className="meta-label"><Calendar size={14} className="inline mr-1" /> JOINED</span>
                            <span style={{ fontWeight: 600 }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'N/A'}</span>
                        </div>
                    </div>
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
                                <Link to={`/posts/${p.id}`} key={p.id} className="post-card">
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
