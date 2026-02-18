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
    }) => Promise<void>;
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

        const registerNativeToken = async (token: string) => {
            try {
                await notificationsApi.registerDevice(token);
                console.log('✅ Native FCM Token registered');
                localStorage.removeItem('fcm_native_token'); // Clear once sent? Or keep to avoid resending? 
                // Better to keep it or just send it contentiously? 
                // Creating a "sent" flag might be better. 
                // For now, let's just send it. The server uses $addToSet so duplicates are fine.
            } catch (err) {
                console.error('Failed to register native token:', err);
            }
        };

        // 1. Check pending token in storage
        const storedToken = localStorage.getItem('fcm_native_token');
        if (storedToken) {
            registerNativeToken(storedToken);
        }

        // 2. Listen for new tokens from Native App
        (window as any).handleNativeToken = (token: string) => {
            console.log("📲 Received Native FCM Token:", token);
            localStorage.setItem('fcm_native_token', token);
            registerNativeToken(token);
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
        setUser(data.user);
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
