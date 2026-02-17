import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { editorModules, editorFormats } from '../config/editor';
import { postsApi, uploadApi } from '../services/api';
import { Post, Comment } from '../types';
import { CATEGORY_CONFIG } from '../config';
import { useAuth } from '../context/AuthContext';
import {
    Pin, Lock, Heart, MessageSquare, Bookmark, Pencil, Trash2, PinOff, Unlock, ArrowLeft, X, MoreVertical, Calendar as CalendarIcon, Download, Share2, Link2, Check, Copy
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { SmartImage } from '../components/Common/SmartImage';
import CommentsSection from '../components/Post/CommentsSection';

export default function PostDetail() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const { socket } = useSocket();
    const navigate = useNavigate();
    const location = useLocation();
    const [post, setPost] = useState<Post | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);

    useEffect(() => {
        if (socket && id) {
            socket.emit('joinPost', id);

            // Handle post likes
            socket.on('postLiked', ({ postId, likeCount }: { postId: string, likeCount: number }) => {
                if (postId === id) {
                    setPost(prev => prev ? { ...prev, likeCount } : null);
                }
            });

            // Handle post updates
            socket.on('postUpdated', ({ postId, post: updatedPost }: { postId: string, post: Post }) => {
                if (postId === id) {
                    setPost(updatedPost);
                }
            });

            // Handle post deletions
            socket.on('postDeleted', ({ postId }: { postId: string }) => {
                if (postId === id) {
                    navigate('/feed');
                }
            });

            // Handle comment count updates
            socket.on('commentCountUpdated', ({ postId, commentCount }: { postId: string, commentCount: number }) => {
                if (postId === id) {
                    setPost(prev => prev ? { ...prev, commentCount } : null);
                }
            });

            return () => {
                socket.emit('leavePost', id);
                socket.off('postLiked');
                socket.off('postUpdated');
                socket.off('postDeleted');
                socket.off('commentCountUpdated');
            };
        }
    }, [socket, id, navigate]);


    // State variables
    const [liked, setLiked] = useState(false);
    const [bookmarked, setBookmarked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({ title: '', content: '', category: '', videoUrl: '' });
    const [saving, setSaving] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [showShare, setShowShare] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const quillRef = useRef<ReactQuill>(null);
    const shareRef = useRef<HTMLDivElement>(null);

    // Close share dropdown on outside click
    useEffect(() => {
        if (!showShare) return;
        const handler = (e: MouseEvent) => {
            if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
                setShowShare(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showShare]);

    // Helper functions
    const editImageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        input.onchange = async () => {
            if (input.files && input.files[0]) {
                if (input.files[0].size > 5 * 1024 * 1024) {
                    alert('Image size exceeds 5MB limit');
                    return;
                }
                try {
                    setImageUploading(true);
                    const data = await uploadApi.upload(input.files[0]);
                    const range = quillRef.current?.getEditor().getSelection();
                    if (range) {
                        quillRef.current?.getEditor().insertEmbed(range.index, 'image', data.url);
                    }
                } catch {
                    alert('Image upload failed');
                } finally {
                    setImageUploading(false);
                }
            }
        };
    };

    const editModules = useMemo(() => ({
        ...editorModules,
        toolbar: {
            container: editorModules.toolbar.container,
            handlers: {
                image: editImageHandler
            }
        }
    }), []);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        // post data fetch does not depend on user state in UI, api handles token
        postsApi.getById(id)
            .then(data => {
                setPost(data.post);
                setComments(data.comments);
            })
            .catch(() => navigate('/feed'))
            .finally(() => setLoading(false));
    }, [id, navigate, location.key]);

    useEffect(() => {
        if (id && user) {
            postsApi.checkLiked(id).then(d => setLiked(d.liked)).catch(() => { });
        }
    }, [id, user, location.key]);

    const handleLike = async () => {
        if (!user || !id) return;
        try {
            const data = await postsApi.like(id);
            setLiked(data.liked);
            // rely on socket for count update to avoid race conditions/double counts
            if (!socket) {
                setPost(prev => prev ? {
                    ...prev,
                    likeCount: data.liked ? prev.likeCount + 1 : prev.likeCount - 1,
                } : null);
            }
        } catch { }
    };

    const handleBookmark = async () => {
        if (!user || !id) return;
        try {
            const data = await postsApi.bookmark(id);
            setBookmarked(data.bookmarked);
        } catch { }
    };

    const handleDelete = async () => {
        if (!id || !confirm('Are you sure you want to delete this post?')) return;
        try {
            await postsApi.delete(id);
            navigate('/feed');
        } catch { }
    };

    const handlePin = async () => {
        if (!id) return;
        await postsApi.pin(id);
        setPost(prev => prev ? { ...prev, isPinned: prev.isPinned ? 0 : 1 } : null);
    };

    const handleLock = async () => {
        if (!id) return;
        await postsApi.lock(id);
        setPost(prev => prev ? { ...prev, isLocked: prev.isLocked ? 0 : 1 } : null);
    };

    const handleEdit = () => {
        if (!post) return;
        setEditForm({ title: post.title, content: post.content, category: post.category, videoUrl: post.videoUrl || '' });
        setEditing(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !editForm.title.trim() || !editForm.content.trim()) return;
        setSaving(true);
        try {
            await postsApi.update(id, {
                title: editForm.title.trim(),
                content: editForm.content.trim(),
                category: editForm.category,
                videoUrl: editForm.videoUrl.trim() || undefined
            });
            // Refresh post data
            const data = await postsApi.getById(id);
            setPost(data.post);
            setEditing(false);
        } catch (err: any) {
            alert(err.message || 'Failed to update post');
        }
        setSaving(false);
    };

    const handleCancelEdit = () => {
        setEditing(false);
        setEditForm({ title: '', content: '', category: '', videoUrl: '' });
    };

    const [showCalendarOptions, setShowCalendarOptions] = useState(false);

    const getGoogleCalendarUrl = () => {
        if (!post?.eventDate) return '';
        const start = new Date(post.eventDate).toISOString().replace(/-|:|\.\d+/g, '');
        const end = new Date(new Date(post.eventDate).getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');
        const details = post.content.replace(/<[^>]*>/g, '').slice(0, 500);
        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(post.title)}&dates=${start}/${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(window.location.href)}`;
    };

    const downloadIcs = () => {
        if (!post?.eventDate) return;
        const date = new Date(post.eventDate).toISOString().replace(/-|:|\.\d+/g, '');
        const end = new Date(new Date(post.eventDate).getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');
        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            `DTSTART:${date}`,
            `DTEND:${end}`,
            `SUMMARY:${post.title}`,
            `DESCRIPTION:${post.content.replace(/<[^>]*>/g, '').slice(0, 500)}`,
            `LOCATION:${window.location.href}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', 'event.ics');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleContentClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'IMG') {
            setLightbox((target as HTMLImageElement).src);
        }
    };

    if (loading) return <div className="loading-container"><div className="spinner" /><p>Loading...</p></div>;
    if (!post) return <div className="empty-state"><h2>Post not found</h2></div>;

    const cat = CATEGORY_CONFIG[post.category];
    const Icon = cat.icon;
    const isAuthor = user?.id === post.userId;
    const isAdmin = user?.role === 'admin';
    const isMod = user?.role === 'moderator' || isAdmin;
    const initials = post.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="post-detail-page">
            {lightbox && (
                <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
                    <button className="lightbox-close-btn" onClick={() => setLightbox(null)}>
                        <X size={24} />
                    </button>
                    <img src={lightbox} className="lightbox-content" alt="" onClick={e => e.stopPropagation()} />
                </div>
            )}
            <button
                className="btn btn-ghost back-btn"
                id="post-back-btn"
                onClick={() => {
                    if (window.history.length > 1) {
                        navigate(-1);
                    } else {
                        navigate('/feed');
                    }
                }}
            >
                <ArrowLeft size={16} className="mr-2" /> Back
            </button>

            <article className="card post-detail">
                {post.isPinned ? <div className="post-pinned"><Pin size={14} className="inline mr-1" /> Pinned Post</div> : null}
                {post.isLocked ? <div className="post-locked"><Lock size={14} className="inline mr-1" /> This post is locked</div> : null}

                <div className="post-detail-header">
                    <Link to={`/users/${post.userId}`} className="post-author-info">
                        <div className="avatar avatar-lg">
                            {post.avatarUrl ? (
                                <SmartImage src={post.avatarUrl} alt="" />
                            ) : (
                                <span>{initials}</span>
                            )}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <strong className="post-author">{post.displayName}</strong>
                                {post.userType === 'investor' && (
                                    <span className="investor-badge">💰 Investor</span>
                                )}
                            </div>
                            <span className="post-username">@{post.username}</span>
                            {post.userBio && <p className="post-author-bio">{post.userBio}</p>}
                        </div>
                    </Link>

                    <div className="flex items-center gap-3">
                        <span className="post-category-badge" style={{ background: cat.color + '22', color: cat.color }}>
                            <Icon size={14} className="inline mr-1" /> {cat.label}
                        </span>

                        {post.eventDate && (
                            <div className="relative">
                                <button
                                    className="btn btn-ghost btn-sm flex items-center gap-1"
                                    onClick={() => setShowCalendarOptions(!showCalendarOptions)}
                                    title="Add to Calendar"
                                >
                                    <CalendarIcon size={16} /> Add to Calendar
                                </button>
                                {showCalendarOptions && (
                                    <div className="dropdown-menu show right-0 top-full mt-1 w-48 z-10" style={{ position: 'absolute' }}>
                                        <a href={getGoogleCalendarUrl()} target="_blank" rel="noopener noreferrer" className="dropdown-item flex items-center gap-2">
                                            <CalendarIcon size={14} /> Google Calendar
                                        </a>
                                        <button onClick={downloadIcs} className="dropdown-item flex items-center gap-2 w-full text-left">
                                            <Download size={14} /> Download .ics
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {editing ? (
                    <form onSubmit={handleSaveEdit} className="post-edit-form">
                        <div className="form-group">
                            <label htmlFor="edit-title">Title</label>
                            <input
                                id="edit-title"
                                type="text"
                                className="form-input"
                                value={editForm.title}
                                onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                                maxLength={200}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="edit-category">Category</label>
                            <div className="category-selector">
                                {(Object.entries(CATEGORY_CONFIG) as [import('../types').PostCategory, typeof CATEGORY_CONFIG[import('../types').PostCategory]][]).map(
                                    ([key, catConfig]) => {
                                        const CatIcon = catConfig.icon;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                className={`category-chip ${editForm.category === key ? 'active' : ''}`}
                                                style={editForm.category === key ? { background: catConfig.color + '33', borderColor: catConfig.color, color: catConfig.color } : {}}
                                                onClick={() => setEditForm(prev => ({ ...prev, category: key as string }))}
                                            >
                                                <CatIcon size={14} className="inline mr-1" /> {catConfig.label}
                                            </button>
                                        );
                                    }
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="edit-content">Content</label>
                            <div className="rich-editor-container" style={{ position: 'relative' }}>
                                {imageUploading && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        background: 'rgba(0,0,0,0.5)',
                                        zIndex: 10,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '8px',
                                        color: 'white'
                                    }}>
                                        <div className="spinner" style={{ marginRight: '10px' }}></div>
                                        Uploading image...
                                    </div>
                                )}
                                <ReactQuill
                                    ref={quillRef}
                                    theme="snow"
                                    value={editForm.content}
                                    onChange={(val: string) => setEditForm(prev => ({ ...prev, content: val }))}
                                    modules={editModules}
                                    formats={editorFormats}
                                    className="rich-editor"
                                    placeholder="Edit your post content..."
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="edit-video">Video Link (Optional)</label>
                            <input
                                id="edit-video"
                                type="url"
                                className="form-input"
                                placeholder="https://youtube.com/..."
                                value={editForm.videoUrl}
                                onChange={e => setEditForm(prev => ({ ...prev, videoUrl: e.target.value }))}
                                maxLength={500}
                            />
                        </div>

                        <div className="form-actions">
                            <button type="button" className="btn btn-ghost" onClick={handleCancelEdit} disabled={saving}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <>
                        <h1 className="post-detail-title">{post.title}</h1>

                        {post.eventDate && (
                            <div className="post-event-info mb-6 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center gap-4">
                                <div className="event-date-box text-center p-2 rounded bg-[var(--accent-soft)] min-w-[70px]">
                                    <div className="text-xs uppercase font-bold text-[var(--accent)]">
                                        {new Date(post.eventDate).toLocaleDateString('en-IN', { month: 'short' })}
                                    </div>
                                    <div className="text-2xl font-bold">
                                        {new Date(post.eventDate).getDate()}
                                    </div>
                                </div>
                                <div className="event-time-info">
                                    <div className="font-semibold">{new Date(post.eventDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                                    <div className="text-[var(--text-muted)] text-sm">
                                        {new Date(post.eventDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {post.imageUrl && (
                            <div
                                className="post-detail-cover cursor-pointer"
                                onClick={() => setLightbox(post.imageUrl)}
                                title="Click to enlarge"
                            >
                                <SmartImage src={post.imageUrl} alt={post.title} />
                            </div>
                        )}

                        <div
                            className="post-detail-content ql-editor"
                            dangerouslySetInnerHTML={{ __html: post.content }}
                            onClick={handleContentClick}
                        />

                        {post.videoUrl && (() => {
                            const getEmbedUrl = (url: string) => {
                                try {
                                    // Handle YouTube
                                    if (url.includes('youtube.com') || url.includes('youtu.be')) {
                                        let videoId = '';
                                        if (url.includes('youtube.com/watch')) {
                                            videoId = new URL(url).searchParams.get('v') || '';
                                        } else if (url.includes('youtu.be')) {
                                            videoId = url.split('/').pop() || '';
                                        } else if (url.includes('youtube.com/embed')) {
                                            return url;
                                        }
                                        return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
                                    }

                                    // Handle Vimeo
                                    if (url.includes('vimeo.com')) {
                                        const videoId = url.split('/').pop();
                                        return videoId ? `https://player.vimeo.com/video/${videoId}` : '';
                                    }

                                    return '';
                                } catch (e) {
                                    console.error('Error parsing video URL:', e);
                                    return '';
                                }
                            };

                            const embedUrl = getEmbedUrl(post.videoUrl);

                            if (!embedUrl) return null;

                            return (
                                <div className="post-video-container mt-6 mb-6 rounded-lg overflow-hidden border border-[var(--border-color)]">
                                    <iframe
                                        src={embedUrl}
                                        title="Video player"
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                </div>
                            );
                        })()}

                        <div className="post-detail-meta">
                            <span>{(() => {
                                const dStr = post.createdAt;
                                const date = (!dStr.endsWith('Z') && !dStr.includes('+')) ? new Date(dStr + 'Z') : new Date(dStr);
                                return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
                            })()}</span>
                            <span>·</span>
                            <span>{post.viewCount} views</span>
                        </div>
                    </>
                )}

                <div className="post-actions">
                    <button
                        className={`action-btn ${liked ? 'liked' : ''}`}
                        onClick={handleLike}
                        disabled={!user}
                        id="like-btn"
                    >
                        <Heart size={18} className={liked ? "fill-current" : ""} /> {post.likeCount}
                    </button>
                    <button className="action-btn" id="comment-count">
                        <MessageSquare size={18} /> {post.commentCount}
                    </button>
                    {user && (
                        <button
                            className={`action-btn ${bookmarked ? 'bookmarked' : ''}`}
                            onClick={handleBookmark}
                            id="bookmark-btn"
                        >
                            <Bookmark size={18} className={bookmarked ? "fill-current" : ""} /> Save
                        </button>
                    )}

                    {/* Share Button */}
                    <div className="relative" ref={shareRef}>
                        <button className="action-btn" onClick={() => setShowShare(!showShare)} id="share-btn">
                            <Share2 size={18} /> Share
                        </button>
                        {showShare && (
                            <div className="share-dropdown" onClick={e => e.stopPropagation()}>
                                <a
                                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(window.location.href)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="share-item"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                    <span>X (Twitter)</span>
                                </a>
                                <a
                                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="share-item"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                                    <span>Facebook</span>
                                </a>
                                <a
                                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="share-item"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                                    <span>LinkedIn</span>
                                </a>
                                <a
                                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(post.title + '\n' + window.location.href)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="share-item"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                    <span>WhatsApp</span>
                                </a>
                                <a
                                    href={`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(post.title)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="share-item"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.013-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
                                    <span>Telegram</span>
                                </a>
                                <a
                                    href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent('Check out this post: ' + window.location.href)}`}
                                    className="share-item"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,7 12,13 2,7" /></svg>
                                    <span>Email</span>
                                </a>
                                <button
                                    className="share-item"
                                    onClick={() => {
                                        navigator.clipboard.writeText(window.location.href);
                                        setLinkCopied(true);
                                        setTimeout(() => setLinkCopied(false), 2000);
                                    }}
                                >
                                    {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                                    <span>{linkCopied ? 'Link Copied!' : 'Copy Link'}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {isAuthor && (
                        <Link to={`/edit-post/${id}`} className="action-btn" id="edit-post-btn">
                            <Pencil size={18} /> Edit
                        </Link>
                    )}
                    {(isAuthor || isAdmin) && (
                        <button className="action-btn danger" onClick={handleDelete} id="delete-post-btn">
                            <Trash2 size={18} /> Delete
                        </button>
                    )}
                    {isMod && (
                        <>
                            <button className="action-btn" onClick={handlePin}>
                                {post.isPinned ? <PinOff size={18} /> : <Pin size={18} />}
                                {post.isPinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button className="action-btn" onClick={handleLock}>
                                {post.isLocked ? <Unlock size={18} /> : <Lock size={18} />}
                                {post.isLocked ? 'Unlock' : 'Lock'}
                            </button>
                        </>
                    )}
                </div>
            </article>

            {/* Comments Section */}
            {id && <CommentsSection postId={id} isLocked={!!post.isLocked} initialComments={comments} />}
        </div>
    );
}
