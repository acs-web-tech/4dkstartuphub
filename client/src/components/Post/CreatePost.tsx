
import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { editorModules, editorFormats } from '../../config/editor';
import { postsApi, uploadApi } from '../../services/api';
import { PostCategory } from '../../types';
import { CATEGORY_CONFIG } from '../../config';
import { Rocket, Link as LinkIcon, Save, Calendar } from 'lucide-react';
import LinkPreview from '../Common/LinkPreview';
import { useAuth } from '../../context/AuthContext';
import { clearFeedCache } from '../../pages/Feed';

export default function CreatePost() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { id: editId } = useParams();
    const [searchParams] = useSearchParams();
    const isEditing = !!editId;
    const preselectedCategory = searchParams.get('category') || '';

    // Validate preselected category against permissions
    const getInitialCategory = (): PostCategory => {
        const adminOnly = ['events', 'announcements'];
        if (adminOnly.includes(preselectedCategory)) {
            // Strictly block non-admins from starting with restricted categories
            if (user?.role !== 'admin') return 'general';
            return preselectedCategory as PostCategory;
        }
        return (preselectedCategory && preselectedCategory in CATEGORY_CONFIG)
            ? preselectedCategory as PostCategory
            : 'general';
    };

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [category, setCategory] = useState<PostCategory>(getInitialCategory());

    // Safety check: if user role loads late or changes, boot them off restricted categories
    useEffect(() => {
        const adminOnly = ['events', 'announcements'];
        if (adminOnly.includes(category) && user && user.role !== 'admin') {
            setCategory('general');
        }
    }, [user, category]);
    const [imageUrl, setImageUrl] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(isEditing);
    const [imageUploading, setImageUploading] = useState(false);
    const [thumbnailUploading, setThumbnailUploading] = useState(false);
    const [error, setError] = useState('');
    const quillRef = useRef<ReactQuill>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const thumbnailInputRef = useRef<HTMLInputElement>(null);
    const [extractedUrls, setExtractedUrls] = useState<string[]>([]);

    // Extract URLs for preview
    useEffect(() => {
        const unique = new Set<string>();
        const regex = /(?:href="|src=")?(https?:\/\/[^\s<"]+)/g;
        let match;
        // Search in content string
        while ((match = regex.exec(content)) !== null) {
            // Ignore src="..." (images)
            if (match[0].startsWith('src=')) continue;
            unique.add(match[1]);
        }
        setExtractedUrls(Array.from(unique));
    }, [content]);

    // Fetch post for editing
    useEffect(() => {
        if (isEditing) {
            const fetchPost = async () => {
                try {
                    const data = await postsApi.getById(editId!);
                    setTitle(data.post.title);
                    setContent(data.post.content);
                    setCategory(data.post.category);
                    setVideoUrl(data.post.videoUrl || '');
                    setImageUrl(data.post.imageUrl || '');
                    if (data.post.eventDate) {
                        setEventDate(new Date(data.post.eventDate).toISOString().slice(0, 16));
                    }
                } catch (err: any) {
                    setError('Failed to load post for editing');
                } finally {
                    setFetching(false);
                }
            };
            fetchPost();
        }
    }, [editId, isEditing]);

    const imageHandler = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || !files[0]) return;
        const file = files[0];
        try {
            setThumbnailUploading(true);
            const data = await uploadApi.upload(file);
            setImageUrl(data.url);
        } catch (err: any) {
            setError('Thumbnail upload failed');
        } finally {
            setThumbnailUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || !files[0]) return;

        const file = files[0];
        if (file.size > 5 * 1024 * 1024) {
            setError('Image size exceeds 5MB limit');
            e.target.value = '';
            return;
        }

        try {
            setImageUploading(true);
            setError('');
            const data = await uploadApi.upload(file);
            const range = quillRef.current?.getEditor().getSelection();
            if (range) {
                quillRef.current?.getEditor().insertEmbed(range.index, 'image', data.url);
                quillRef.current?.getEditor().setSelection(range.index + 1, 0);
            } else {
                const length = quillRef.current?.getEditor().getLength() || 0;
                quillRef.current?.getEditor().insertEmbed(length, 'image', data.url);
            }
        } catch (err: any) {
            console.error('Image upload failed:', err);
            setError(err.message || 'Image upload failed');
        } finally {
            setImageUploading(false);
            e.target.value = '';
        }
    };

    const modules = useMemo(() => ({
        ...editorModules,
        toolbar: {
            container: editorModules.toolbar.container,
            handlers: {
                image: imageHandler
            }
        }
    }), []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (title.trim().length < 3) { setError('Title must be at least 3 characters'); return; }
        const textContent = content.replace(/<[^>]*>/g, '');
        if (textContent.trim().length < 10) { setError('Content must be at least 10 characters'); return; }

        setLoading(true);
        try {
            if (isEditing) {
                await postsApi.update(editId!, {
                    title: title.trim(),
                    content: content.trim(),
                    category,
                    videoUrl: videoUrl.trim() || undefined,
                    imageUrl: imageUrl || undefined,
                    eventDate: eventDate ? new Date(eventDate).toISOString() : undefined
                });
                navigate(`/posts/${editId}`);
            } else {
                const data = await postsApi.create({
                    title: title.trim(),
                    content: content.trim(),
                    category,
                    videoUrl: videoUrl.trim() || undefined,
                    imageUrl: imageUrl || undefined,
                    eventDate: eventDate ? new Date(eventDate).toISOString() : undefined
                });
                clearFeedCache(); // Invalidate cache so Feed fetches new post
                navigate(`/posts/${data.postId}`);
            }
        } catch (err: any) {
            setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} post`);
        } finally {
            setLoading(false);
        }
    };

    if (fetching) return <div className="page-container"><div className="spinner" style={{ margin: '50px auto' }}></div></div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>{isEditing ? 'Edit Post' : 'Create Post'}</h1>
                <p className="page-subtitle">{isEditing ? 'Update your story' : 'Share with the startup community'}</p>
            </div>

            <form className="card create-post-form" onSubmit={handleSubmit}>
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                    <label htmlFor="post-category">Category</label>
                    <div className="category-selector">
                        {(Object.entries(CATEGORY_CONFIG) as [PostCategory, typeof CATEGORY_CONFIG[PostCategory]][])
                            .filter(([key]) => !['events', 'announcements'].includes(key) || user?.role === 'admin')
                            .map(
                                ([key, cat]) => {
                                    const Icon = cat.icon;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`category-chip ${category === key ? 'active' : ''}`}
                                            style={category === key ? { background: cat.color + '33', borderColor: cat.color, color: cat.color } : {}}
                                            onClick={() => setCategory(key)}
                                        >
                                            <Icon size={14} className="inline mr-1" /> {cat.label}
                                        </button>
                                    );
                                }

                            )}
                    </div>
                </div>

                {category === 'events' && (
                    <div className="form-group">
                        <label htmlFor="event-date">Event Date & Time</label>
                        <div className="relative" style={{ position: 'relative' }}>
                            <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }} />
                            <input
                                id="event-date"
                                type="datetime-local"
                                className="form-input"
                                style={{ paddingLeft: '36px' }}
                                value={eventDate}
                                onChange={e => setEventDate(e.target.value)}
                                required={category === 'events'}
                            />
                        </div>
                    </div>
                )}

                <div className="form-group">
                    <label>Thumbnail / Cover Image (Optional)</label>
                    <div className="thumbnail-upload-area">
                        {imageUrl ? (
                            <div className="thumbnail-preview-container">
                                <img src={imageUrl} alt="Thumbnail preview" className="thumbnail-preview" />
                                <button
                                    type="button"
                                    className="remove-thumbnail-btn"
                                    onClick={() => setImageUrl('')}
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="thumbnail-upload-btn"
                                onClick={() => thumbnailInputRef.current?.click()}
                                disabled={thumbnailUploading}
                            >
                                {thumbnailUploading ? (
                                    <div className="spinner-sm" />
                                ) : (
                                    <>
                                        <span>+</span>
                                        <p>Upload Thumbnail</p>
                                    </>
                                )}
                            </button>
                        )}
                        <input
                            type="file"
                            ref={thumbnailInputRef}
                            onChange={handleThumbnailUpload}
                            accept="image/*"
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label htmlFor="post-title">Title</label>
                    <input
                        id="post-title"
                        type="text"
                        className="form-input"
                        placeholder="What's on your mind?"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        maxLength={200}
                        required
                    />
                    <span className="char-count">{title.length}/200</span>
                </div>

                <div className="form-group">
                    <label htmlFor="post-content">Content</label>
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
                            value={content}
                            onChange={setContent}
                            modules={modules}
                            formats={editorFormats}
                            className="rich-editor"
                            placeholder="Share your story, ask a question, or promote your startup..."
                        />
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                            accept="image/*"
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>

                {extractedUrls.length > 0 && (
                    <div className="form-group">
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Link Preview(s)</label>
                        {extractedUrls.map(url => (
                            <LinkPreview url={url} key={url} />
                        ))}
                    </div>
                )}

                <div className="form-group">
                    <label htmlFor="post-video">Video Link (Optional)</label>
                    <div className="relative" style={{ position: 'relative' }}>
                        <LinkIcon size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }} />
                        <input
                            id="post-video"
                            type="url"
                            className="form-input"
                            style={{ paddingLeft: '36px' }}
                            placeholder="https://youtube.com/..."
                            value={videoUrl}
                            onChange={e => setVideoUrl(e.target.value)}
                            maxLength={500}
                        />
                    </div>
                </div>

                <div className="form-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading || imageUploading || thumbnailUploading} id="submit-post-btn">
                        {loading ? (isEditing ? 'Saving...' : 'Publishing...') : (
                            (imageUploading || thumbnailUploading) ? 'Uploading Image...' : (isEditing ? <><Save size={18} className="inline mr-1" /> Save Changes</> : <><Rocket size={18} className="inline mr-1" /> Publish Post</>)
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
