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
    Pin, Lock, Heart, MessageSquare, Bookmark, Pencil, Trash2, PinOff, Unlock, ArrowLeft, X
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
    const quillRef = useRef<ReactQuill>(null);

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
            setPost(prev => prev ? {
                ...prev,
                likeCount: data.liked ? prev.likeCount + 1 : prev.likeCount - 1,
            } : null);
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
                            <strong className="post-author">{post.displayName}</strong>
                            <span className="post-username">@{post.username}</span>
                            {post.userBio && <p className="post-author-bio">{post.userBio}</p>}
                        </div>
                    </Link>

                    <span className="post-category-badge" style={{ background: cat.color + '22', color: cat.color }}>
                        <Icon size={14} className="inline mr-1" /> {cat.label}
                    </span>
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

                    {isAuthor && !editing && (
                        <button className="action-btn" onClick={handleEdit} id="edit-post-btn">
                            <Pencil size={18} /> Edit
                        </button>
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
