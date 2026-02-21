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
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            const isDeleted = this.state.error?.message === 'Account not found';
            const isDeactivated = this.state.error?.message === 'Account deactivated';
            const isAuthError = isDeleted || isDeactivated;

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
                    ) : (
                        <>
                            <h2 style={{ marginBottom: '16px' }}>Oops! Something went wrong.</h2>
                            <p style={{ color: '#a1a1aa', marginBottom: '24px' }}>
                                {this.state.error?.message || 'An unexpected error occurred.'}
                            </p>
                            <button
                                onClick={() => window.location.href = '/'}
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
                                Back to Home
                            </button>
                        </>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
