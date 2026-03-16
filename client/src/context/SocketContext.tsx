import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { usersApi } from '../services/api';
import { useModal } from './ModalContext';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface SocketContextType {
    socket: Socket | null;
    connected: boolean;
    onlineUsers: Set<string>;
    status: ConnectionStatus;
    reconnectAttempt: number;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    connected: false,
    onlineUsers: new Set(),
    status: 'idle',
    reconnectAttempt: 0,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading: authLoading, refreshUser } = useAuth();
    const { alert } = useModal();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [status, setStatus] = useState<ConnectionStatus>('idle');
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const userId = user?.id;
        if (userId) {
            const backendUrl = window.location.origin;
            setStatus('connecting');

            const newSocket = io(backendUrl, {
                auth: {
                    token: localStorage.getItem('access_token')
                },
                withCredentials: true,
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 2000,
                reconnectionDelayMax: 10000, // Faster max delay for better recovery
                randomizationFactor: 0.3,
                timeout: 20000,
            });

            newSocket.on('connect_error', (err) => {
                console.error('🔌 WebSocket Connect Error:', err.message);
                // Relying natively on Socket.IO's exponential backoff for reconnection.
                // Do not manually force a reconnect token-loop here, as it can cause infinite looping
                // if the client spoofs their state but lacks a valid JWT.
            });

            newSocket.on('connect', () => {
                setConnected(true);
                setStatus('connected');
                setReconnectAttempt(0);

                // Fetch initial online users
                usersApi.getOnline()
                    .then(data => setOnlineUsers(new Set(data.onlineUserIds || [])))
                    .catch(() => { });
            });

            newSocket.on('userOnline', ({ userId }: { userId: string }) => {
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    next.add(userId);
                    return next;
                });
            });

            newSocket.on('userOffline', ({ userId }: { userId: string }) => {
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    next.delete(userId);
                    return next;
                });
            });

            // ── Force Logout: admin deactivated/deleted this account ──
            let wasForceLoggedOut = false;
            newSocket.on('forceLogout', async ({ reason }: { reason: string }) => {
                wasForceLoggedOut = true;
                // Clear all tokens immediately
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                // Disconnect socket and prevent reconnection
                newSocket.disconnect();
                // Notify user and redirect
                await alert(reason || 'Your session has been terminated by an administrator.');
                window.location.href = '/login';
            });

            newSocket.on('accountStatusUpdate', (data: any) => {
                // Refresh user state to reflect premium, activation, or role changes
                refreshUser();

                // Show a helpful alert if reason provided
                if (data.reason === 'admin_activation') {
                    // Optional: Notify user they are now active
                }
            });

            newSocket.on('roomDeleted', ({ roomId }: { roomId: string }) => {
                // Global event for components to react (like redirecting if inside that room)
                window.dispatchEvent(new CustomEvent('chatRoomDeleted', { detail: { roomId } }));
            });

            newSocket.on('roomAccessChanged', ({ roomId, accessType }: { roomId: string, accessType: string }) => {
                window.dispatchEvent(new CustomEvent('chatRoomAccessChanged', { detail: { roomId, accessType } }));
            });

            newSocket.on('disconnect', (reason) => {
                setConnected(false);
                // Do NOT reconnect if the user was force-logged-out
                if (wasForceLoggedOut) return;
                if (reason === 'io server disconnect') {
                    // Server forced disconnect — try reconnecting manually
                    setStatus('reconnecting');
                    newSocket.connect();
                } else {
                    setStatus('reconnecting');
                }
            });

            // ... (rest of the socket implementation)
            newSocket.io.on('reconnect_attempt', (attempt: number) => {
                setStatus('reconnecting');
                setReconnectAttempt(attempt);
            });

            newSocket.io.on('reconnect', () => {
                setStatus('connected');
                setReconnectAttempt(0);
            });

            socketRef.current = newSocket;
            setSocket(newSocket);

            return () => {
                newSocket.disconnect();
                socketRef.current = null;
            };
        } else {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
                setConnected(false);
                setOnlineUsers(new Set());
                setStatus('idle');
                setReconnectAttempt(0);
            }
        }
    }, [user?.id]);

    return (
        <SocketContext.Provider value={{ socket, connected, onlineUsers, status, reconnectAttempt }}>
            {children}
        </SocketContext.Provider>
    );
};
