import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { postsApi, usersApi } from '../../services/api';
import { Comment } from '../../types';
import { Lock } from 'lucide-react';
import CommentItem from './CommentItem';
import LinkPreview from '../Common/LinkPreview';

interface CommentsSectionProps {
    postId: string;
    isLocked: boolean | undefined;
    initialComments: Comment[];
}

export default function CommentsSection({ postId, isLocked, initialComments }: CommentsSectionProps) {
    const { user } = useAuth();
    const { socket } = useSocket();
    const [comments, setComments] = useState<Comment[]>(initialComments);
    const [newComment, setNewComment] = useState('');
    const [commenting, setCommenting] = useState(false);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);

    // @mention autocomplete state
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const [mentionUsers, setMentionUsers] = useState<Array<{ id: string; username: string; displayName: string; avatarUrl: string }>>([]);
    const [mentionCursorPos, setMentionCursorPos] = useState(0);
    const commentInputRef = useRef<HTMLTextAreaElement>(null);

    // Update comments when initialComments changes
    useEffect(() => {
        setComments(initialComments);
    }, [initialComments]);

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
            };
            socket.on('newComment', handleNewComment);
            return () => { socket.off('newComment', handleNewComment); };
        }
    }, [socket, postId]);

    const handleComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !postId || !newComment.trim()) return;

        const content = newComment.trim();
        const tempId = `temp-${Date.now()}`;

        const optimisticComment: Comment = {
            id: tempId,
            postId: postId,
            userId: user.id,
            content: content,
            parentId: null,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl || '',
            username: user.username,
            createdAt: new Date().toISOString()
        };

        setComments(prev => [...prev, optimisticComment]);
        setNewComment('');
        setPreviewUrls([]);
        setShowMentionDropdown(false);
        setCommenting(true);

        try {
            await postsApi.comment(postId, { content });
        } catch (err) {
            setComments(prev => prev.filter(c => c.id !== tempId));
            alert('Failed to post comment. Please try again.');
            setNewComment(content);
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
                if (textAfterAt.includes(' ')) { setShowMentionDropdown(false); return; }
                if (textAfterAt.length >= 0) {
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
                }
            } else {
                setShowMentionDropdown(false);
            }
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

    return (
        <section className="card comments-section">
            <h2>Comments ({comments.length})</h2>

            {user && !isLocked && (
                <form className="comment-form" onSubmit={handleComment} style={{ position: 'relative' }}>
                    <textarea
                        ref={commentInputRef}
                        className="form-input"
                        placeholder="Write a comment... (use @ to mention users)"
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
                                            ? <img src={u.avatarUrl} alt={u.displayName} />
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
                        {commenting ? 'Posting...' : 'Post Comment'}
                    </button>
                </form>
            )}

            {!!isLocked && (
                <div className="alert alert-info"><Lock size={16} className="inline mr-1" /> Comments are locked on this post</div>
            )}

            {comments.length === 0 ? (
                <p className="empty-comments">No comments yet. Be the first to comment!</p>
            ) : (
                <div className="comments-list">
                    {comments.map(comment => (
                        <CommentItem key={comment.id} comment={comment} />
                    ))}
                </div>
            )}
        </section>
    );
}
