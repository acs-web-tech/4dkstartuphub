import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { authApi } from '../services/api';

declare global {
    interface Window {
        Razorpay: any;
    }
}

export default function Login() {
    const { login, user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [searchParams] = useSearchParams();
    const verified = searchParams.get('verified') === 'true';

    // Redirect if already logged in (prevents login page flicker)
    useEffect(() => {
        if (!authLoading && user) {
            navigate('/feed', { replace: true });
        }
    }, [user, authLoading, navigate]);

    if (authLoading) return <div className="loading-container"><div className="spinner" /></div>;
    if (user) return null;

    const handlePaymentRetry = (data: any) => {
        const options = {
            key: data.keyId,
            amount: data.amount,
            currency: 'INR',
            name: 'StartupHub',
            description: `Registration Payment`,
            order_id: data.orderId,
            handler: async (response: any) => {
                setLoading(true);
                try {
                    await authApi.finalizeRegistration({
                        order_id: response.razorpay_order_id,
                        payment_id: response.razorpay_payment_id,
                        signature: response.razorpay_signature,
                    });
                    // Successfully finalized, now login automatically
                    await login(email, password);
                    navigate('/feed');
                } catch (err: any) {
                    setError(err.message || 'Payment success but activation failed');
                    setLoading(false);
                }
            },
            prefill: {
                name: data.displayName || '',
                email: data.email || '',
            },
            theme: { color: '#6366f1' },
            modal: {
                ondismiss: () => {
                    setLoading(false);
                    setError('Payment cancelled. Please complete payment to login.');
                }
            }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
    };

    const [showVerification, setShowVerification] = useState(false);
    const [otp, setOtp] = useState('');
    const [resendLoading, setResendLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            navigate('/feed');
        } catch (err: any) {
            if (err.data && err.data.error === 'PAYMENT_REQUIRED') {
                handlePaymentRetry(err.data);
            } else if (err.data && err.data.error === 'EMAIL_VERIFICATION_REQUIRED') {
                setShowVerification(true);
            } else {
                setError(err.message || 'Login failed');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await authApi.verifyEmailOtp(otp);
            // After verification, we need to refresh the user state in AuthContext
            // since the user is now verified but the local state doesn't know.
            // A simple way is to re-login or just navigate as the next page 
            // will call /me and get the updated status.
            window.location.href = '/feed';
        } catch (err: any) {
            setError(err.message || 'Verification failed');
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setResendLoading(true);
        try {
            await authApi.sendVerificationOtp();
            alert('A new verification code has been sent to your email.');
        } catch (err: any) {
            setError(err.message || 'Failed to resend code');
        } finally {
            setResendLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-brand">
                    <img src="/logo.png" alt="StartupHub" className="auth-logo-img" />
                    <h1>StartupHub</h1>
                    <p>Connect. Build. Grow.</p>
                </div>

                <div className="auth-card card">
                    {verified && <div className="alert alert-success" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>Email Verified! Please log in.</div>}
                    {error && <div className="alert alert-error">{error}</div>}

                    {showVerification ? (
                        <>
                            <h2>Verify Your Email</h2>
                            <p className="auth-subtitle">We've sent a 6-digit code to <strong>{email}</strong></p>

                            <form onSubmit={handleVerifyOtp}>
                                <div className="form-group">
                                    <label htmlFor="otp">Verification Code</label>
                                    <input
                                        id="otp"
                                        type="text"
                                        className="form-input text-center text-2xl tracking-[1em]"
                                        placeholder="000000"
                                        maxLength={6}
                                        value={otp}
                                        onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                                        required
                                    />
                                </div>

                                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                                    {loading ? 'Verifying...' : 'Verify & Log In'}
                                </button>
                            </form>

                            <div className="text-center mt-6">
                                <p className="text-sm text-gray-500">Didn't receive the code?</p>
                                <button
                                    type="button"
                                    className="text-primary-color font-medium hover:underline disabled:opacity-50"
                                    onClick={handleResendOtp}
                                    disabled={resendLoading}
                                >
                                    {resendLoading ? 'Sending...' : 'Resend Code'}
                                </button>
                            </div>

                            <button
                                type="button"
                                className="btn btn-ghost btn-full mt-4"
                                onClick={() => setShowVerification(false)}
                            >
                                Back to Login
                            </button>
                        </>
                    ) : (
                        <>
                            <h2>Welcome Back</h2>
                            <p className="auth-subtitle">Log in to your account</p>

                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label htmlFor="login-email">Email</label>
                                    <input
                                        id="login-email"
                                        type="email"
                                        className="form-input"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        required
                                        autoComplete="email"
                                    />
                                </div>

                                <div className="form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label htmlFor="login-password">Password</label>
                                        <Link to="/forgot-password" style={{ fontSize: '0.85rem', color: 'var(--primary-color)' }}>Forgot Password?</Link>
                                    </div>
                                    <div className="password-wrapper relative">
                                        <input
                                            id="login-password"
                                            type={showPassword ? 'text' : 'password'}
                                            className="form-input"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            required
                                            autoComplete="current-password"
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                                            onClick={() => setShowPassword(!showPassword)}
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                </div>

                                <button type="submit" className="btn btn-primary btn-full" disabled={loading} id="login-submit">
                                    {loading ? 'Logging in...' : 'Log In'}
                                </button>
                            </form>
                        </>
                    )}

                    <p className="auth-footer text-center mt-4">
                        Don't have an account? <Link to="/register">Sign up</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
