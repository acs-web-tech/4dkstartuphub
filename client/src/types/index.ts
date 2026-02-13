export interface User {
    id: string;
    username: string;
    email: string;
    displayName: string;
    bio: string;
    avatarUrl: string;
    role: 'user' | 'admin' | 'moderator';
    profileCompleted: number;
    location: string;
    website: string;
    linkedin: string;
    twitter: string;
    userType?: 'startup' | 'investor';
    paymentStatus?: 'free' | 'completed' | 'pending' | 'expired';
    premiumExpiry?: string;
    createdAt: string;
}

export interface Post {
    id: string;
    userId: string;
    title: string;
    content: string;
    category: PostCategory;
    imageUrl: string;
    videoUrl?: string;
    isPinned: number;
    isLocked: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    username: string;
    displayName: string;
    avatarUrl: string;
    userBio?: string;
    createdAt: string;
    updatedAt: string;
}

export type PostCategory = 'hiring' | 'cofounder' | 'promote' | 'recommendation' | 'events' | 'general' | 'writeup';

export interface Comment {
    id: string;
    postId: string;
    userId: string;
    content: string;
    parentId: string | null;
    username: string;
    displayName: string;
    avatarUrl: string;
    createdAt: string;
}

export interface PitchRequest {
    id: string;
    userId: string;
    userDisplayName?: string;
    username?: string;
    userAvatarUrl?: string;
    title: string;
    description: string;
    deckUrl: string;
    status: 'pending' | 'approved' | 'disapproved';
    adminMessage?: string;
    reviewerName?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ChatRoomMember {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    isMuted: number;
}

export interface ChatRoom {
    id: string;
    name: string;
    description: string;
    createdBy: string;
    creatorName: string;
    memberCount: number;
    messageCount: number;
    accessType: 'open' | 'invite';
    isJoined: boolean;
    createdAt: string;
}

export interface ChatMessage {
    id: string;
    content: string;
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    createdAt: string;
}

export interface AppNotification {
    id: string;
    type: 'like' | 'comment' | 'mention' | 'admin' | 'chat' | 'welcome' | 'comment_reply';
    title: string;
    content: string;
    referenceId: string;
    isRead: number;
    senderId: string;
    senderDisplayName: string;
    senderAvatarUrl: string;
    senderUsername: string;
    createdAt: string;
}

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface AdminStats {
    totalUsers: number;
    activeUsers: number;
    totalPosts: number;
    totalComments: number;
    activeChatRooms: number;
    totalMessages: number;
    recentSignups: number;
}


