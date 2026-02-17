
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '../services/api';
import {
    Users, User, Search, MapPin,
    MoreVertical, Compass, Grid,
    TrendingUp, Map, Clock,
    ShieldCheck, Activity
} from 'lucide-react';
import { SmartImage } from '../components/Common/SmartImage';

const CATEGORIES = [
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'all', label: 'All', icon: Grid },
    { id: 'top', label: 'Top', icon: TrendingUp },
    { id: 'near-me', label: 'Near You', icon: Map },
    { id: 'newest', label: 'Newest', icon: Clock },
    { id: 'hosts', label: 'Hosts', icon: ShieldCheck },
    { id: 'online', label: 'Online Now', icon: Activity },
];

export default function Members() {
    const [users, setUsers] = useState<any[]>([]);
    const [filter, setFilter] = useState('online'); // Set 'online' as default as per user request
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        usersApi.getAll({ page, search: search || undefined, filter })
            .then(data => {
                setUsers(data.users);
                setPagination(data.pagination);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [page, search, filter]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
    };

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="members-page-container">
            <div className="members-header">
                <div className="header-title-section">
                    <h1><Users size={28} className="mr-3" /> Members</h1>
                </div>

                <div className="members-categories-bar">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            className={`category-pill ${filter === cat.id ? 'active' : ''}`}
                            onClick={() => { setFilter(cat.id); setPage(1); }}
                        >
                            <span>{cat.label}</span>
                        </button>
                    ))}
                </div>

                <form className="members-search-box" onSubmit={handleSearch}>
                    <Search className="search-icon" size={18} />
                    <input
                        type="text"
                        placeholder={filter === 'online' ? 'Search online members...' : 'Search members...'}
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        maxLength={100}
                    />
                </form>
            </div>

            {loading ? (
                <div className="loading-container">
                    <div className="spinner" />
                    <p>Fetching members...</p>
                </div>
            ) : users.length === 0 ? (
                <div className="empty-state">
                    <User size={64} className="mb-4 opacity-20" />
                    <h2>No members found</h2>
                    <p>Try adjusting your search or filters.</p>
                </div>
            ) : (
                <div className="members-list-container">
                    <div className="members-list">
                        {users.map(user => (
                            <div key={user.id} className="member-row-wrapper">
                                <Link to={`/users/${user.id}`} className="member-row-card">
                                    <div className="member-row-avatar-section">
                                        <div className="member-row-avatar">
                                            {user.avatarUrl ? (
                                                <SmartImage src={user.avatarUrl} alt={user.displayName} />
                                            ) : (
                                                <div className="avatar-initials">{getInitials(user.displayName)}</div>
                                            )}
                                            {user.isOnline && <span className="online-indicator-dot" />}
                                        </div>
                                    </div>

                                    <div className="member-row-info">
                                        <div className="member-row-name-line">
                                            <h3 className="member-row-name">
                                                {user.displayName}
                                                {user.role === 'admin' && <ShieldCheck size={16} className="verified-badge" />}
                                                {user.postCount > 50 && <span className="fire-badge">🔥</span>}
                                            </h3>
                                        </div>
                                        <div className="member-row-meta">
                                            <span className="member-row-role">Member</span>
                                        </div>
                                    </div>

                                    <div className="member-row-actions">
                                        <button className="row-action-btn" onClick={(e) => { e.preventDefault(); }}>
                                            <MoreVertical size={20} />
                                        </button>
                                    </div>
                                </Link>
                            </div>
                        ))}
                    </div>

                    {pagination && pagination.totalPages > 1 && (
                        <div className="pagination">
                            {Array.from({ length: Math.min(pagination.totalPages, 10) }, (_, i) => i + 1).map(p => (
                                <button
                                    key={p}
                                    className={`pagination-btn ${p === page ? 'active' : ''}`}
                                    onClick={() => setPage(p)}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
