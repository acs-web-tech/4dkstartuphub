
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usersApi } from '../services/api';
import { CATEGORY_CONFIG } from '../config';
import { MapPin, Globe, FileText, Calendar, Heart, MessageSquare } from 'lucide-react';

export default function UserDetail() {
    const { id } = useParams<{ id: string }>();
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
            <div className="card profile-card">
                <div className="profile-header">
                    <div className="avatar avatar-xl">
                        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{initials}</span>}
                    </div>
                    <div className="profile-info">
                        <h2>{user.displayName}</h2>
                        <span className="profile-username">@{user.username}</span>
                        {user.role !== 'user' && <span className={`role-badge role-${user.role}`}>{user.role}</span>}
                    </div>
                </div>

                <div className="profile-details">
                    {user.bio && <p className="profile-bio">{user.bio}</p>}
                    <div className="profile-meta-grid">
                        {user.location && (
                            <div className="profile-meta-item"><span className="meta-label"><MapPin size={16} /> Location</span><span>{user.location}</span></div>
                        )}
                        {user.website && (
                            <div className="profile-meta-item"><span className="meta-label"><Globe size={16} /> Website</span>
                                <a href={user.website} target="_blank" rel="noopener noreferrer">{user.website}</a></div>
                        )}
                        <div className="profile-meta-item"><span className="meta-label"><FileText size={16} /> Posts</span><span>{user.postCount}</span></div>
                        <div className="profile-meta-item"><span className="meta-label"><Calendar size={16} /> Joined</span>
                            <span>{new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span></div>
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
