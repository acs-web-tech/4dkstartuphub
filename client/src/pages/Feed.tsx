import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link, useLocation } from 'react-router-dom';
import PostCard from '../components/Post/PostCard';
import { postsApi } from '../services/api';
import { Post, Pagination, PostCategory } from '../types';
import { CATEGORY_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import { Search, Newspaper, Hand, CheckCircle, Circle, ArrowRight, Inbox, RefreshCw, X } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

// ─── In-memory feed cache (persists across SPA navigations) ───
interface FeedMemoryCache {
    posts: Post[];
    page: number;
    totalPages: number;
    category: string;
    search: string;
    scrollY: number;
    timestamp: number;
}

// Module-level variable — persists across SPA navigations
const feedCache = new Map<string, FeedMemoryCache>();

export default function Feed() {
    const { user } = useAuth();
    const { socket, connected, onlineUsers } = useSocket();
    const [searchParams] = useSearchParams();
    const location = useLocation();

    const category = searchParams.get('category') || '';
    const search = searchParams.get('search') || '';
    const cacheKey = JSON.stringify({ category, search });

    // Check if we have a valid in-memory cache matching current filters
    const getValidCache = (): FeedMemoryCache | null => {
        const cached = feedCache.get(cacheKey);
        if (!cached) return null;

        // Only use cache if within 10 minutes
        if ((Date.now() - cached.timestamp) < 10 * 60 * 1000) {
            return cached;
        }
        feedCache.delete(cacheKey);
        return null;
    };

    const cachedData = getValidCache();

    // State — initialize from cache if available (instant render, no loading flash)
    const [posts, setPosts] = useState<Post[]>(cachedData?.posts || []);
    const [loading, setLoading] = useState(!cachedData);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(cachedData?.page || 1);
    const [hasMore, setHasMore] = useState(cachedData ? cachedData.page < cachedData.totalPages : true);
    const [pagination, setPagination] = useState<Pagination | null>(
        cachedData ? { page: cachedData.page, totalPages: cachedData.totalPages, total: cachedData.posts.length, limit: 10 } : null
    );

    // Refs for socket handlers
    const categoryRef = useRef(category);
    const searchRef = useRef(search);
    const pageRef = useRef(page);
    const skipFetchRef = useRef(!!cachedData); // skip first fetch if we restored from cache

    // Intersection Observer for Infinite Scroll
    const observer = useRef<IntersectionObserver>();
    const lastPostElementRef = useCallback((node: HTMLDivElement) => {
        if (loading || loadingMore) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                setPage((prev: number) => prev + 1);
            }
        });

        if (node) observer.current.observe(node);
    }, [loading, loadingMore, hasMore]);

    // Cleanup observer on unmount
    useEffect(() => {
        return () => {
            if (observer.current) observer.current.disconnect();
        };
    }, []);

    // ─── Scroll position tracking & restoration ───
    const lastScrollY = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            lastScrollY.current = window.scrollY;
        };
        window.addEventListener('scroll', handleScroll, { passive: true });

        // Disable automatic browser scroll restoration
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    // Restore scroll position from cache on mount
    useEffect(() => {
        if (cachedData && cachedData.scrollY > 0) {
            // Use multiple attempts since images may still be loading
            requestAnimationFrame(() => {
                window.scrollTo({ top: cachedData.scrollY, behavior: 'auto' });
                setTimeout(() => window.scrollTo({ top: cachedData.scrollY, behavior: 'auto' }), 150);
            });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Save to in-memory cache whenever posts/state change + on unmount ───
    useEffect(() => {
        categoryRef.current = category;
        searchRef.current = search;
        pageRef.current = page;
    }, [category, search, page]);

    // Save cache on unmount
    useEffect(() => {
        return () => {
            const currentScroll = lastScrollY.current || window.scrollY;
            if (posts.length > 0) {
                const currentKey = JSON.stringify({
                    category: categoryRef.current,
                    search: searchRef.current
                });
                feedCache.set(currentKey, {
                    posts: posts.slice(0, 60),
                    page: pageRef.current,
                    totalPages: pagination?.totalPages || 1,
                    category: categoryRef.current,
                    search: searchRef.current,
                    scrollY: currentScroll,
                    timestamp: Date.now(),
                });
            }
        };
    }, [posts, pagination]);

    // ─── Real-time socket updates ───
    useEffect(() => {
        if (!socket) return;

        const handleNewPost = (post: Post) => {
            const matchesCategory = !categoryRef.current || post.category === categoryRef.current;
            const notFiltering = !searchRef.current;

            if (matchesCategory && notFiltering) {
                setPosts(prev => {
                    if (prev.find(p => p.id === post.id)) return prev;
                    return [post, ...prev];
                });
            }
        };

        const handlePostLiked = ({ postId, likeCount }: { postId: string, likeCount: number }) => {
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, likeCount } : p));
        };

        const handlePostUpdated = ({ postId, post: updatedPost }: { postId: string, post: Post }) => {
            setPosts(prev => prev.map(p => p.id === postId ? updatedPost : p));
        };

        const handlePostDeleted = ({ postId }: { postId: string }) => {
            setPosts(prev => prev.filter(p => p.id !== postId));
        };

        const handleCommentCount = ({ postId, commentCount }: { postId: string, commentCount: number }) => {
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount } : p));
        };

        socket.on('newPost', handleNewPost);
        socket.on('postLiked', handlePostLiked);
        socket.on('postUpdated', handlePostUpdated);
        socket.on('postDeleted', handlePostDeleted);
        socket.on('commentCountUpdated', handleCommentCount);

        return () => {
            socket.off('newPost', handleNewPost);
            socket.off('postLiked', handlePostLiked);
            socket.off('postUpdated', handlePostUpdated);
            socket.off('postDeleted', handlePostDeleted);
            socket.off('commentCountUpdated', handleCommentCount);
        };
    }, [socket]);

    // ─── Reset on filter change (category/search) ───
    const prevFiltersRef = useRef({ category, search });
    useEffect(() => {
        const prev = prevFiltersRef.current;
        prevFiltersRef.current = { category, search };

        // If filters changed, reset and fetch fresh (unless we have valid cache for the new filter)
        if (prev.category !== category || prev.search !== search) {
            const freshCache = getValidCache();
            if (freshCache) {
                // We already initialized from cache — skip fetch
                skipFetchRef.current = true;
                return;
            }
            setPosts([]);
            setPage(1);
            setHasMore(true);
            skipFetchRef.current = false;
        }
    }, [category, search]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Fetch posts from API ───
    useEffect(() => {
        // Skip fetch if we restored from in-memory cache
        if (skipFetchRef.current) {
            skipFetchRef.current = false;
            return;
        }

        let isCurrent = true;
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        postsApi.getAll({ page, limit: 10, category: category || undefined, search: search || undefined })
            .then(data => {
                if (!isCurrent) return;

                setPosts(current => {
                    const fetchedIds = new Set(data.posts.map(p => p.id));
                    const filtered = current.filter(p => !fetchedIds.has(p.id));
                    return page === 1 ? data.posts : [...filtered, ...data.posts];
                });

                setPagination(data.pagination);
                setHasMore(data.pagination.page < data.pagination.totalPages);
            })
            .catch(() => {
                if (isCurrent) setHasMore(false);
            })
            .finally(() => {
                if (isCurrent) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            });

        return () => { isCurrent = false; };
    }, [page, category, search]);

    const currentCat = category ? CATEGORY_CONFIG[category as PostCategory] : null;

    const [lightbox, setLightbox] = useState<string | null>(null);

    return (
        <div className="feed-page">
            {lightbox && (
                <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
                    <button className="lightbox-close-btn" onClick={() => setLightbox(null)}>
                        <X size={24} />
                    </button>
                    <img src={lightbox} className="lightbox-content" alt="" onClick={e => e.stopPropagation()} />
                </div>
            )}
            <div className="feed-header">
                {currentCat ? (
                    (() => {
                        const Icon = currentCat.icon;
                        return (
                            <div className="feed-category-banner" style={{ borderColor: currentCat.color }}>
                                <span className="feed-cat-icon"><Icon size={48} /></span>
                                <div>
                                    <h1>{currentCat.label} {connected && <span className="online-indicator" title="Live updates active"></span>}</h1>
                                    <p className="page-subtitle">Browse posts in this category</p>
                                </div>
                                {user && (category === 'events' ? user.role === 'admin' : true) && (
                                    <Link to={`/create-post${category ? `?category=${category}` : ''}`} className="btn btn-primary" id="create-from-feed">Create</Link>
                                )}
                            </div>
                        );
                    })()
                ) : search ? (
                    <div className="feed-category-banner">
                        <span className="feed-cat-icon"><Search size={48} /></span>
                        <div>
                            <h1>Search: "{search}"</h1>
                            <p className="page-subtitle">{pagination?.total || 0} results found</p>
                        </div>
                    </div>
                ) : (
                    <div className="feed-category-banner">
                        <span className="feed-cat-icon"><Newspaper size={48} /></span>
                        <div>
                            <h1>Feed {connected && <span className="online-indicator" title="Live updates active"></span>}</h1>
                            <p className="page-subtitle">Latest from the startup community</p>
                        </div>
                        {user && (
                            <Link to="/create-post" className="btn btn-primary" id="create-from-feed-main">Create</Link>
                        )}
                    </div>
                )}
            </div>

            {/* Welcome card for new users */}
            {user && !user.profileCompleted && page === 1 && (
                <div className="card welcome-card">
                    <h2>Welcome back, {user.displayName}! <Hand className="inline-icon" size={24} /></h2>
                    <div className="checklist">
                        <div className="checklist-item done"><CheckCircle size={16} className="inline mr-2" /> Fill Out Your Profile</div>
                        <div className="checklist-item"><Circle size={16} className="inline mr-2" /> Introduce Yourself</div>
                        <div className="checklist-item"><Circle size={16} className="inline mr-2" /> Browse the Community</div>
                    </div>
                    <Link to="/profile" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>Complete Profile <ArrowRight size={16} /></Link>
                </div>
            )}

            {loading ? (
                <div className="loading-container">
                    <div className="spinner" />
                    <p>Loading posts...</p>
                </div>
            ) : posts.length === 0 ? (
                <div className="empty-state">
                    <span className="empty-icon"><Inbox size={48} /></span>
                    <h2>No posts yet</h2>
                    <p>Be the first to share something with the community!</p>
                    {user && (category === 'events' ? user.role === 'admin' : true) && <Link to={`/create-post${category ? `?category=${category}` : ''}`} className="btn btn-primary">Create Post</Link>}
                </div>
            ) : (
                <>
                    <div className="posts-list">
                        {posts
                            .filter(p => !category || p.category === category)
                            .map((post, index) => {
                                // Inject online status
                                const postWithStatus = {
                                    ...post,
                                    userIsOnline: connected ? onlineUsers.has(post.userId) : false
                                };

                                if (posts.length === index + 1) {
                                    return (
                                        <div ref={lastPostElementRef} key={post.id}>
                                            <PostCard post={postWithStatus} onImageClick={setLightbox} />
                                        </div>
                                    );
                                } else {
                                    return <PostCard key={post.id} post={postWithStatus} onImageClick={setLightbox} />;
                                }
                            })}
                    </div>

                    {loadingMore && (
                        <div className="loading-more">
                            <RefreshCw size={24} className="animate-spin text-accent" />
                            <p>Loading more posts...</p>
                        </div>
                    )}

                    {!hasMore && posts.length > 0 && (
                        <div className="end-of-feed">
                            <p>You've reached the end of the line! ✨</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
