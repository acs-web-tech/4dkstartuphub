import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { authApi, notificationsApi } from '../services/api';
import { preloadImage } from '../utils/imageCache';
import { subscribeToPushNotifications } from '../utils/pushNotifications';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (data: {
        username: string; email: string; password: string; displayName: string;
        userType: 'startup' | 'investor';
        payment?: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
    }) => Promise<any>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sessionExpired, setSessionExpired] = useState(false);

    const refreshUser = useCallback(async (isAutoRefresh = false) => {
        try {
            const data = await authApi.me();
            setUser(data.user);
        } catch (err: any) {
            // Only clear session if it's a definitive 401 Unauthorized
            // Don't clear on 503 (Nginx rate limit) or 500 (Server error)
            if (err.status === 401) {
                console.warn('🔒 Session invalid: Clearing tokens');
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                setUser(null);
            } else {
                console.error(`⚠️ Profile refresh failed (${err.status}): Keeping session.`, err.message);
            }
        }
    }, []);

    useEffect(() => {
        refreshUser().finally(() => setLoading(false));
    }, [refreshUser]);

    // Handle global event to refresh user state (e.g. on subscription expiry)
    useEffect(() => {
        const handleRefresh = () => refreshUser();
        const handleHardLogout = () => {
            setSessionExpired(true);
        };
        
        window.addEventListener('auth_refresh_required', handleRefresh);
        window.addEventListener('auth_hard_logout', handleHardLogout);
        
        return () => {
            window.removeEventListener('auth_refresh_required', handleRefresh);
            window.removeEventListener('auth_hard_logout', handleHardLogout);
        };
    }, [refreshUser]);

    // Preload user avatar image for faster loading across the app
    useEffect(() => {
        if (user?.avatarUrl) {
            preloadImage(user.avatarUrl);
        }
    }, [user?.avatarUrl]);



    // Handle Push Notification Subscription (Web)
    useEffect(() => {
        if (user && 'Notification' in window && Notification.permission === 'granted') {
            subscribeToPushNotifications();
        }
    }, [user?.id]);

    // Handle Native Mobile Token (FCM)
    useEffect(() => {
        if (!user) return;

        // Track which tokens we've already sent to avoid duplicate API calls
        const sentTokens = new Set<string>();

        const registerNativeToken = async (token: string) => {
            if (!token || sentTokens.has(token)) return;
            sentTokens.add(token);
            try {
                await notificationsApi.registerDevice(token);
                // Keep in localStorage so it survives page reloads
                // The server uses $addToSet so re-sending is harmless
            } catch (err) {
                console.error('Failed to register native token:', err);
                sentTokens.delete(token); // Allow retry on failure
            }
        };

        // Method 1: Check token already in localStorage (set before auth was ready)
        const storedToken = localStorage.getItem('fcm_native_token');
        if (storedToken) {
            registerNativeToken(storedToken);
        }

        // Method 2: Direct handler — called by native app via injectJavaScript
        (window as any).handleNativeToken = (token: string) => {
            localStorage.setItem('fcm_native_token', token);
            registerNativeToken(token);
        };

        // Method 3: CustomEvent listener — dispatched by native app
        const onFcmToken = (e: Event) => {
            const token = (e as CustomEvent<{ token: string }>).detail?.token;
            if (token) {
                localStorage.setItem('fcm_native_token', token);
                registerNativeToken(token);
            }
        };
        window.addEventListener('fcm_token', onFcmToken);

        // Method 4: Ask the native app to re-send the token
        // (in case the WebView loaded before the token was obtained)
        if ((window as any).ReactNativeWebView) {
            (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN' }));
        }

        return () => {
            window.removeEventListener('fcm_token', onFcmToken);
            // Don't clear handleNativeToken — keep it available
        };
    }, [user?.id]);

    const login = async (email: string, password: string) => {
        const data: any = await authApi.login({ email, password });
        if (data.accessToken) localStorage.setItem('access_token', data.accessToken);
        if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
        setUser(data.user);
    };

    const register = async (regData: {
        username: string; email: string; password: string; displayName: string;
        userType: 'startup' | 'investor';
        payment?: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
    }) => {
        const data: any = await authApi.register(regData);
        if (data.accessToken) localStorage.setItem('access_token', data.accessToken);
        if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
        if (data.user) {
            setUser(data.user);
        }
        return data;
    };

    const logout = async () => {
        try {
            // Unregister native token if exists
            const nativeToken = localStorage.getItem('fcm_native_token');
            if (nativeToken) {
                await notificationsApi.unregisterDevice(nativeToken).catch(() => {});
            }

            // Unsubscribe web push if exists
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                if (reg) {
                    const sub = await reg.pushManager.getSubscription();
                    if (sub) {
                        await notificationsApi.unsubscribe(sub.endpoint).catch(() => {});
                        await sub.unsubscribe().catch(() => {});
                    }
                }
            }

            await authApi.logout();
        } finally {
            // Clear all storage completely
            localStorage.clear();
            sessionStorage.clear();

            // Clear in-memory feed cache
            try {
                const { clearFeedCache } = await import('../pages/Feed');
                clearFeedCache();
            } catch { /* ignore */ }

            // Unregister service workers to clear cached responses
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                    await reg.unregister().catch(() => {});
                }
            }

            // Clear browser caches
            if ('caches' in window) {
                const keys = await caches.keys();
                for (const key of keys) {
                    await caches.delete(key).catch(() => {});
                }
            }

            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
            {sessionExpired ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text-primary)', padding: '20px', textAlign: 'center', fontFamily: 'inherit' }}>
                    <h1 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 600 }}>Session Expired</h1>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '400px' }}>Your authentication session has ended or is invalid. Please log in again to continue.</p>
                    <button 
                        onClick={() => window.location.href = '/login'}
                        className="btn btn-primary"
                        style={{ padding: '12px 24px', fontSize: '1rem' }}
                    >
                        Return to Login
                    </button>
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
