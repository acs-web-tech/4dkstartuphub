const BASE = '/api';

// Request deduplication for GET requests
const ongoingRequests = new Map<string, Promise<any>>();

// Token Refresh Queue Lock
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const cacheKey = `${url}:${JSON.stringify(options.headers || {})}`;

    if (isGet && url !== '/auth/me' && ongoingRequests.has(cacheKey)) {
        return ongoingRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
        try {
            const headers: HeadersInit = { ...options.headers };

            if (!(options.body instanceof FormData)) {
                (headers as Record<string, string>)['Content-Type'] = 'application/json';
            }

            // Add Authorization header if token exists (for Mobile/Socket support)
            const token = localStorage.getItem('access_token');
            if (token) {
                (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`${BASE}${url}`, {
                credentials: 'include',
                cache: 'no-store', // Prevent caching of API responses
                ...options,
                headers,
            });

            if (res.status === 401) {
                let errMessage = 'Session expired';
                try {
                    const errData = await res.json();
                    if (errData.error) errMessage = errData.error;
                } catch {
                    // Ignore parse error
                }

                if (!isRefreshing) {
                    isRefreshing = true;
                    // Try refresh regardless of localStorage (browser handles cookies for Web)
                    // This prevents logging out web users who use HttpOnly cookies
                    let refreshSucceeded = false;
                    let newToken = '';

                    try {
                        const refreshRes = await fetch(`${BASE}/auth/refresh`, {
                            method: 'POST',
                            credentials: 'include',
                        });

                        if (refreshRes.ok) {
                            refreshSucceeded = true;
                            try {
                                const refreshData = await refreshRes.json();
                                if (refreshData.accessToken) {
                                    newToken = refreshData.accessToken;
                                    localStorage.setItem('access_token', refreshData.accessToken);
                                    (headers as Record<string, string>)['Authorization'] = `Bearer ${refreshData.accessToken}`;
                                } else {
                                    localStorage.removeItem('access_token');
                                    delete (headers as Record<string, string>)['Authorization'];
                                }
                                if (refreshData.refreshToken) {
                                    localStorage.setItem('refresh_token', refreshData.refreshToken);
                                }
                            } catch (e) { /* ignore parse error */ }
                        } else {
                            if (refreshRes.status === 401 || refreshRes.status === 403) {
                                throw new Error('REFRESH_EXPIRED'); // Explicit signal to log out
                            }
                            throw new Error('NETWORK_ERROR'); // Proceed to catch block to backoff/retry
                        }
                    } catch (error: any) {
                        if (error.message === 'REFRESH_EXPIRED') {
                            isRefreshing = false;
                            refreshQueue.forEach(cb => cb(null));
                            refreshQueue = [];

                            const publicPages = ['/login', '/register', '/forgot-password', '/reset-password', '/', '/feed', '/discovery', '/pricing'];
                            const hadToken = !!localStorage.getItem('access_token') || !!localStorage.getItem('refresh_token');
                            
                            localStorage.removeItem('access_token');
                            localStorage.removeItem('refresh_token');

                            if (hadToken && !publicPages.includes(window.location.pathname)) {
                                window.dispatchEvent(new CustomEvent('auth_hard_logout'));
                            }
                            const err = new Error(errMessage) as any;
                            err.status = 401;
                            throw err;
                        }
                        if (error.name === 'AbortError') throw error;
                    }

                    if (!refreshSucceeded) {
                        isRefreshing = false;
                        refreshQueue.forEach(cb => cb(null));
                        refreshQueue = [];
                        const err = new Error(errMessage) as any;
                        err.status = 401;
                        throw err;
                    }

                    isRefreshing = false;

                    // Process queued requests first
                    refreshQueue.forEach(cb => cb(newToken));
                    refreshQueue = [];

                    // Retry original request independently (seamless retry logic)
                    let retryRes: Response | null = null;
                    try {
                        retryRes = await fetch(`${BASE}${url}`, {
                            credentials: 'include',
                            ...options,
                            headers,
                        });
                    } catch (e: any) {
                        if (e.name === 'AbortError') throw e;
                    }
                    
                    if (!retryRes || !retryRes.ok) {
                        if (retryRes) {
                            const errData = await retryRes.json().catch(() => ({ error: 'Request failed' }));
                            const err = new Error(errData.error || 'Request failed') as any;
                            err.status = retryRes.status;
                            throw err;
                        }
                        throw new Error('Network error on retry');
                    }
                    return retryRes.json();
                } else {
                    // Put in queue and wait for the current refresh to finish
                    return new Promise((resolve, reject) => {
                        refreshQueue.push(async (newToken: string | null) => {
                            if (newToken !== null) {
                                if (newToken) {
                                    (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
                                } else {
                                    delete (headers as Record<string, string>)['Authorization'];
                                }
                                
                                let queuedRes: Response | null = null;
                                try {
                                    queuedRes = await fetch(`${BASE}${url}`, {
                                        credentials: 'include',
                                        ...options,
                                        headers,
                                    });
                                } catch (e: any) {
                                    if (e.name === 'AbortError') { reject(e); return; }
                                }

                                if (!queuedRes || !queuedRes.ok) {
                                    if (queuedRes) {
                                        const errData = await queuedRes.json().catch(() => ({ error: 'Request failed' }));
                                        const err = new Error(errData.error || 'Request failed') as any;
                                        err.status = queuedRes.status;
                                        reject(err);
                                    } else {
                                        reject(new Error('Network error on retry'));
                                    }
                                    return;
                                }
                                try {
                                    resolve(await queuedRes.json());
                                } catch (e) {
                                    reject(e);
                                }
                            } else {
                                reject(new Error(errMessage));
                            }
                        });
                    });
                }
            }

            if (!res.ok) {
                let err: any;
                try {
                    err = await res.json();
                } catch (e) {
                    err = { error: `HTTP ${res.status}` };
                }

                // Removed automatic auth_refresh_required on 402 to prevent infinite retry loops.
                // Page components and Layout handle payment-required states based on the existing user object.

                // Include validation details if present
                let message = err.error || `HTTP ${res.status}`;
                if (err.details && Array.isArray(err.details)) {
                    message = err.details.map((d: { field: string; message: string }) => d.message).join(', ') || message;
                }

                const error: any = new Error(message);
                error.data = err;
                error.status = res.status;
                throw error;
            }

            return res.json();
        } finally {
            if (isGet) {
                ongoingRequests.delete(cacheKey);
            }
        }
    })();

    if (isGet) {
        ongoingRequests.set(cacheKey, requestPromise);
    }

    return requestPromise;
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
    changePassword: (data: any) => request<{ message: string; otpRequired?: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
    sendVerificationOtp: () => request<{ message: string }>('/auth/send-verification-otp', { method: 'POST' }),
    verifyEmailOtp: (otp: string) => request<{ message: string, user: any, accessToken?: string, refreshToken?: string }>('/auth/verify-email-otp', { method: 'POST', body: JSON.stringify({ otp }) }),
};

// ── Payment ─────────────────────────────────────────────────
export const paymentApi = {
    createOrder: (type?: 'upgrade') =>
        request<{ id: string; currency: string; amount: number; keyId: string }>('/payment/create-order', { method: 'POST', body: JSON.stringify({ type }) }),

    verifyUpgrade: (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        request<{ success: boolean; message: string }>('/payment/upgrade', { method: 'POST', body: JSON.stringify(data) }),

    // Server-side safety net: checks Razorpay directly using the order ID stored in DB
    verifyPaymentStatus: () =>
        request<{ status: 'completed' | 'failed' | 'pending' | 'no_order'; message: string; paymentId?: string }>('/payment/verify-status', { method: 'POST' }),
};

// ── Posts ────────────────────────────────────────────────────
export const postsApi = {
    getAll: (params?: { page?: number; limit?: number; category?: string; search?: string; trending?: boolean; userId?: string }, options?: RequestInit) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.category) qs.set('category', params.category);
        if (params?.search) qs.set('search', params.search);
        if (params?.trending) qs.set('trending', 'true');
        if (params?.userId) qs.set('userId', params.userId);
        return request<{ posts: import('../types').Post[]; pagination: import('../types').Pagination }>(
            `/posts?${qs.toString()}`,
            options
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
    getComments: (id: string, params?: { page?: number; limit?: number; parentId?: string }) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.parentId !== undefined) qs.set('parentId', params.parentId);
        return request<{ comments: import('../types').Comment[]; pagination: import('../types').Pagination }>(`/posts/${id}/comments?${qs.toString()}`);
    },
    bookmark: (id: string) => request<{ bookmarked: boolean }>(`/posts/${id}/bookmark`, { method: 'POST' }),

    pin: (id: string) => request(`/posts/${id}/pin`, { method: 'POST' }),
    lock: (id: string) => request(`/posts/${id}/lock`, { method: 'POST' }),
};

// ── Users ───────────────────────────────────────────────────
export const usersApi = {
    getAll: (params?: { page?: number; limit?: number; search?: string; filter?: string }, options?: RequestInit) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.search) qs.set('search', params.search);
        if (params?.filter) qs.set('filter', params.filter);
        return request<{ users: import('../types').User[]; pagination: import('../types').Pagination }>(
            `/users?${qs.toString()}`,
            options
        );
    },
    getById: (id: string) => request<{ user: import('../types').User; recentPosts: any[] }>(`/users/${id}`),
    updateProfile: (data: Record<string, string>) =>
        request('/users/profile', { method: 'PUT', body: JSON.stringify(data) }),
    getBookmarks: () => request<{ bookmarks: any[] }>('/users/me/bookmarks'),
    getNotifications: (params?: { page?: number; limit?: number }) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.limit) qs.set('limit', String(params.limit));
        return request<{ notifications: import('../types').AppNotification[]; unreadCount: number; pagination: import('../types').Pagination }>(`/users/me/notifications?${qs.toString()}`);
    },
    markNotificationsRead: () => request('/users/me/notifications/read', { method: 'PUT' }),
    markOneRead: (id: string) => request(`/users/me/notifications/${id}/read`, { method: 'PUT' }),
    getOnline: () => request<{ onlineUserIds: string[] }>('/users/online'),
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
    getMessages: (id: string, page: number = 1, limit: number = 10) =>
        request<{
            room: any;
            messages: import('../types').ChatMessage[];
            members: any[];
            isMuted?: boolean;
            pagination: import('../types').Pagination;
        }>(`/chatrooms/${id}/messages?page=${page}&limit=${limit}`),
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
    getMyPitches: () => request<{ pitches: import('../types').PitchRequest[]; count: number; limit: number }>('/pitch/my'),
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
    unregisterDevice: (token: string) =>
        request('/notifications/unregister-device', { method: 'POST', body: JSON.stringify({ token }) }),
};

export const settingsApi = {
    getPublic: () => request<{
        registration_payment_required: boolean;
        registration_payment_amount: number;
        registration_email_verification_required: boolean;
        global_payment_lock: boolean;
        android_app_url?: string;
        ios_app_url?: string;
    }>('/settings/public'),
};

export const uploadApi = {
    upload: (file: File, type: 'image' | 'doc' = 'image') => {
        const formData = new FormData();
        formData.append('file', file);
        return request<{ url: string }>(`/upload?type=${type}`, { method: 'POST', body: formData });
    }
};

// ── Smart Search ────────────────────────────────────────────
export const searchApi = {
    query: (q: string, limit = 5, page = 1) =>
        request<{ users: any[]; posts: any[]; usersHasMore: boolean; postsHasMore: boolean }>(`/search?q=${encodeURIComponent(q)}&limit=${limit}&page=${page}`),
};
