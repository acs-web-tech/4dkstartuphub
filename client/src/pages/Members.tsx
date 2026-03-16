
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usersApi } from '../services/api';
import {
    Users, User, Search, MapPin,
    MoreVertical, Compass, Grid,
    TrendingUp, Map, Clock,
    ShieldCheck, Activity, Wifi, RefreshCw
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
    const [searchParams, setSearchParams] = useSearchParams();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const observerTarget = useRef<HTMLDivElement>(null);

    // Use refs for mutable state that the observer needs
    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const loadingRef = useRef(false);
    const loadingMoreRef = useRef(false);

    // Local search input state for responsive typing (decoupled from URL)
    const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const filter = searchParams.get('filter') || 'online';
    const search = searchParams.get('search') || '';

    // Helper to update URL params
    const updateParams = useCallback((updates: Record<string, string>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([k, v]) => {
                if (v) next.set(k, v); else next.delete(k);
            });
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    // Debounced search: update URL 400ms after user stops typing
    const handleSearchInputChange = (value: string) => {
        setSearchInput(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            updateParams({ search: value });
        }, 400);
    };

    // Sync local input if URL search changes externally (e.g. category change clears search)
    useEffect(() => {
        setSearchInput(search);
    }, [search]);

    const loadMembers = useCallback(async (pageNum: number, isNewSearch = false) => {
        if (isNewSearch) {
            setLoading(true);
            pageRef.current = 1;
            hasMoreRef.current = true;
        } else {
            setLoadingMore(true);
            loadingMoreRef.current = true;
        }
        loadingRef.current = true;
        setError(false);
        try {
            const data = await usersApi.getAll({ page: pageNum, limit: 10, search: search || undefined, filter });
            setUsers(prev => {
                if (isNewSearch) return data.users;
                const existingIds = new Set(prev.map(u => u.id));
                const filtered = data.users.filter((u: any) => !existingIds.has(u.id));
                return [...prev, ...filtered];
            });
            const more = data.pagination.page < data.pagination.totalPages;
            hasMoreRef.current = more;
            if (isNewSearch) pageRef.current = 1;
        } catch (err) {
            console.error('Failed to load members:', err);
            setError(true);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            loadingRef.current = false;
            loadingMoreRef.current = false;
        }
    }, [search, filter]);

    // Reload when search or filter changes
    useEffect(() => {
        loadMembers(1, true);
    }, [loadMembers]);

    // Infinite scroll observer using refs to avoid stale closures
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (
                    entries[0].isIntersecting &&
                    hasMoreRef.current &&
                    !loadingMoreRef.current &&
                    !loadingRef.current
                ) {
                    const nextPage = pageRef.current + 1;
                    pageRef.current = nextPage;
                    loadingMoreRef.current = true;
                    setLoadingMore(true);
                    loadMembers(nextPage, false);
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [loadMembers]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        // Immediately commit current input to URL
        if (debounceRef.current) clearTimeout(debounceRef.current);
        updateParams({ search: searchInput });
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
                            onClick={() => {
                                setSearchInput('');
                                updateParams({ filter: cat.id, search: '' });
                            }}
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
                        value={searchInput}
                        onChange={e => handleSearchInputChange(e.target.value)}
                        maxLength={100}
                    />
                </form>
            </div>

            {loading ? (
                <div className="loading-container">
                    <div className="spinner" />
                    <p>Fetching members...</p>
                </div>
            ) : error ? (
                <div className="error-state p-12 text-center">
                    <Wifi size={48} className="text-gray-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Failed to load members</h2>
                    <p className="text-gray-400 mb-6">There was a problem reaching our servers.</p>
                    <button className="btn btn-primary inline-flex items-center" onClick={() => loadMembers(1, true)}>
                        <RefreshCw size={18} className="mr-2" /> Try Again
                    </button>
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
                                            <span className="member-row-role">
                                                {user.userType === 'startup' ? '🚀 Startup' :
                                                    user.userType === 'investor' ? '💰 Investor' :
                                                        user.userType === 'freelancer' ? '🛠 Freelancer' : 'Member'}
                                            </span>
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

                    <div ref={observerTarget} style={{ height: '10px' }} />
                    {loadingMore && <div className="loading-spinner-small" style={{ margin: '1rem auto' }} />}
                </div>
            )}
        </div>
    );
}
