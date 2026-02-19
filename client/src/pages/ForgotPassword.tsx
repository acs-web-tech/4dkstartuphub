import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { request } from '../services/api';


const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            await request('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email }),
            });
            setMessage('If an account exists with this email, a password reset link has been sent.');
        } catch (err: any) {
            setError(err.message || 'Failed to send reset email.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-card card">
                    <Link to="/login" className="back-link" style={{ justifyContent: 'flex-start', marginTop: 0, marginBottom: '16px' }}>
                        <ArrowLeft size={18} />
                        Back to Login
                    </Link>
                    <h2 style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>Forgot Password</h2>
                    <p className="auth-subtitle">Enter your email address and we'll send you a link to reset your password.</p>

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
                            <label htmlFor="email">Email Address</label>
                            <input
                                id="email"
                                type="email"
                                className="form-input"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ marginTop: '16px' }}>
                            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send Reset Link'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
