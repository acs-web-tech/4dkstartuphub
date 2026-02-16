import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

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
    const { user } = useAuth();
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
                withCredentials: true,
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: Infinity,          // Never give up
                reconnectionDelay: 2000,                 // Start at 2s
                reconnectionDelayMax: 30000,             // Cap at 30s
                randomizationFactor: 0.3,                // Jitter to avoid thundering herd
                timeout: 15000,                          // 15s connection timeout
            });

            newSocket.on('connect', () => {
                setConnected(true);
                setStatus('connected');
                setReconnectAttempt(0);

                // Fetch initial online users
                fetch('/api/users/online')
                    .then(res => res.json())
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

            newSocket.on('disconnect', (reason) => {
                setConnected(false);
                // If the server closed the connection or transport failed,
                // Socket.IO will auto-reconnect. If we called .disconnect(),
                // it won't (which is the correct behavior).
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

            newSocket.io.on('reconnect_failed', () => {
                console.error('❌ WebSocket reconnection failed after all attempts');
                setStatus('disconnected');
            });

            newSocket.on('connect_error', (err) => {
                console.error('🔌 WebSocket Connect Error:', err.message);
                // Don't call refreshUser — causes infinite loops.
                // Socket.IO handles retry automatically.
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
