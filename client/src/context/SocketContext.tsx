import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { usersApi } from '../services/api';

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
    const { user, refreshUser } = useAuth();
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
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 2000,
                reconnectionDelayMax: 10000, // Faster max delay for better recovery
                randomizationFactor: 0.3,
                timeout: 20000,
            });

            newSocket.on('connect_error', (err) => {
                console.error('🔌 WebSocket Connect Error:', err.message);

                // If it's an authentication error, try to refresh the session
                if (err.message.includes('Authentication error') || err.message.includes('No token')) {
                    console.log('🔄 Socket Auth failed, attempting session refresh...');
                    refreshUser().then(() => {
                        // After refreshUser, the localStorage and cookies should be updated
                        const newToken = localStorage.getItem('access_token');
                        if (newToken) {
                            newSocket.auth = { token: newToken };
                            // Socket.IO will automatically try to reconnect, 
                            // but we can force it if it's currently disconnected
                            if (!newSocket.connected) {
                                setTimeout(() => newSocket.connect(), 1000);
                            }
                        }
                    }).catch(() => {
                        // Refresh failed, likely need to login again
                        setStatus('disconnected');
                    });
                }
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
