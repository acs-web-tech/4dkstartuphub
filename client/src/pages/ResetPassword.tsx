import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { request } from '../services/api';


const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const email = searchParams.get('email');
    const navigate = useNavigate();

    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (password !== confirmPassword) {
            setError("Passwords don't match");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        const complexityCheck = /[A-Z]/.test(password) &&
            /[a-z]/.test(password) &&
            /[0-9]/.test(password) &&
            /[^A-Za-z0-9]/.test(password);

        if (!complexityCheck) {
            setError("Password must include uppercase, lowercase, number, and special character.");
            return;
        }

        if (!token && !otp) {
            setError("Invalid request. Missing token or OTP.");
            return;
        }

        setLoading(true);

        try {
            if (token) {
                // Legacy Link Flow
                await request('/auth/reset-password', {
                    method: 'POST',
                    body: JSON.stringify({ token, password }),
                });
            } else {
                // OTP Flow
                await request('/auth/reset-password-otp', {
                    method: 'POST',
                    body: JSON.stringify({ email, otp, password }),
                });
            }

            setMessage('Password reset successful! Redirecting to login...');
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to reset password.');
        } finally {
            setLoading(false);
        }
    };

    if (!token && !email) {
        return (
            <div className="auth-page">
                <div className="auth-container">
                    <div className="auth-card card" style={{ textAlign: 'center' }}>
                        <div className="alert alert-error" style={{ marginBottom: '16px' }}>Invalid access. Please request a reset code first.</div>
                        <Link to="/forgot-password" className="btn btn-primary btn-full">Request Code</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-card card">
                    <h2 style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>Reset Password</h2>
                    <p className="auth-subtitle">Enter your new password below.</p>

                    {message && (
                        <div className="alert alert-success" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '16px' }}>
                            {message}
                        </div>
                    )}

                    {error && (
                        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        {email && !token && (
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label htmlFor="otp">Verification Code (OTP)</label>
                                <input
                                    id="otp"
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter 6-digit code"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    required
                                    maxLength={6}
                                    style={{ letterSpacing: '2px', fontSize: '18px', textAlign: 'center' }}
                                />
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="password">New Password</label>
                            <div className="password-wrapper relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className="form-input"
                                    placeholder="Enter new password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
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
                            <div className="password-rules" style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                marginTop: '8px',
                                padding: '10px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '6px',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr'
                            }}>
                                <span style={{ color: password.length >= 8 ? '#10b981' : '' }}>• Min 8 chars</span>
                                <span style={{ color: /[A-Z]/.test(password) ? '#10b981' : '' }}>• Upper case</span>
                                <span style={{ color: /[a-z]/.test(password) ? '#10b981' : '' }}>• Lower case</span>
                                <span style={{ color: /[0-9]/.test(password) ? '#10b981' : '' }}>• Number</span>
                                <span style={{ color: /[^A-Za-z0-9]/.test(password) ? '#10b981' : '' }}>• Special char</span>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: '16px' }}>
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <input
                                id="confirmPassword"
                                type={showPassword ? "text" : "password"}
                                className="form-input"
                                placeholder="Confirm new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ marginTop: '20px' }}>
                            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Reset Password'}
                        </button>

                        <p className="auth-footer text-center mt-4">
                            <Link to="/login" style={{ color: 'var(--primary-color)' }}>
                                <ArrowLeft size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                                Back to Login
                            </Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
