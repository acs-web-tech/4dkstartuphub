import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { postsApi, usersApi } from '../../services/api';
import { Comment } from '../../types';
import { Lock, X, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import CommentItem from './CommentItem';
import LinkPreview from '../Common/LinkPreview';
import { useModal } from '../../context/ModalContext';
import { getCdnUrl } from '../../utils/cdn';

interface CommentsSectionProps {
    postId: string;
    isLocked: boolean | undefined;
    initialComments: Comment[];
    totalServerCount?: number;
}

export default function CommentsSection({ postId, isLocked, initialComments, totalServerCount }: CommentsSectionProps) {
    const { user } = useAuth();
    const { socket } = useSocket();
    const { alert } = useModal();
    const [comments, setComments] = useState<Comment[]>(initialComments);
    const [newComment, setNewComment] = useState('');
    const [commenting, setCommenting] = useState(false);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialComments.length >= 10);
    const [loadingMore, setLoadingMore] = useState(false);

    // Reply state
    const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

    // Collapse state for the comment section
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Expanded replies: track which parent IDs have their replies expanded
    const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

    // @mention autocomplete state
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const [mentionUsers, setMentionUsers] = useState<Array<{ id: string; username: string; displayName: string; avatarUrl: string }>>([]);
    const [mentionCursorPos, setMentionCursorPos] = useState(0);
    const commentInputRef = useRef<HTMLTextAreaElement>(null);
    const observerTarget = useRef<HTMLDivElement>(null);

    // Update comments when initialComments changes
    useEffect(() => {
        setComments(initialComments);
        setHasMore(initialComments.length >= 10);
        setPage(1);
    }, [initialComments]);

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loadingMore) {
                    loadMoreComments();
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [hasMore, loadingMore, page]);

    const loadMoreComments = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const nextPage = page + 1;
            const res = await postsApi.getComments(postId, { page: nextPage, limit: 10 });
            if (res.comments.length > 0) {
                setComments(prev => {
                    const existingIds = new Set(prev.map(c => c.id));
                    const filtered = res.comments.filter(c => !existingIds.has(c.id));
                    return [...prev, ...filtered];
                });
                setPage(nextPage);
                setHasMore(res.pagination.page < res.pagination.totalPages);
            } else {
                setHasMore(false);
            }
        } catch (err) {
            console.error('Error loading more comments:', err);
        } finally {
            setLoadingMore(false);
        }
    };

    // Extract URLs for live link preview
    useEffect(() => {
        const unique = new Set<string>();
        const regex = /https?:\/\/[^\s]+/g;
        let match;
        while ((match = regex.exec(newComment)) !== null) {
            unique.add(match[0]);
        }
        setPreviewUrls(Array.from(unique).slice(0, 2));
    }, [newComment]);

    // Socket listener for new comments
    useEffect(() => {
        if (socket && postId) {
            const handleNewComment = (comment: Comment) => {
                setComments(prev => {
                    const optimisticIndex = prev.findIndex(c =>
                        c.id.toString().startsWith('temp-') &&
                        c.content === comment.content &&
                        c.userId === comment.userId
                    );
                    if (optimisticIndex !== -1) {
                        const newComments = [...prev];
                        newComments[optimisticIndex] = comment;
                        return newComments;
                    }
                    if (prev.find(c => c.id === comment.id)) return prev;
                    return [...prev, comment];
                });

                // Auto-expand replies when a new reply comes in for a parent
                if (comment.parentId) {
                    setExpandedReplies(prev => {
                        const next = new Set(prev);
                        next.add(comment.parentId!);
                        return next;
                    });
                }
            };
            socket.on('newComment', handleNewComment);
            return () => { socket.off('newComment', handleNewComment); };
        }
    }, [socket, postId]);

    const handleReply = (comment: Comment) => {
        setReplyingTo(comment);
        setNewComment(`@${comment.username} `);
        setIsCollapsed(false);
        setTimeout(() => {
            commentInputRef.current?.focus();
            const len = `@${comment.username} `.length;
            commentInputRef.current?.setSelectionRange(len, len);
        }, 50);
    };

    const cancelReply = () => {
        setReplyingTo(null);
        setNewComment('');
    };

    const handleComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !postId || !newComment.trim()) return;

        const content = newComment.trim();
        const tempId = `temp-${Date.now()}`;
        const parentId = replyingTo?.id || null;

        const optimisticComment: Comment = {
            id: tempId,
            postId: postId,
            userId: user.id,
            content: content,
            parentId: parentId,
            parentDisplayName: replyingTo?.displayName,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl || '',
            username: user.username,
            createdAt: new Date().toISOString()
        };

        setComments(prev => [...prev, optimisticComment]);
        setNewComment('');
        setPreviewUrls([]);
        setShowMentionDropdown(false);

        // Auto-expand replies for the parent we just replied to
        if (parentId) {
            setExpandedReplies(prev => {
                const next = new Set(prev);
                next.add(parentId);
                return next;
            });
        }

        setReplyingTo(null);
        setCommenting(true);

        try {
            await postsApi.comment(postId, { content, parentId: parentId || undefined });
        } catch (err) {
            setComments(prev => prev.filter(c => c.id !== tempId));
            await alert('Failed to post comment. Please try again.');
            setNewComment(content);
            if (parentId && replyingTo) setReplyingTo(replyingTo);
        }
        setCommenting(false);
    };

    // @mention autocomplete logic
    useEffect(() => {
        const handleMentionInput = async () => {
            const text = newComment;
            const cursorPos = commentInputRef.current?.selectionStart || 0;
            const textBeforeCursor = text.substring(0, cursorPos);
            const lastAtIndex = textBeforeCursor.lastIndexOf('@');

            if (lastAtIndex !== -1) {
                const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
                if (!/\s/.test(textAfterAt)) {
                    setMentionSearch(textAfterAt);
                    setMentionCursorPos(lastAtIndex);
                    try {
                        const { users } = await usersApi.getAll({ search: textAfterAt });
                        setMentionUsers(users.slice(0, 5).map(u => ({
                            id: u.id,
                            username: u.username,
                            displayName: u.displayName,
                            avatarUrl: u.avatarUrl || ''
                        })));
                        setShowMentionDropdown(true);
                    } catch {
                        setShowMentionDropdown(false);
                    }
                    return;
                }
            }
            setShowMentionDropdown(false);
        };
        handleMentionInput();
    }, [newComment]);

    const handleMentionSelect = (username: string) => {
        const textBefore = newComment.substring(0, mentionCursorPos);
        const textAfter = newComment.substring(commentInputRef.current?.selectionStart || newComment.length);
        setNewComment(`${textBefore}@${username} ${textAfter}`);
        setShowMentionDropdown(false);
        setMentionSearch('');
        setTimeout(() => {
            commentInputRef.current?.focus();
            const newPos = mentionCursorPos + username.length + 2;
            commentInputRef.current?.setSelectionRange(newPos, newPos);
        }, 0);
    };

    // ─── Threaded comments: group replies under parents ───
    const threadedComments = useMemo(() => {
        // Build a map of parentId -> replies
        const replyMap = new Map<string, Comment[]>();
        const topLevel: Comment[] = [];

        for (const c of comments) {
            if (c.parentId) {
                const existing = replyMap.get(c.parentId) || [];
                existing.push(c);
                replyMap.set(c.parentId, existing);
            } else {
                topLevel.push(c);
            }
        }

        // Helper to count ALL descendants recursively
        const countDescendants = (parentId: string): number => {
            const children = replyMap.get(parentId) || [];
            let count = children.length;
            for (const child of children) {
                count += countDescendants(child.id);
            }
            return count;
        };

        // Helper to flatten ALL descendants recursively
        const flattenDescendants = (parentId: string, topLevelId: string, resultArr: any[]) => {
            const children = replyMap.get(parentId) || [];
            // Sort children earliest first if needed, usually they are appended in order
            for (const child of children) {
                resultArr.push({ comment: child, isReply: true, parentId: topLevelId });
                flattenDescendants(child.id, topLevelId, resultArr);
            }
        };

        // Build structured result
        const result: { comment: Comment; isReply: boolean; parentId?: string; replyCount?: number }[] = [];
        for (const parent of topLevel) {
            const replyCount = parent.replyCount ?? countDescendants(parent.id);
            result.push({ comment: parent, isReply: false, replyCount });

            if (expandedReplies.has(parent.id)) {
                flattenDescendants(parent.id, parent.id, result);
            }
        }

        const topLevelIds = new Set(topLevel.map(p => p.id));

        // Also add any orphan replies whose parents were not loaded yet
        const resultIds = new Set(result.map(r => r.comment.id));
        for (const c of comments) {
            if (!resultIds.has(c.id)) {
                let current = c;
                let isCollapsedDescendant = false;
                
                let safety = 0;
                while (current.parentId && safety < 10) {
                    if (topLevelIds.has(current.parentId)) {
                        isCollapsedDescendant = true;
                        break;
                    }
                    const nextParent = comments.find(p => p.id === current.parentId);
                    if (!nextParent) break;
                    current = nextParent;
                    safety++;
                }

                if (isCollapsedDescendant) {
                    continue;
                }
                
                result.push({ comment: c, isReply: !!c.parentId });
            }
        }

        return result;
    }, [comments, expandedReplies]);

    const toggleReplies = (parentId: string) => {
        setExpandedReplies(prev => {
            const next = new Set(prev);
            if (next.has(parentId)) {
                next.delete(parentId);
            } else {
                next.add(parentId);
            }
            return next;
        });
    };

    const totalCount = totalServerCount ?? comments.length;

    return (
        <section className="card comments-section">
            <div className="comments-section-header">
                <button
                    className="comments-collapse-toggle"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    type="button"
                >
                    <MessageSquare size={18} />
                    <h2>Comments ({totalCount})</h2>
                    {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>

            </div>

            {!isCollapsed && (
                <>


                    {user && !isLocked && (
                        <form className="comment-form" onSubmit={handleComment} style={{ position: 'relative' }}>
                            {replyingTo && (
                                <div className="comment-replying-banner">
                                    <span>Replying to <strong>{replyingTo.displayName}</strong></span>
                                    <button type="button" className="cancel-reply-btn" onClick={cancelReply}>
                                        <X size={14} /> Cancel
                                    </button>
                                </div>
                            )}
                            <textarea
                                ref={commentInputRef}
                                className="form-input"
                                placeholder={replyingTo ? `Reply to ${replyingTo.displayName}...` : 'Write a comment... (use @ to mention users)'}
                                value={newComment}
                                onChange={e => setNewComment(e.target.value)}
                                maxLength={2000}
                                rows={3}
                                id="comment-input"
                            />

                            {/* @mention dropdown */}
                            {showMentionDropdown && mentionUsers.length > 0 && (
                                <div className="mention-dropdown">
                                    {mentionUsers.map(u => (
                                        <div
                                            key={u.id}
                                            className="mention-item"
                                            onClick={() => handleMentionSelect(u.username)}
                                        >
                                            <div className="mention-avatar">
                                                {u.avatarUrl
                                                    ? <img src={getCdnUrl(u.avatarUrl)} alt={u.displayName} />
                                                    : <span>{u.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</span>
                                                }
                                            </div>
                                            <div className="mention-info">
                                                <strong>{u.displayName}</strong>
                                                <span>@{u.username}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Live link preview */}
                            {previewUrls.map(url => (
                                <LinkPreview key={url} url={url} compact />
                            ))}

                            <button
                                type="submit"
                                className="btn btn-primary btn-sm"
                                disabled={commenting || !newComment.trim()}
                                id="submit-comment"
                            >
                                {commenting ? 'Posting...' : (replyingTo ? 'Reply' : 'Post Comment')}
                            </button>
                        </form>
                    )}

                    {!!isLocked && (
                        <div className="alert alert-info"><Lock size={16} className="inline mr-1" /> Comments are locked on this post</div>
                    )}

                    {threadedComments.length === 0 ? (
                        <p className="empty-comments">No comments yet. Be the first to comment!</p>
                    ) : (
                        <div className="comments-list">
                            {threadedComments.map(({ comment, isReply: isReplyItem, replyCount }) => (
                                <div key={comment.id}>
                                    <CommentItem
                                        comment={comment}
                                        isReply={isReplyItem}
                                        onReply={user ? handleReply : undefined}
                                        isLocked={!!isLocked}
                                    />
                                    {/* Show "View N replies" button for parents with collapsed replies */}
                                    {!isReplyItem && typeof replyCount === 'number' && replyCount > 0 && (
                                        <button
                                            className="view-replies-btn"
                                            onClick={() => toggleReplies(comment.id)}
                                            type="button"
                                        >
                                            {expandedReplies.has(comment.id) ? (
                                                <><ChevronUp size={14} /> Hide {replyCount} {replyCount === 1 ? 'reply' : 'replies'}</>
                                            ) : (
                                                <><ChevronDown size={14} /> View {replyCount} {replyCount === 1 ? 'reply' : 'replies'}</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            ))}
                            <div ref={observerTarget} style={{ height: '10px' }} />
                            {loadingMore && <div className="loading-spinner-small" style={{ margin: '1rem auto' }} />}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
