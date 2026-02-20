const BASE = '/api';

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = { ...options.headers };

    if (!(options.body instanceof FormData)) {
        (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${BASE}${url}`, {
        credentials: 'include',
        cache: 'no-store', // Prevent caching of API responses (crucial for /me)
        headers,
        ...options,
    });

    if (res.status === 401) {
        let errMessage = 'Session expired';
        try {
            const errData = await res.json();
            if (errData.error) errMessage = errData.error;
        } catch {
            // Ignore parse error
        }

        // Refresh failed - redirect to login
        const publicPages = ['/login', '/register', '/forgot-password', '/reset-password'];
        if (!publicPages.includes(window.location.pathname)) {
            // Try refresh
            const refreshRes = await fetch(`${BASE}/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
            });
            if (refreshRes.ok) {
                // Retry original request
                const retryRes = await fetch(`${BASE}${url}`, {
                    credentials: 'include',
                    headers,
                    ...options,
                });
                if (!retryRes.ok) {
                    const err = await retryRes.json().catch(() => ({ error: 'Request failed' }));
                    throw new Error(err.error || 'Request failed');
                }
                return retryRes.json();
            }
        }

        // If we are here, refresh failed or we are on login/register page
        if (!publicPages.includes(window.location.pathname)) {
            window.location.href = '/login';
        }
        throw new Error(errMessage);
    }

    if (res.status === 402) {
        if (window.location.pathname !== '/pricing') {
            window.location.href = '/pricing';
        }
        throw new Error('Payment required to access the platform.');
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        // Include validation details if present
        if (err.details && Array.isArray(err.details)) {
            const detailMsg = err.details.map((d: { field: string; message: string }) => d.message).join(', ');
            throw new Error(detailMsg || err.error || `HTTP ${res.status}`);
        }
        throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
}

// ── Auth ────────────────────────────────────────────────────
export const authApi = {
    register: (data: {
        username: string; email: string; password: string; displayName: string;
        userType: 'startup' | 'investor';
        payment?: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
    }) =>
        request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    initiateRegistration: (data: any) =>
        request<{ orderId: string, keyId: string, amount: number, currency: string, userId: string }>('/auth/register-init', { method: 'POST', body: JSON.stringify(data) }),
    finalizeRegistration: (data: { order_id: string, payment_id: string, signature: string }) =>
        request<{ message: string, user: any, accessToken?: string, refreshToken?: string, requireVerification?: boolean }>('/auth/register-finalize', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
        request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    checkAvailability: (data: { username?: string; email?: string }) =>
        request<{ available: boolean }>('/auth/check-availability', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<{ user: import('../types').User }>('/auth/me'),
};

// ── Payment ─────────────────────────────────────────────────
export const paymentApi = {
    createOrder: (type?: 'upgrade') =>
        request<{ id: string; currency: string; amount: number; keyId: string }>('/payment/create-order', { method: 'POST', body: JSON.stringify({ type }) }),

    verifyUpgrade: (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        request<{ success: boolean; message: string }>('/payment/upgrade', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Posts ────────────────────────────────────────────────────
export const postsApi = {
    getAll: (params?: { page?: number; limit?: number; category?: string; search?: string; trending?: boolean }) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.category) qs.set('category', params.category);
        if (params?.search) qs.set('search', params.search);
        if (params?.trending) qs.set('trending', 'true');
        return request<{ posts: import('../types').Post[]; pagination: import('../types').Pagination }>(
            `/posts?${qs.toString()}`
        );
    },
    getById: (id: string) =>
        request<{ post: import('../types').Post; comments: import('../types').Comment[] }>(`/posts/${id}`),
    create: (data: { title: string; content: string; category: string; videoUrl?: string; imageUrl?: string; eventDate?: string }) =>
        request<{ message: string; postId: string }>('/posts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { title?: string; content?: string; category?: string; videoUrl?: string; imageUrl?: string; eventDate?: string }) =>
        request(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/posts/${id}`, { method: 'DELETE' }),
    like: (id: string) => request<{ liked: boolean }>(`/posts/${id}/like`, { method: 'POST' }),
    checkLiked: (id: string) => request<{ liked: boolean }>(`/posts/${id}/liked`),
    comment: (id: string, data: { content: string; parentId?: string }) =>
        request(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify(data) }),
    bookmark: (id: string) => request<{ bookmarked: boolean }>(`/posts/${id}/bookmark`, { method: 'POST' }),
    pin: (id: string) => request(`/posts/${id}/pin`, { method: 'POST' }),
    lock: (id: string) => request(`/posts/${id}/lock`, { method: 'POST' }),
};

// ── Users ───────────────────────────────────────────────────
export const usersApi = {
    getAll: (params?: { page?: number; search?: string; filter?: string }) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.search) qs.set('search', params.search);
        if (params?.filter) qs.set('filter', params.filter);
        return request<{ users: import('../types').User[]; pagination: import('../types').Pagination }>(
            `/users?${qs.toString()}`
        );
    },
    getById: (id: string) => request<{ user: import('../types').User; recentPosts: any[] }>(`/users/${id}`),
    updateProfile: (data: Record<string, string>) =>
        request('/users/profile', { method: 'PUT', body: JSON.stringify(data) }),
    getBookmarks: () => request<{ bookmarks: any[] }>('/users/me/bookmarks'),
    getNotifications: () =>
        request<{ notifications: import('../types').AppNotification[]; unreadCount: number }>('/users/me/notifications'),
    markNotificationsRead: () => request('/users/me/notifications/read', { method: 'PUT' }),
    markOneRead: (id: string) => request(`/users/me/notifications/${id}/read`, { method: 'PUT' }),
};

// ── Chat Rooms ──────────────────────────────────────────────
export const chatApi = {
    getRooms: () => request<{ rooms: import('../types').ChatRoom[] }>('/chatrooms'),
    createRoom: (data: { name: string; description?: string; accessType?: string }) =>
        request<{ roomId: string }>('/chatrooms', { method: 'POST', body: JSON.stringify(data) }),
    updateRoom: (id: string, data: { name?: string; description?: string; accessType?: string }) =>
        request(`/chatrooms/${id}/settings`, { method: 'PUT', body: JSON.stringify(data) }),
    joinRoom: (id: string) => request(`/chatrooms/${id}/join`, { method: 'POST' }),
    leaveRoom: (id: string) => request(`/chatrooms/${id}/leave`, { method: 'POST' }),
    addMember: (roomId: string, userId: string) =>
        request(`/chatrooms/${roomId}/add-member`, { method: 'POST', body: JSON.stringify({ userId }) }),
    kickMember: (roomId: string, userId: string) =>
        request(`/chatrooms/${roomId}/kick`, { method: 'POST', body: JSON.stringify({ userId }) }),
    muteMember: (roomId: string, userId: string) =>
        request<{ isMuted: number }>(`/chatrooms/${roomId}/mute`, { method: 'POST', body: JSON.stringify({ userId }) }),
    getMessages: (id: string, page?: number) => {
        const qs = page ? `?page=${page}` : '';
        return request<{
            room: any;
            messages: import('../types').ChatMessage[];
            members: any[];
            isMuted?: boolean;
            pagination: import('../types').Pagination;
        }>(`/chatrooms/${id}/messages${qs}`);
    },
    sendMessage: (id: string, content: string) =>
        request<{ message: import('../types').ChatMessage }>(`/chatrooms/${id}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        }),
    deleteMessage: (roomId: string, messageId: string) =>
        request(`/chatrooms/${roomId}/messages/${messageId}`, { method: 'DELETE' }),
    deleteUserMessages: (roomId: string, userId: string) =>
        request(`/chatrooms/${roomId}/users/${userId}/messages`, { method: 'DELETE' }),
    deleteRoom: (id: string) => request(`/chatrooms/${id}`, { method: 'DELETE' }),
};

// ── Pitch Requests ──────────────────────────────────────────
export const pitchApi = {
    submit: (data: { title: string; description: string; deckUrl?: string }) =>
        request<{ message: string; pitchId: string }>('/pitch', { method: 'POST', body: JSON.stringify(data) }),
    getMyPitches: () => request<{ pitches: import('../types').PitchRequest[] }>('/pitch/my'),
    getAllPitches: (status?: string) => {
        const qs = status ? `?status=${status}` : '';
        return request<{ pitches: import('../types').PitchRequest[] }>(`/pitch/all${qs}`);
    },
    reviewPitch: (id: string, data: { status: 'approved' | 'disapproved'; message?: string }) =>
        request(`/pitch/${id}/review`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ── Admin ───────────────────────────────────────────────────
export const adminApi = {
    getStats: () => request<{ stats: import('../types').AdminStats; postsByCategory: any[]; topPosters: any[] }>('/admin/stats'),
    getUsers: (params?: { page?: number; search?: string }) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.search) qs.set('search', params.search);
        return request<{ users: any[]; pagination: import('../types').Pagination }>(`/admin/users?${qs.toString()}`);
    },
    updateUserRole: (id: string, role: string) =>
        request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    toggleUserActive: (id: string) =>
        request(`/admin/users/${id}/toggle-active`, { method: 'PUT' }),
    updateUserPremium: (id: string, data: { paymentStatus?: string; premiumExpiry?: string | null }) =>
        request(`/admin/users/${id}/premium`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id: string) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    deletePost: (id: string) => request(`/admin/posts/${id}`, { method: 'DELETE' }),
    broadcast: (title: string, content: string, videoUrl?: string, referenceId?: string, imageUrl?: string) =>
        request('/admin/notifications/broadcast', { method: 'POST', body: JSON.stringify({ title, content, videoUrl, referenceId, imageUrl }) }),
    getSettings: () => request<{ settings: Record<string, string> }>('/admin/settings'),
    updateSetting: (key: string, value: string) =>
        request<{ message: string }>('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
    sendPasswordReset: (id: string) =>
        request<{ message: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }),
};

// ── Notifications (Push) ────────────────────────────────────
export const notificationsApi = {
    getVapidKey: () => request<{ publicKey: string }>('/notifications/vapid-key'),
    subscribe: (subscription: PushSubscription) =>
        request('/notifications/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
    unsubscribe: (endpoint: string) =>
        request('/notifications/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
    registerDevice: (token: string) =>
        request('/notifications/register-device', { method: 'POST', body: JSON.stringify({ token }) }),
};

// ── Public Settings (no auth) ───────────────────────────────
export const settingsApi = {
    getPublic: () => request<{
        registration_payment_required: boolean;
        registration_payment_amount: number;
        android_app_url?: string;
        ios_app_url?: string;
    }>('/settings/public'),
};

export const uploadApi = {
    upload: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return request<{ url: string }>('/upload', { method: 'POST', body: formData });
    }
};
