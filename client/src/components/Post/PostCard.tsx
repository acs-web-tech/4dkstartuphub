
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Post } from '../../types';
import { CATEGORY_CONFIG } from '../../config';
import { Pin, Heart, MessageSquare, Eye, Video } from 'lucide-react';
import { SmartImage } from '../Common/SmartImage';

interface Props {
    post: Post;
}

function PostCard({ post }: Props) {
    const cat = CATEGORY_CONFIG[post.category];
    const Icon = cat.icon;

    // Parse date correctly for UTC
    let postDate = new Date(post.createdAt);
    if (!post.createdAt.endsWith('Z') && !post.createdAt.includes('+')) {
        postDate = new Date(post.createdAt + 'Z');
    }

    const timeAgo = getTimeAgo(postDate);
    const initials = post.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const isNew = (Date.now() - postDate.getTime() < 5000);

    return (
        <article className={`post-card${isNew ? ' realtime-new' : ''}`} id={`post-${post.id}`}>
            <div className="post-card-corner">
                {!!post.isPinned && <span className="pinned-tag" title="Pinned Post"><Pin size={14} /></span>}
            </div>

            <div className="post-card-header">
                <Link to={`/users/${post.userId}`} className="post-author-link">
                    <div className="post-avatar">
                        {post.avatarUrl ? (
                            <SmartImage
                                src={post.avatarUrl}
                                alt={post.displayName}
                            />
                        ) : (
                            <span>{initials}</span>
                        )}
                    </div>
                    <div className="post-meta">
                        <span className="post-author">{post.displayName}</span>
                        <span className="post-time">{timeAgo}</span>
                    </div>
                </Link>
                <Link to={`/feed?category=${post.category}`} className="post-category-tag" style={{ '--cat-color': cat.color } as any}>
                    <Icon size={14} />
                    <span>{cat.label}</span>
                </Link>
            </div>

            <Link to={`/posts/${post.id}`} className="post-title-link">
                <h3 className="post-title">{post.title}</h3>
            </Link>

            {post.imageUrl && (
                <div className="post-card-image">
                    <SmartImage src={post.imageUrl} alt={post.title} />
                </div>
            )}

            <div
                className="post-content-full ql-editor"
                dangerouslySetInnerHTML={{ __html: post.content }}
            />

            <div className="post-card-footer">
                <div className="post-stats-group">
                    <Link to={`/posts/${post.id}`} className={`stat-item${post.likeCount ? ' has-value' : ''}`}><Heart size={16} /> <span>{post.likeCount || '0'}</span></Link>
                    <Link to={`/posts/${post.id}`} className={`stat-item${post.commentCount ? ' has-value' : ''}`}><MessageSquare size={16} /> <span>{post.commentCount || '0'}</span></Link>
                    <span className={`stat-item${post.viewCount ? ' has-value' : ''}`}><Eye size={16} /> <span>{post.viewCount || '0'}</span></span>
                </div>
                <div className="post-actions-right">
                    {post.videoUrl && <div className="post-video-tag"><Video size={14} /> <span>Review</span></div>}
                    <Link to={`/posts/${post.id}`} className="btn-open-discussion">
                        <MessageSquare size={14} className="mr-1" /> Open Discussion
                    </Link>
                </div>
            </div>
        </article>
    );
}

export default memo(PostCard);

const getTimeAgo = (date: Date): string => {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
};
