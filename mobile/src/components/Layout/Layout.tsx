import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { initializeNativePush } from '../../utils/nativePush';
import { WifiOff, RefreshCw, Download } from 'lucide-react';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const { status, reconnectAttempt } = useSocket();
    const { user } = useAuth();

    // Initialize Push Notifications when user is logged in
    useEffect(() => {
        if (user) {
            initializeNativePush();
        }
    }, [user]);

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

    // Show connection banner only after a meaningful delay
    const [showBanner, setShowBanner] = useState(false);
    useEffect(() => {
        if (status === 'reconnecting' || status === 'disconnected') {
            const timer = setTimeout(() => setShowBanner(true), 2000);
            return () => clearTimeout(timer);
        } else {
            setShowBanner(false);
        }
    }, [status]);

    // PWA Installation
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallBtn, setShowInstallBtn] = useState(false);

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallBtn(true);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setShowInstallBtn(false);
            setDeferredPrompt(null);
        }
    };

    return (
        <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
            <Header toggleSidebar={toggleSidebar} />

            {/* Connection status banner */}
            {showBanner && (
                <div className={`connection-banner ${status === 'disconnected' ? 'error' : 'warning'}`}>
                    {status === 'reconnecting' ? (
                        <>
                            <RefreshCw size={16} className="connection-spinner" />
                            <span>Reconnecting{reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ''}…</span>
                        </>
                    ) : (
                        <>
                            <WifiOff size={16} />
                            <span>Connection lost. Please check your network.</span>
                        </>
                    )}
                </div>
            )}

            {showInstallBtn && (
                <div className="install-banner">
                    <Download size={16} />
                    <span>Install StartupHub on your device for a better experience!</span>
                    <button className="btn btn-primary btn-xs" onClick={handleInstallClick}>Install</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setShowInstallBtn(false)}>Dismiss</button>
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
