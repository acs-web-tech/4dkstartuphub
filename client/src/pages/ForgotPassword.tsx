import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
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
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <Link to="/login" className="back-link">
                        <ArrowLeft size={20} />
                        Back to Login
                    </Link>
                    <h1>Forgot Password</h1>
                    <p>Enter your email address and we'll send you a link to reset your password.</p>
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
                        <label htmlFor="email">Email Address</label>
                        <div className="input-wrapper">
                            <Mail size={20} />
                            <input
                                id="email"
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send Reset Link'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ForgotPassword;
