
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '../services/api';
import { CATEGORY_CONFIG } from '../config';
import { Bookmark, FileText, Heart, MessageSquare } from 'lucide-react';

export default function Bookmarks() {
    const [bookmarks, setBookmarks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        usersApi.getBookmarks()
            .then(d => setBookmarks(d.bookmarks))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="loading-container"><div className="spinner" /><p>Loading...</p></div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Bookmark className="inline-icon" size={28} /> Bookmarks</h1>
                <p className="page-subtitle">Posts you've saved for later</p>
            </div>

            {bookmarks.length === 0 ? (
                <div className="empty-state">
                    <span className="empty-icon"><FileText size={48} /></span>
                    <h2>No bookmarks yet</h2>
                    <p>Save posts you want to revisit later</p>
                    <Link to="/feed" className="btn btn-primary">Browse Feed</Link>
                </div>
            ) : (
                <div className="posts-list">
                    {bookmarks.map(b => {
                        const cat = CATEGORY_CONFIG[b.category as keyof typeof CATEGORY_CONFIG];
                        const Icon = cat?.icon;
                        return (
                            <Link to={`/posts/${b.id}`} key={b.id} className="post-card">
                                <div className="post-card-header">
                                    <div className="post-meta">
                                        <span className="post-author">{b.displayName}</span>
                                    </div>
                                    {cat && (
                                        <span className="post-category-badge" style={{ background: cat.color + '22', color: cat.color }}>
                                            <Icon size={14} className="inline mr-1" /> {cat.label}
                                        </span>
                                    )}
                                </div>
                                <h3 className="post-title">{b.title}</h3>
                                <div className="post-stats">
                                    <span className="stat"><Heart size={14} /> {b.likeCount}</span>
                                    <span className="stat"><MessageSquare size={14} /> {b.commentCount}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
