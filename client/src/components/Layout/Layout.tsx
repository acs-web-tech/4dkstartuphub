import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useSocket } from '../../context/SocketContext';
import { WifiOff, RefreshCw, Download } from 'lucide-react';
import { settingsApi } from '../../services/api';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const { socket, status: socketState, reconnectAttempt: socketReconnectAttempt } = useSocket();

    const [status, setStatus] = useState<ConnectionStatus>('idle');
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const [showBanner, setShowBanner] = useState(false);
    const [showInstallBtn, setShowInstallBtn] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [appUrls, setAppUrls] = useState<{ android?: string, ios?: string }>({});

    const toggleSidebar = useCallback(() => {
        setSidebarOpen(prev => !prev);
    }, []);

    const closeSidebar = useCallback(() => {
        setSidebarOpen(false);
    }, []);

    // Close sidebar when navigating to a new route on mobile
    useEffect(() => {
        closeSidebar();
    }, [location.pathname, closeSidebar]);

    useEffect(() => {
        if (socket) {
            setStatus(socketState);
            setReconnectAttempt(socketReconnectAttempt);
        }
    }, [socket, socketState, socketReconnectAttempt]);

    useEffect(() => {
        settingsApi.getPublic().then(data => {
            setAppUrls({ android: data.android_app_url, ios: data.ios_app_url });
        }).catch(() => { });
    }, []);

    useEffect(() => {
        // Detect offline/reconnecting status
        if (status === 'reconnecting' || status === 'disconnected') {
            const timer = setTimeout(() => setShowBanner(true), 2000); // 2s delay
            return () => clearTimeout(timer);
        } else {
            setShowBanner(false);
        }
    }, [status]);

    useEffect(() => {
        // PWA Install Prompt
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallBtn(true);
        };
        window.addEventListener('beforeinstallprompt', handler);

        // Check if we should show "Get App" even if PWA prompt not fired (e.g. iOS or manual config)
        // Only if not already installed (PWA check is hard, but we rely on deferredPrompt for PWA)
        // If we have appUrls, we force show button on mobile ?
        // For now, let's hook into deferredPrompt primarily, but if on mobile we might want to override.

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    // Also check on mount if we are on mobile and have URLs, maybe show banner?
    useEffect(() => {
        const isAndroid = /android/i.test(navigator.userAgent);
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if ((isAndroid && appUrls.android) || (isIOS && appUrls.ios)) {
            setShowInstallBtn(true);
        }
    }, [appUrls]);

    const handleInstallClick = async () => {
        const isAndroid = /android/i.test(navigator.userAgent);
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

        if (isAndroid && appUrls.android) {
            window.location.href = appUrls.android;
            return;
        }
        if (isIOS && appUrls.ios) {
            window.location.href = appUrls.ios;
            return;
        }

        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setShowInstallBtn(false);
            }
            setDeferredPrompt(null);
        }
    };

    return (
        <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
            <Header toggleSidebar={toggleSidebar} />

            {showBanner && (
                <div
                    className={`connection-banner-minimal ${status === 'disconnected' ? 'error' : 'warning'}`}
                    style={{
                        position: 'fixed',
                        bottom: sidebarOpen ? '80px' : '20px',
                        right: '20px',
                        zIndex: 9999,
                        background: status === 'disconnected' ? 'var(--red)' : 'var(--yellow)',
                        color: 'black',
                        padding: '8px 12px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        opacity: 0.9,
                        backdropFilter: 'blur(4px)',
                    }}
                >
                    {status === 'reconnecting' ? (
                        <>
                            <RefreshCw size={14} className="connection-spinner" />
                            <span>Connecting...</span>
                        </>
                    ) : (
                        <>
                            <WifiOff size={14} />
                            <span>Offline</span>
                        </>
                    )}
                </div>
            )}

            {showInstallBtn && !(window as any).ReactNativeWebView && (
                <div className="install-banner">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <Download size={16} />
                        <span>Install App</span>
                    </div>
                    <button className="btn btn-primary btn-xs" onClick={handleInstallClick}>Install</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setShowInstallBtn(false)}>✕</button>
                </div>
            )}

            <div className="main-container">
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
            {/* Overlay for mobile sidebar */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        </div>
    );
}
