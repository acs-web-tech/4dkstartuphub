import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import BackToTop from '../Common/BackToTop';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import Pricing from '../../pages/Pricing';
import { WifiOff, RefreshCw, Download, Mail, CheckCircle, ArrowRight } from 'lucide-react';
import { settingsApi, authApi } from '../../services/api';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export default function Layout() {
    const { user, refreshUser } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const { socket, status: socketState, reconnectAttempt: socketReconnectAttempt } = useSocket();

    const [status, setStatus] = useState<ConnectionStatus>('idle');
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const [showBanner, setShowBanner] = useState(false);
    const [showInstallBtn, setShowInstallBtn] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [appUrls, setAppUrls] = useState<{ android?: string, ios?: string }>({});
    const [globalLock, setGlobalLock] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const { alert } = useModal();

    // Verification state
    const [otp, setOtp] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [verifyError, setVerifyError] = useState('');

    const toggleSidebar = useCallback(() => {
        setSidebarOpen(prev => !prev);
    }, []);

    const closeSidebar = useCallback(() => {
        setSidebarOpen(false);
    }, []);

    // Close sidebar and Sync status when navigating (especially when disconnected)
    const prevPath = useRef(location.pathname);
    useEffect(() => {
        closeSidebar();

        if (prevPath.current !== location.pathname) {
            if (user?.id && socketState !== 'connected') {
                setIsSyncing(true);

                Promise.all([
                    refreshUser(),
                    settingsApi.getPublic().then((data: any) => {
                        setAppUrls({ android: data.android_app_url, ios: data.ios_app_url });
                        setGlobalLock(data.global_payment_lock || false);
                    })
                ]).catch(err => console.error('[Sync] Navigation sync failed:', err))
                    .finally(() => setIsSyncing(false));
            }
            prevPath.current = location.pathname;
        }
    }, [location.pathname, closeSidebar, user?.id, socketState, refreshUser]);

    // Force re-verification ONLY when the socket genuinely drops and reconnects 
    // (Bypasses the first successful connection since AuthContext handles initial load)
    const prevSocketState = useRef(socketState);
    const hasConnectedOnce = useRef(false);

    useEffect(() => {
        if (user?.id && socketState === 'connected') {
            if (hasConnectedOnce.current && prevSocketState.current !== 'connected') {
                refreshUser();
                settingsApi.getPublic().then((data: any) => {
                    setGlobalLock(data.global_payment_lock || false);
                }).catch(() => { });
            }
            hasConnectedOnce.current = true;
        }
        prevSocketState.current = socketState;
    }, [socketState, user?.id, refreshUser]);

    useEffect(() => {
        if (socket) {
            setStatus(socketState);
            setReconnectAttempt(socketReconnectAttempt);
        }
    }, [socket, socketState, socketReconnectAttempt]);

    useEffect(() => {
        settingsApi.getPublic().then((data: any) => {
            setAppUrls({ android: data.android_app_url, ios: data.ios_app_url });
            setGlobalLock(data.global_payment_lock || false);
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
        // PWA Install Prompt - Desktop Only
        const handler = (e: any) => {
            e.preventDefault();
            const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
            if (!isMobile) {
                setDeferredPrompt(e);
                setShowInstallBtn(true);
            }
        };
        window.addEventListener('beforeinstallprompt', handler);

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

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifyError('');
        setVerifying(true);
        try {
            const res = await authApi.verifyEmailOtp(otp);
            if (res.accessToken) localStorage.setItem('access_token', res.accessToken);
            if (res.refreshToken) localStorage.setItem('refresh_token', res.refreshToken);
            await refreshUser();
            setOtp('');
        } catch (err: any) {
            setVerifyError(err.message || 'Verification failed');
        } finally {
            setVerifying(false);
        }
    };

    const handleResendOtp = async () => {
        setResendLoading(true);
        try {
            await authApi.sendVerificationOtp();
            await alert('A new verification code has been sent to your email.');
        } catch (err: any) {
            setVerifyError(err.message || 'Failed to resend code');
        } finally {
            setResendLoading(false);
        }
    };

    const isPremium = user?.paymentStatus === 'completed' && user?.premiumExpiry && new Date(user.premiumExpiry) > new Date();
    const isUnverified = user && !user.isEmailVerified;

    // Lock out if:
    // 1. Platform is globally locked and user is NOT premium (Free or Expired)
    // 2. OR user account has been deactivated (isActive: false) AND they aren't just pending verification
    // 3. OR user payment status is explicitly 'expired' or 'free' (forced payment gate)
    // 4. (Always allow Admin and Pricing page)
    const isLockedOut = user && user.role !== 'admin' && location.pathname !== '/pricing' && (
        (globalLock && !isPremium) ||
        (user.isActive === false && !isUnverified) || 
        (user.paymentStatus === 'expired') ||
        (user.paymentStatus === 'free')
    );

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
                <div className="install-banner-premium">
                    <div className="install-content-wrapper">
                        <div className="install-icon-box">
                            <img src="/logo.png" alt="App Logo" className="install-logo-img" />
                        </div>
                        <div className="install-text-group">
                            <h3>Experience StartupHub Natively</h3>
                            <p>Get instant notifications and smoother navigation.</p>
                        </div>
                    </div>
                    <div className="install-action-buttons">
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowInstallBtn(false)}>Later</button>
                        <button className="btn btn-primary btn-sm btn-install-app" onClick={handleInstallClick}>
                            Get App <Download size={14} style={{ marginLeft: '4px' }} />
                        </button>
                    </div>
                </div>
            )}

            <div className="main-container">
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                <main className="main-content">
                    {isSyncing ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            gap: '1rem',
                            padding: '5rem 0'
                        }}>
                            <RefreshCw size={40} className="connection-spinner" style={{ color: 'var(--accent)', opacity: 0.5 }} />
                            <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Verifying account status...</p>
                        </div>
                    ) : isUnverified ? (
                        <div className="verification-locked-screen">
                            <div className="verification-card">
                                <div className="verification-icon-wrapper">
                                    <Mail size={32} />
                                </div>
                                <h2>Verify Your Email</h2>
                                <p>
                                    A 6-digit verification code has been sent to <br />
                                    <strong className="text-secondary">{user.email}</strong>
                                </p>

                                {verifyError && <div className="alert alert-error mb-6">{verifyError}</div>}

                                <form onSubmit={handleVerifyOtp}>
                                    <div className="form-group mb-8">
                                        <label className="otp-label">Verification Code</label>
                                        <input
                                            type="text"
                                            className="otp-input-premium"
                                            placeholder="000000"
                                            maxLength={6}
                                            value={otp}
                                            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                                            required
                                            disabled={verifying}
                                            autoFocus
                                        />
                                    </div>

                                    <button 
                                        type="submit" 
                                        className="btn btn-primary btn-full py-4 text-lg shadow-accent" 
                                        disabled={verifying || otp.length !== 6}
                                        style={{ height: 'auto', borderRadius: 'var(--radius)' }}
                                    >
                                        {verifying ? (
                                            <><RefreshCw className="animate-spin mr-2" size={20} /> Verifying...</>
                                        ) : (
                                            <><CheckCircle className="mr-2" size={20} /> Verify & Continue</>
                                        )}
                                    </button>
                                </form>

                                <div className="verification-footer">
                                    <p className="text-sm mb-2">Didn't receive the code?</p>
                                    <button 
                                        className="resend-btn-premium"
                                        onClick={handleResendOtp}
                                        disabled={resendLoading}
                                    >
                                        {resendLoading ? (
                                            <><RefreshCw className="animate-spin" size={16} /> Sending...</>
                                        ) : (
                                            <><ArrowRight size={16} /> Resend Verification Code</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : isLockedOut ? (
                        <Pricing />
                    ) : (
                        <Outlet />
                    )}
                </main>
            </div>
            {/* Overlay for mobile sidebar */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            <BackToTop />
        </div>
    );
}
