
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { postsApi } from '../services/api';
import { Post, PostCategory } from '../types';
import { CATEGORY_CONFIG } from '../config';
import {
    Compass, Flame, Star, Users, MessageCircle, Mic, Heart, MessageSquare, ArrowRight, TrendingUp, Eye
} from 'lucide-react';

export default function Discovery() {
    const [trending, setTrending] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        postsApi.getAll({ limit: 12, trending: true })
            .then(data => setTrending(data.posts))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const categories = Object.entries(CATEGORY_CONFIG) as [PostCategory, typeof CATEGORY_CONFIG[PostCategory]][];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Compass className="inline-icon" size={28} /> Discovery</h1>
                <p className="page-subtitle">Explore topics, find opportunities, and connect with the community</p>
            </div>

            {/* Category Cards */}
            <section className="discovery-section">
                <h2 className="section-title">Browse by Topic</h2>
                <div className="category-grid-premium">
                    {categories.map(([key, cat]) => {
                        const Icon = cat.icon;
                        return (
                            <Link
                                to={`/feed?category=${key}`}
                                key={key}
                                className="category-card-premium"
                                id={`discover-${key}`}
                            >
                                <div className="category-card-glow" style={{ '--glow-color': 'var(--accent)' } as any} />
                                <span className="category-card-icon-wrap" style={{ background: `${cat.color}18`, color: cat.color }}>
                                    <Icon size={24} />
                                </span>
                                <h3>{cat.label}</h3>
                                <span className="category-card-arrow"><ArrowRight size={16} /></span>
                            </Link>
                        );
                    })}
                </div>
            </section>

            {/* Trending Posts */}
            <section className="discovery-section">
                <h2 className="section-title"><TrendingUp className="inline-icon" size={20} /> Trending Now</h2>
                {loading ? (
                    <div className="loading-container"><div className="spinner" /></div>
                ) : (
                    <div className="trending-grid">
                        {trending.slice(0, 6).map((post, index) => {
                            const cat = CATEGORY_CONFIG[post.category];
                            const CatIcon = cat.icon;
                            const initials = post.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                            return (
                                <Link to={`/posts/${post.id}`} key={post.id} className="card trending-card-premium">
                                    <div className="trending-rank">#{index + 1}</div>
                                    <div className="trending-card-top">
                                        <div className="trending-card-info">
                                            <span className="trending-badge" style={{ color: cat.color, background: `${cat.color}15` }}>
                                                <CatIcon size={12} /> {cat.label}
                                            </span>
                                            <h3>{post.title}</h3>
                                            <p>{post.content.replace(/<[^>]*>/g, '').slice(0, 100)}…</p>
                                        </div>
                                        {post.imageUrl && (
                                            <div className="trending-card-thumb">
                                                <img src={post.imageUrl} alt="" loading="lazy" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="trending-meta">
                                        <div className="trending-author-info">
                                            <div className="trending-author-avatar">
                                                {post.avatarUrl ? (
                                                    <img src={post.avatarUrl} alt="" />
                                                ) : (
                                                    <span>{initials}</span>
                                                )}
                                            </div>
                                            <span className="trending-author">{post.displayName}</span>
                                            {post.userType === 'investor' && (
                                                <span className="investor-badge-sm">💰 Investor</span>
                                            )}
                                        </div>
                                        <span className="trending-stats">
                                            {post.viewCount > 0 && <><Eye size={12} /> {post.viewCount}</>}
                                            {post.likeCount > 0 && <> · <Heart size={12} /> {post.likeCount}</>}
                                            {post.commentCount > 0 && <> · <MessageSquare size={12} /> {post.commentCount}</>}
                                        </span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Quick Links */}
            <section className="discovery-section">
                <h2 className="section-title"><Star className="inline-icon" size={20} /> Quick Links</h2>
                <div className="quick-links">
                    <Link to="/members" className="card quick-link-card">
                        <span className="ql-icon"><Users size={28} /></span>
                        <h3>Browse Members</h3>
                        <p>Find co-founders, mentors, and collaborators</p>
                    </Link>
                    <Link to="/chatrooms" className="card quick-link-card">
                        <span className="ql-icon"><MessageCircle size={28} /></span>
                        <h3>Chat Rooms</h3>
                        <p>Join real-time discussions with the community</p>
                    </Link>
                    <Link to="/feed?category=events" className="card quick-link-card">
                        <span className="ql-icon"><Mic size={28} /></span>
                        <h3>Startup Events</h3>
                        <p>Discover upcoming events and meetups</p>
                    </Link>
                </div>
            </section>
        </div>
    );
}
