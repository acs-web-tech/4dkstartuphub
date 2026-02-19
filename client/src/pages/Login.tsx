
import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Rocket, Eye, EyeOff } from 'lucide-react';

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            navigate('/feed');
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-brand">
                    <Rocket size={64} className="logo-icon-lg text-primary" />
                    <h1>StartupHub</h1>
                    <p>Connect. Build. Grow.</p>
                </div>

                <div className="auth-card card">
                    <h2>Welcome Back</h2>
                    <p className="auth-subtitle">Log in to your account</p>

                    {verified && <div className="alert alert-success" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>Email Verified! Please log in.</div>}
                    {error && <div className="alert alert-error">{error}</div>}

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

                    <p className="auth-footer text-center mt-4">
                        Don't have an account? <Link to="/register">Sign up</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
