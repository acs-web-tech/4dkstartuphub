import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';
import { preloadImage } from '../utils/imageCache';

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
            console.log('🔄 Refreshing user data...');
            const data = await authApi.me();
            console.log('✅ User data received:', data.user);
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
