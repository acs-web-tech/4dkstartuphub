
import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Post } from '../../types';
import { CATEGORY_CONFIG } from '../../config';
import { Pin, Heart, MessageSquare, Eye, Video, MoreVertical, Calendar, Download, ArrowRight } from 'lucide-react';
import { SmartImage } from '../Common/SmartImage';
import LinkPreview from '../Common/LinkPreview';

interface Props {
    post: Post;
    onImageClick?: (url: string) => void;
}

function PostCard({ post, onImageClick }: Props) {
    const [showOptions, setShowOptions] = useState(false);
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

    const handleContentClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'IMG' && onImageClick) {
            onImageClick((target as HTMLImageElement).src);
        }
    };

    const getGoogleCalendarUrl = () => {
        if (!post.eventDate) return '';
        const start = new Date(post.eventDate).toISOString().replace(/-|:|\.\d+/g, '');
        const end = new Date(new Date(post.eventDate).getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');
        const details = post.content.replace(/<[^>]*>/g, '').slice(0, 500);
        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(post.title)}&dates=${start}/${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(`${window.location.origin}/posts/${post.id}`)}`;
    };

    const downloadIcs = () => {
        if (!post.eventDate) return;
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
            `LOCATION:${window.location.origin}/posts/${post.id}`,
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
                        {/* Start Online Indicator */}
                        {post.userIsOnline && <span className="online-indicator-dot"></span>}
                    </div>
                    <div className="post-meta">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="post-author">
                                {post.displayName}
                            </span>
                            {/* Investor Badge */}
                            {post.userType === 'investor' && (
                                <span className="investor-badge">
                                    💰 Investor
                                </span>
                            )}
                            {/* Regular Poster Badge */}
                            {(post.userPostCount || 0) > 5 && post.userType !== 'investor' && (
                                <span className="regular-badge">
                                    Regular
                                </span>
                            )}
                        </div>
                        <span className="post-time">{timeAgo}</span>
                    </div>
                </Link>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                    <Link to={`/feed?category=${post.category}`} className="post-category-tag" style={{ '--cat-color': cat.color, marginLeft: 0 } as any}>
                        <Icon size={14} />
                        <span>{cat.label}</span>
                    </Link>

                    {post.eventDate && (
                        <div className="relative">
                            <button
                                className="post-options-btn"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setShowOptions(!showOptions);
                                }}
                            >
                                <MoreVertical size={16} />
                            </button>
                            {showOptions && (
                                <div className="dropdown-menu show right-0 top-full mt-1 w-48 z-10" style={{ position: 'absolute' }}>
                                    <a href={getGoogleCalendarUrl()} target="_blank" rel="noopener noreferrer" className="dropdown-item flex items-center gap-2" onClick={() => setShowOptions(false)}>
                                        <Calendar size={14} /> Google Calendar
                                    </a>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            downloadIcs();
                                            setShowOptions(false);
                                        }}
                                        className="dropdown-item flex items-center gap-2 w-full text-left"
                                    >
                                        <Download size={14} /> Download .ics
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Link to={`/posts/${post.id}`} className="post-title-link">
                <h3 className="post-title">{post.title}</h3>
            </Link>

            {post.eventDate && (
                <div
                    className="post-card-event-info cursor-pointer hover:bg-[var(--bg-secondary)]"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowOptions(!showOptions);
                    }}
                    title="Click to see calendar options"
                >
                    <Calendar size={14} className="text-accent" />
                    <span>
                        {new Date(post.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at{' '}
                        {new Date(post.eventDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            )}

            {post.imageUrl && (
                <div
                    className="post-card-image cursor-pointer"
                    onClick={() => onImageClick?.(post.imageUrl!)}
                    title="Click to enlarge"
                >
                    <SmartImage src={post.imageUrl} alt={post.title} />
                </div>
            )}

            {(() => {
                const match = post.content.match(/href="(https?:\/\/[^"]+)"/) || post.content.match(/(https?:\/\/[^\s<]+)/);
                const url = match ? match[1] : null;

                let displayContent = post.content;
                if (url) {
                    try {
                        // Remove the anchor tag containing the URL to avoid double display
                        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        // Logic: Remove <a ... href="url" ...>...</a>
                        const anchorRegex = new RegExp(`<a[^>]*href="${escapedUrl}"[^>]*>.*?</a>`, 'gi');
                        displayContent = displayContent.replace(anchorRegex, '');

                        // Clean up empty paragraphs <p><br></p> or <p></p> left behind
                        displayContent = displayContent.replace(/<p>\s*<\/p>/g, '').replace(/<p><br><\/p>/g, '');
                    } catch (e) {
                        console.error('Error stripping URL from content:', e);
                    }
                }

                return (
                    <>
                        <div
                            className="post-content-full ql-editor"
                            dangerouslySetInnerHTML={{ __html: displayContent }}
                            onClick={handleContentClick}
                        />
                        {url && <LinkPreview url={url} />}
                    </>
                );
            })()}

            <div className="post-card-footer">
                <div className="post-stats-group">
                    <Link to={`/posts/${post.id}`} className={`stat-item${post.likeCount ? ' has-value' : ''}`}><Heart size={16} /> <span>{post.likeCount || '0'}</span></Link>
                    <Link to={`/posts/${post.id}`} className={`stat-item${post.commentCount ? ' has-value' : ''}`}><MessageSquare size={16} /> <span>{post.commentCount || '0'}</span></Link>
                    <span className={`stat-item${post.viewCount ? ' has-value' : ''}`}><Eye size={16} /> <span>{post.viewCount || '0'}</span></span>
                </div>
                <div className="post-actions-right">
                    {post.videoUrl && <div className="post-video-tag"><Video size={14} /> <span>Review</span></div>}
                    <Link to={`/posts/${post.id}`} className="btn-read-more">
                        Read More <ArrowRight size={14} />
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
