import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { request } from '../services/api';


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
            <div className="auth-page">
                <div className="auth-container">
                    <div className="auth-card card" style={{ textAlign: 'center' }}>
                        <div className="alert alert-error" style={{ marginBottom: '16px' }}>Invalid or missing reset token. Please use the link sent to your email.</div>
                        <Link to="/forgot-password" className="btn btn-primary btn-full">Request New Link</Link>
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
