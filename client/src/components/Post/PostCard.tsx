import { memo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Post } from '../../types';
import { CATEGORY_CONFIG } from '../../config';
import { Pin, Heart, MessageSquare, Eye, Video, MoreVertical, Calendar, Download, ArrowRight } from 'lucide-react';
import { SmartImage } from '../Common/SmartImage';
import { rewriteContentUrls } from '../../utils/cdn';
import LinkPreview from '../Common/LinkPreview';

interface Props {
    post: Post;
    onImageClick?: (url: string) => void;
    /** If true, images in this card load eagerly (above-the-fold) */
    priority?: boolean;
}

function PostCard({ post, onImageClick, priority = false }: Props) {
    const location = useLocation();
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

    const buildCalendarDesc = (forIcs = false) => {
        let raw = post.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 400);
        if (raw.length === 400) raw += '...';
        let n = forIcs ? '\\n' : '\n';
        let desc = `Event: ${post.title}${n}Hosted by: ${post.displayName}${n}${n}Details:${n}${raw}${n}${n}`;
        if (post.imageUrl) {
            const imgUrl = post.imageUrl.startsWith('/') ? `${window.location.origin}${post.imageUrl}` : post.imageUrl;
            desc += `Thumbnail Image: ${imgUrl}${n}${n}`;
        }
        desc += `View Post: ${window.location.origin}/posts/${post.id}`;
        return forIcs ? desc.replace(/,/g, '\\,') : desc;
    };

    const getGoogleCalendarUrl = () => {
        if (!post.eventDate) return '';
        const start = new Date(post.eventDate).toISOString().replace(/-|:|\.\d+/g, '');
        const end = new Date(new Date(post.eventDate).getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');
        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(post.title)}&dates=${start}/${end}&details=${encodeURIComponent(buildCalendarDesc(false))}&location=${encodeURIComponent(`${window.location.origin}/posts/${post.id}`)}`;
    };

    const downloadIcs = () => {
        if (!post.eventDate) return;
        const date = new Date(post.eventDate).toISOString().replace(/-|:|\.\d+/g, '');
        const end = new Date(new Date(post.eventDate).getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');
        
        let icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            `DTSTART:${date}`,
            `DTEND:${end}`,
            `SUMMARY:${post.title}`,
            `DESCRIPTION:${buildCalendarDesc(true)}`,
            `LOCATION:${window.location.origin}/posts/${post.id}`
        ];

        if (post.imageUrl) {
            const imgUrl = post.imageUrl.startsWith('/') ? `${window.location.origin}${post.imageUrl}` : post.imageUrl;
            icsContent.push(`ATTACH;VALUE=URI:${imgUrl}`);
        }

        icsContent.push('END:VEVENT', 'END:VCALENDAR');

        const icsString = icsContent.join('\n');
        const filename = `${post.title.replace(/\s+/g, '_').slice(0, 20)}.ics`;

        // 1. Mobile Native Calendar App Share (iOS/Android)
        if (navigator.share && navigator.canShare) {
            const file = new File([icsString], filename, { type: 'text/calendar' });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: post.title,
                }).catch(() => {
                    // Fallback if user cancels or share fails
                });
                return; // Stop here, native share popup handled it!
            }
        }

        // 2. Desktop Fallback (Classic Download)
        const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.target = "_blank"; // Fixes iOS webview intercept issues
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
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
                                priority={priority}
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
                            {/* Freelancer Badge */}
                            {post.userType === 'freelancer' && (
                                <span className="freelancer-badge">
                                    🛠 Freelancer
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

            <Link to={`/posts/${post.id}`} state={{ background: location }} className="post-title-link">
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
                        {new Date(post.eventDate).toLocaleDateString('en-GB')} at{' '}
                        {new Date(post.eventDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            )}


            {/* ── Media Row: Smart Image Selection ── */}
            {(() => {
                // 1. Determine priority image source
                // Priority: Explicit Cover -> Video -> Content First Image

                const getContentImage = (html: string) => {
                    const match = html.match(/<img[^>]+src="([^">]+)"/);
                    return match ? match[1] : null;
                };

                const contentImage = getContentImage(post.content);
                const hasExplicitCover = !!post.imageUrl;
                const hasVideo = !!post.videoUrl;

                // If no explicit media, try to use content image
                const displayImage = hasExplicitCover ? post.imageUrl : (!hasVideo ? contentImage : null);

                // Helper to check video embeds
                const getEmbedUrl = (url: string) => {
                    try {
                        const u = new URL(url);
                        if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
                            const id = u.hostname.includes('youtu.be') ? u.pathname.slice(1).split('?')[0] : u.searchParams.get('v');
                            return id ? `https://www.youtube.com/embed/${id}` : null;
                        }
                        if (u.hostname.includes('vimeo.com')) {
                            const id = u.pathname.split('/').filter(Boolean).pop();
                            return id ? `https://player.vimeo.com/video/${id}` : null;
                        }
                        return null;
                    } catch { return null; }
                };

                const embedUrl = post.videoUrl ? getEmbedUrl(post.videoUrl) : null;
                const showMediaRow = !!displayImage || !!post.videoUrl;

                if (!showMediaRow) return null;

                return (
                    <div className={`post-card-media-row${(displayImage && post.videoUrl) ? ' has-both' : ''}`}>
                        {displayImage && (
                            <div
                                className="post-card-media-thumb cursor-pointer"
                                onClick={() => onImageClick?.(displayImage!)}
                                title="Click to enlarge"
                            >
                                <SmartImage src={displayImage} alt={post.title} priority={priority} objectFit="contain" />
                            </div>
                        )}
                        {post.videoUrl && (
                            embedUrl ? (
                                <div className="post-card-media-video">
                                    <iframe
                                        src={embedUrl}
                                        title="Video"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure"
                                        allowFullScreen
                                        loading="lazy"
                                    />
                                </div>
                            ) : (
                                <a
                                    href={post.videoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="post-card-video-link"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <Video size={16} /> Watch Video
                                </a>
                            )
                        )}
                    </div>
                );
            })()}

            {(() => {
                const extractUrls = (html: string) => {
                    const unique = new Set<string>();
                    const regex = /(?:href="|src=")?(https?:\/\/[^\s<"]+)/g;
                    let match;
                    while ((match = regex.exec(html)) !== null) {
                        if (match[0].startsWith('src=')) continue;
                        unique.add(match[1]);
                    }
                    return Array.from(unique);
                };

                const urls = extractUrls(post.content);
                let displayContent = post.content;

                // 2. If we promoted a content image, strip it from text to avoid duplicate
                const contentImageMatch = post.content.match(/<img[^>]+src="([^">]+)"/);
                const contentImage = contentImageMatch ? contentImageMatch[1] : null;

                // Check if we used this image as cover (re-derive logic or check prop?)
                // Accessing 'displayImage' from above scope is hard in this block.
                // Re-evaluate logic:
                const hasExplicitCover = !!post.imageUrl;
                const hasVideo = !!post.videoUrl;
                const usedContentImageAsCover = !hasExplicitCover && !hasVideo && !!contentImage;

                if (usedContentImageAsCover && contentImageMatch) {
                    displayContent = displayContent.replace(contentImageMatch[0], '');
                }

                // 3. Strip URLs robustly
                urls.forEach(url => {
                    try {
                        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`(href=["']|src=["'])?(${escaped})`, 'g');
                        displayContent = displayContent.replace(regex, (match, prefix) => {
                            if (prefix) return match;
                            return '';
                        });
                    } catch (e) { }
                });

                // Clean up empty paragraphs
                displayContent = displayContent
                    .replace(/<a[^>]*>\s*<\/a>/g, '')
                    .replace(/<p>\s*<\/p>/g, '')
                    .replace(/<p><br><\/p>/g, '')
                    .trim();

                const hasContent = displayContent.length > 0 && displayContent !== '<p></p>';

                return (
                    <>
                        {hasContent && (
                            <div
                                className="post-content-full ql-editor"
                                dangerouslySetInnerHTML={{ __html: rewriteContentUrls(displayContent) }}
                                onClick={handleContentClick}
                            />
                        )}
                        {urls.slice(0, 1).map((url, i) => (
                            <LinkPreview
                                key={url}
                                url={url}
                                initialData={i === 0 ? post.linkPreview : null}
                            />
                        ))}
                    </>
                );
            })()}

            <div className="post-card-footer">
                <div className="post-stats-group">
                    <Link to={`/posts/${post.id}`} state={{ background: location }} className={`stat-item${post.likeCount ? ' has-value' : ''}`}><Heart size={16} /> <span>{post.likeCount || '0'}</span></Link>
                    <Link to={`/posts/${post.id}`} state={{ background: location }} className={`stat-item${post.commentCount ? ' has-value' : ''}`}><MessageSquare size={16} /> <span>{post.commentCount || '0'}</span></Link>
                    <span className={`stat-item${post.viewCount ? ' has-value' : ''}`}><Eye size={16} /> <span>{post.viewCount || '0'}</span></span>
                </div>
                <div className="post-actions-right">
                    <Link to={`/posts/${post.id}`} state={{ background: location }} className="btn-read-more">
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
    return date.toLocaleDateString('en-GB');
};
