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
            const res = await postsApi.getComments(postId, { page: nextPage, limit: 10, parentId: 'null' });
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

    // Helper to find the top level parent id string
    const getTopLevelId = (commentsList: Comment[], pId: string): string => {
        const p = commentsList.find(c => c.id === pId);
        if (p && p.parentId) return getTopLevelId(commentsList, p.parentId);
        return pId;
    };

    const [localTotalCount, setLocalTotalCount] = useState(totalServerCount ?? 0);

    // Update localTotalCount when initialComments change
    useEffect(() => {
        if (totalServerCount !== undefined) {
            setLocalTotalCount(totalServerCount);
        } else {
            setLocalTotalCount(initialComments.length);
        }
    }, [totalServerCount, initialComments]);

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
                    
                    // Since it wasn't optimistic, it's a completely new comment from someone else
                    // (or we missed the optimistic due to render timing), safely increment our grand total
                    setLocalTotalCount(curr => curr + 1);

                    const newComments = [...prev, comment];
                    if (comment.parentId) {
                        const topLevelId = getTopLevelId(newComments, comment.parentId);
                        const parentIdx = newComments.findIndex(c => c.id === topLevelId);
                        if (parentIdx !== -1) {
                            newComments[parentIdx] = {
                                ...newComments[parentIdx],
                                replyCount: (newComments[parentIdx].replyCount || 0) + 1
                            };
                        }
                    }
                    return newComments;
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

        // Optimistically bump the total count immediately
        setLocalTotalCount(curr => curr + 1);

        setComments(prev => {
            const newComments = [...prev, optimisticComment];
             if (parentId) {
                 const topLevelId = getTopLevelId(newComments, parentId);
                 const topLevelIdx = newComments.findIndex(c => c.id === topLevelId);
                 if (topLevelIdx !== -1) {
                     newComments[topLevelIdx] = { 
                         ...newComments[topLevelIdx], 
                         replyCount: (newComments[topLevelIdx].replyCount || 0) + 1 
                     };
                 }
             }
             return newComments;
        });
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
            setLocalTotalCount(curr => Math.max(0, curr - 1)); // Decrement if failed
            setComments(prev => {
                const newComments = prev.filter(c => c.id !== tempId);
                if (parentId) {
                    const topLevelId = getTopLevelId(newComments, parentId);
                    const topLevelIdx = newComments.findIndex(c => c.id === topLevelId);
                    if (topLevelIdx !== -1) {
                        newComments[topLevelIdx] = { 
                            ...newComments[topLevelIdx], 
                            replyCount: Math.max(0, (newComments[topLevelIdx].replyCount || 0) - 1) 
                        };
                    }
                }
                return newComments;
            });
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

    // ─── Threaded comments: flat layout without aggressive filtering ───
    const threadedComments = useMemo(() => {
        const topLevel: Comment[] = [];
        const replies: Comment[] = [];

        // 1. Separate top-level and replies
        for (const c of comments) {
            if (!c.parentId) {
                topLevel.push(c);
            } else {
                replies.push(c);
            }
        }

        // 2. Build a reliable lookup to trace top-level parents for ANY descendant
        const getTopParentId = (startId: string): string => {
            let currentId = startId;
            let safety = 0;
            while (safety < 20) {
                const c = comments.find(x => x.id === currentId);
                if (!c || !c.parentId) break; // Reached top-level or dead end
                currentId = c.parentId;
                safety++;
            }
            return currentId;
        };

        // 3. Group replies by their absolute discovered top-level parent
        const groupedReplies = new Map<string, Comment[]>();
        for (const r of replies) {
            const topId = getTopParentId(r.id);
            const group = groupedReplies.get(topId) || [];
            group.push(r);
            groupedReplies.set(topId, group);
        }

        // 4. Construct final layout
        const result: { comment: Comment; isReply: boolean; parentId?: string; replyCount?: number }[] = [];
        
        // Put all valid top-level comments first, with their children if expanded
        for (const parent of topLevel) {
            const threadReplies = groupedReplies.get(parent.id) || [];
            // Use the backend's explicit replyCount, or fallback to the localized quantity
            const replyCount = parent.replyCount ?? threadReplies.length;
            
            result.push({ comment: parent, isReply: false, replyCount });

            // If expanded, just blast all associated replies underneath, completely flat.
            if (expandedReplies.has(parent.id)) {
                // Sort chronologically
                threadReplies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                for (const tr of threadReplies) {
                    result.push({ comment: tr, isReply: true, parentId: parent.id });
                }
            }
            // Remove from map to indicate they've been placed
            groupedReplies.delete(parent.id);
        }

        // 5. Place any completely orphaned replies (topId wasn't in topLevel array)
        // This prevents hiding ANY database records from the UI.
        for (const [topId, threadReplies] of Array.from(groupedReplies.entries())) {
            threadReplies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            for (const tr of threadReplies) {
                result.push({ comment: tr, isReply: true, parentId: topId });
            }
        }

        return result;
    }, [comments, expandedReplies]);

    const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());

    const toggleReplies = async (parentId: string) => {
        setExpandedReplies(prev => {
            const next = new Set(prev);
            if (next.has(parentId)) {
                next.delete(parentId);
            } else {
                next.add(parentId);
            }
            return next;
        });

        // If we are expanding, fetch the replies if not already fully loaded
        if (!expandedReplies.has(parentId)) {
            // Check if we already have some replies loaded (we could be more accurate, but fetching 100 replies is small)
            setLoadingReplies(prev => new Set(prev).add(parentId));
            try {
                const res = await postsApi.getComments(postId, { limit: 100, parentId });
                if (res.comments.length > 0) {
                    setComments(prev => {
                        const existingIds = new Set(prev.map(c => c.id));
                        const filtered = res.comments.filter(c => !existingIds.has(c.id));
                        return [...prev, ...filtered];
                    });
                }
            } catch (err) {
                console.error('Error fetching replies:', err);
            } finally {
                setLoadingReplies(prev => {
                    const next = new Set(prev);
                    next.delete(parentId);
                    return next;
                });
            }
        }
    };

    return (
        <section className="card comments-section">
            <div className="comments-section-header">
                <button
                    className="comments-collapse-toggle"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    type="button"
                >
                    <MessageSquare size={18} />
                    <h2>Comments ({localTotalCount})</h2>
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
                                        onReply={user && !isReplyItem && !comment.id.startsWith('temp-') ? handleReply : undefined}
                                        isLocked={!!isLocked}
                                    />
                                    {/* Show "View N replies" button for parents with collapsed replies */}
                                    {!isReplyItem && typeof replyCount === 'number' && replyCount > 0 && (
                                        <button
                                            className="view-replies-btn"
                                            onClick={() => toggleReplies(comment.id)}
                                            type="button"
                                            disabled={loadingReplies.has(comment.id)}
                                        >
                                            {loadingReplies.has(comment.id) ? (
                                                <><ChevronDown size={14} /> Loading replies...</>
                                            ) : expandedReplies.has(comment.id) ? (
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
