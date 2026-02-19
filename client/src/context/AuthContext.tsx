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

    const refreshUser = useCallback(async () => {
        try {

            const data = await authApi.me();

            setUser(data.user);
        } catch {
            setUser(null);
        }
    }, []);

    useEffect(() => {
        refreshUser().finally(() => setLoading(false));
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
    }, [user]);

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
                console.log('✅ Native FCM Token registered with server');
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
            console.log('📲 Received Native FCM Token via handler');
            localStorage.setItem('fcm_native_token', token);
            registerNativeToken(token);
        };

        // Method 3: CustomEvent listener — dispatched by native app
        const onFcmToken = (e: Event) => {
            const token = (e as CustomEvent<{ token: string }>).detail?.token;
            if (token) {
                console.log('📲 Received Native FCM Token via event');
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
    }, [user]);

    const login = async (email: string, password: string) => {
        const data: any = await authApi.login({ email, password });
        setUser(data.user);
    };

    const register = async (regData: {
        username: string; email: string; password: string; displayName: string;
        userType: 'startup' | 'investor';
        payment?: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
    }) => {
        const data: any = await authApi.register(regData);
        if (data.user) {
            setUser(data.user);
        }
        return data;
    };

    const logout = async () => {
        await authApi.logout();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
