import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);

        // Auto-recover from chunk load failures: reload the page to get fresh chunks
        if (this.isChunkLoadError(error)) {
            // Prevent infinite reload loops — only reload once per session
            const reloadKey = 'eb_chunk_reload';
            if (!sessionStorage.getItem(reloadKey)) {
                sessionStorage.setItem(reloadKey, '1');
                this.performHardReload();
            }
        }
    }

    private performHardReload = async () => {
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let reg of regs) {
                    await reg.unregister();
                }
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let key of keys) {
                    await caches.delete(key);
                }
            }
        } catch (e) {
            console.error('Failed to clear caches before reload', e);
        } finally {
            window.location.href = '/'; // Hard reload to root
        }
    };

    private isChunkLoadError(error: Error | null): boolean {
        if (!error) return false;
        
        // Sometimes HTML fallbacks evaluating as JS throw SyntaxError
        if (error.name === 'ChunkLoadError' || error.name === 'SyntaxError') return true;

        const msg = (error.message || '').toLowerCase();
        return (
            msg.includes('dynamically imported module') ||
            msg.includes('loading chunk') ||
            msg.includes('failed to fetch') ||
            msg.includes('loading css chunk') ||
            msg.includes('importing a module script failed') ||
            msg.includes('load failed') ||
            msg.includes('network error') ||
            msg.includes('the internet connection appears to be offline')
        );
    }

    private handleRetry = () => {
        // Clear reload guard so future chunk errors can also auto-recover
        sessionStorage.removeItem('eb_chunk_reload');
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            const isDeleted = this.state.error?.message === 'Account not found';
            const isDeactivated = this.state.error?.message === 'Account deactivated';
            const isAuthError = isDeleted || isDeactivated;
            const isChunkError = this.isChunkLoadError(this.state.error);

            return (
                <div style={{
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#09090b',
                    color: '#f4f4f5',
                    padding: '20px',
                    textAlign: 'center',
                    fontFamily: 'sans-serif'
                }}>
                    {isAuthError ? (
                        <>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '24px'
                            }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                            </div>
                            <h2 style={{ marginBottom: '16px', fontSize: '1.5rem', fontWeight: 700 }}>
                                {isDeleted ? 'Account Access Revoked' : 'Account Deactivated'}
                            </h2>
                            <p style={{ color: '#a1a1aa', marginBottom: '8px', maxWidth: '400px', lineHeight: 1.6 }}>
                                {isDeleted
                                    ? 'Admin has removed your account from StartupHub.'
                                    : 'You have been deactivated by admin.'}
                            </p>
                            <p style={{ color: '#a1a1aa', marginBottom: '32px', maxWidth: '400px', fontSize: '0.9rem' }}>
                                Please contact <span style={{ color: '#3b82f6', fontWeight: 600 }}>support@4dk.in</span> to know further details or if you believe this is a mistake.
                            </p>
                            <button
                                onClick={() => {
                                    localStorage.clear();
                                    window.location.href = '/login';
                                }}
                                style={{
                                    padding: '12px 24px',
                                    background: 'transparent',
                                    border: '1px solid #3f3f46',
                                    borderRadius: '8px',
                                    color: 'white',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Back to Login
                            </button>
                        </>
                    ) : isChunkError ? (
                        <>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                background: 'rgba(99, 102, 241, 0.1)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '24px'
                            }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path></svg>
                            </div>
                            <h2 style={{ marginBottom: '12px', fontSize: '1.3rem', fontWeight: 700 }}>
                                App Updated
                            </h2>
                            <p style={{ color: '#a1a1aa', marginBottom: '24px', maxWidth: '400px', lineHeight: 1.6, fontSize: '0.95rem' }}>
                                A new version of StartupHub is available. Please reload to continue.
                            </p>
                            <button
                                onClick={this.performHardReload}
                                style={{
                                    padding: '12px 28px',
                                    background: '#6366f1',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: 'white',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontSize: '0.95rem',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Reload App & Clear Cache
                            </button>
                        </>
                    ) : (
                        <>
                            <h2 style={{ marginBottom: '16px' }}>Oops! Something went wrong.</h2>
                            <p style={{ color: '#a1a1aa', marginBottom: '24px' }}>
                                {this.state.error?.message || 'An unexpected error occurred.'}
                            </p>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={this.handleRetry}
                                    style={{
                                        padding: '10px 20px',
                                        background: '#3b82f6',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: 'white',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Try Again
                                </button>
                                <button
                                    onClick={this.performHardReload}
                                    style={{
                                        padding: '10px 20px',
                                        background: 'transparent',
                                        border: '1px solid #3f3f46',
                                        borderRadius: '8px',
                                        color: 'white',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Full Reload (Fix Glitches)
                                </button>
                            </div>
                        </>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
