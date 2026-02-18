
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Comment } from '../../types';
import { SmartImage } from '../Common/SmartImage';

interface CommentItemProps {
    comment: Comment;
}

function CommentItem({ comment }: CommentItemProps) {
    const cInitials = comment.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const isOptimistic = comment.id.toString().startsWith('temp-');

    // Parse date safely
    const parseDate = (dateStr: string) => {
        if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
            return new Date(dateStr + 'Z');
        }
        return new Date(dateStr);
    };

    const createdAtDate = parseDate(comment.createdAt);
    const isRealtimeNew = !isOptimistic && (Date.now() - createdAtDate.getTime() < 5000);

    const getTimeAgo = (date: Date): string => {
        const diff = Math.floor((Date.now() - date.getTime()) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className={`comment-item ${isOptimistic ? 'optimistic' : ''} ${isRealtimeNew ? 'realtime-new' : ''}`}>
            <Link to={`/users/${comment.userId}`} className="comment-avatar">
                {comment.avatarUrl ? (
                    <SmartImage src={comment.avatarUrl} alt={comment.displayName} />
                ) : (
                    <span>{cInitials}</span>
                )}
            </Link>
            <div className="comment-content">
                <div className="comment-header">
                    <Link to={`/users/${comment.userId}`} className="comment-author">{comment.displayName}</Link>
                    <span className="comment-time">{getTimeAgo(createdAtDate)}</span>
                </div>
                <p className="comment-text" dangerouslySetInnerHTML={{
                    __html: comment.content.replace(/@(\w+)/g, '<a href="/feed?search=$1" class="mention-link">@$1</a>')
                }} />
            </div>
        </div>
    );
}

export default memo(CommentItem);
