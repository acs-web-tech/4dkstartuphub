import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { request } from '../services/api';
import '../styles/auth.css';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();

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

        if (password.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        if (!token) {
            setError("Invalid or missing reset token.");
            return;
        }

        setLoading(true);

        try {
            await request('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token, password }),
            });
            setMessage('Password reset successful! Redirecting to login...');
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to reset password. Link may be expired.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="error-message">Invalid or missing reset token. Please use the link sent to your email.</div>
                    <Link to="/forgot-password" className="btn-secondary" style={{ marginTop: '16px' }}>Request New Link</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>Reset Password</h1>
                    <p>Enter your new password below.</p>
                </div>

                {message && (
                    <div className="success-message" style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', borderRadius: '8px', marginBottom: '16px' }}>
                        {message}
                    </div>
                )}

                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="password">New Password</label>
                        <div className="input-wrapper">
                            <Lock size={20} />
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter new password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <div className="input-wrapper">
                            <Lock size={20} />
                            <input
                                id="confirmPassword"
                                type={showPassword ? "text" : "password"}
                                placeholder="Confirm new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Reset Password'}
                    </button>

                    <Link to="/login" className="back-link center">
                        <ArrowLeft size={16} style={{ marginRight: '8px' }} />
                        Back to Login
                    </Link>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;
