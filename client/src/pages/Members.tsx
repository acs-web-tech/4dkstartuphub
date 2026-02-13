
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '../services/api';
import { Users, User, FileText, MapPin, Calendar, Search } from 'lucide-react';

export default function Members() {
    const [users, setUsers] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        usersApi.getAll({ page, search: search || undefined })
            .then(data => {
                setUsers(data.users);
                setPagination(data.pagination);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [page, search]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Users className="inline-icon" size={28} /> Members</h1>
                <p className="page-subtitle">Connect with fellow entrepreneurs</p>
            </div>

            <form className="search-form" onSubmit={handleSearch}>
                <div style={{ position: 'relative', maxWidth: '600px', margin: '0 auto' }}>
                    <Search className="absolute-center-y" size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        className="form-input search-input"
                        placeholder="Search members by name or username..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        maxLength={100}
                        id="member-search"
                        style={{ paddingLeft: '48px' }}
                    />
                </div>
            </form>

            {loading ? (
                <div className="loading-container"><div className="spinner" /><p>Loading members...</p></div>
            ) : users.length === 0 ? (
                <div className="empty-state">
                    <span className="empty-icon"><User size={48} /></span>
                    <h2>No members found</h2>
                </div>
            ) : (
                <>
                    <div className="members-grid">
                        {users.map(user => {
                            const initials = user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                            return (
                                <Link to={`/users/${user.id}`} key={user.id} className="card member-card" id={`member-${user.id}`}>
                                    <div className="member-avatar avatar-lg">
                                        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{initials}</span>}
                                    </div>
                                    <h3 className="member-name">{user.displayName}</h3>
                                    <span className="member-username">@{user.username}</span>
                                    {user.role !== 'user' && (
                                        <span className={`role-badge role-${user.role}`}>{user.role}</span>
                                    )}
                                    {user.bio && <p className="member-bio">{user.bio.slice(0, 100)}</p>}
                                    <div className="member-stats">
                                        <span><FileText size={14} className="inline mr-1" /> {user.postCount} posts</span>
                                        <span><Calendar size={14} className="inline mr-1" /> Joined {new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        {user.location && <span><MapPin size={14} className="inline mr-1" /> {user.location}</span>}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {pagination && pagination.totalPages > 1 && (
                        <div className="pagination">
                            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                                <button key={p} className={`pagination-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>
                                    {p}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
