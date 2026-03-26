
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, paymentApi, settingsApi, request } from '../services/api';
import { loadRazorpay } from '../utils/razorpay';
import { Rocket, Eye, EyeOff, Check, Circle, Building2, TrendingUp, CreditCard, Shield, RefreshCw, Wrench, Mail, Lock, User, CheckCircle, AlertCircle, Sparkles, Building, Briefcase, Zap, Info, ChevronRight, UserPlus } from 'lucide-react';
import { useModal } from '../context/ModalContext';

declare global {
    interface Window {
        Razorpay: any;
    }
}

type UserType = 'startup' | 'investor' | 'freelancer';

export default function Register() {
    const { register, user, loading: authLoading, refreshUser } = useAuth();
    const { alert, confirm } = useModal();
    const navigate = useNavigate();

    const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '', displayName: '' });
    const [userType, setUserType] = useState<UserType | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [step, setStep] = useState<'role' | 'details'>('role');
    const [verificationSent, setVerificationSent] = useState(false);
    const [otp, setOtp] = useState('');
    const [resendLoading, setResendLoading] = useState(false);

    // Clear stale auth tokens when visiting register page to prevent
    // old cookies from interfering with new registration OTP flow
    useEffect(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    }, []);

    // Redirect if already logged in
    useEffect(() => {
        if (!authLoading && user) {
            navigate('/feed', { replace: true });
        }
    }, [user, authLoading, navigate]);


    const updateField = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    if (authLoading) return <div className="loading-container"><div className="spinner" /></div>;
    if (user) return null;

    const passwordChecks = [
        { label: 'At least 8 characters', valid: form.password.length >= 8 },
        { label: 'One uppercase letter', valid: /[A-Z]/.test(form.password) },
        { label: 'One lowercase letter', valid: /[a-z]/.test(form.password) },
        { label: 'One number', valid: /[0-9]/.test(form.password) },
        { label: 'One special character', valid: /[^A-Za-z0-9]/.test(form.password) },
    ];

    const handleRoleSelect = (type: UserType) => {
        setUserType(type);
        setStep('details');
    };

    const handleDetailsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (!passwordChecks.every(c => c.valid)) {
            setError('Password does not meet requirements');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(form.username)) {
            setError('Username can only contain letters, numbers, and underscores');
            return;
        }

        setLoading(true);
        try {
            // Clear any old tokens before registering to prevent stale session issues
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');

            const res = await authApi.register({
                username: form.username,
                email: form.email,
                password: form.password,
                displayName: form.displayName,
                userType: userType as any,
            });

            // Store tokens — needed for OTP verification routes (authenticatePending)
            if (res.accessToken) {
                localStorage.setItem('access_token', res.accessToken);
            }
            if (res.refreshToken) {
                localStorage.setItem('refresh_token', res.refreshToken);
            }

            if (res.requireVerification) {
                setVerificationSent(true);
                setLoading(false);
                return;
            }

            window.location.href = '/feed';

        } catch (err: any) {
            setError(err.message || 'Registration failed');
            setLoading(false);
        }
    };

    // ── Resend & Verify OTP ─────────────────────────────────────
    const handleVerifyOtp = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await authApi.verifyEmailOtp(otp);
            if (res.accessToken) localStorage.setItem('access_token', res.accessToken);
            if (res.refreshToken) localStorage.setItem('refresh_token', res.refreshToken);

            await refreshUser();
            navigate('/feed');
        } catch (err: any) {
            if (err.message && err.message.includes('Already verified')) {
                await refreshUser();
                navigate('/feed');
            } else {
                setError(err.message || 'Verification failed');
                setLoading(false);
            }
        }
    };

    const handleResendOtp = async () => {
        setResendLoading(true);
        setError('');
        try {
            await authApi.sendVerificationOtp();
            await alert('A new verification code has been sent to your email.');
        } catch (err: any) {
            setError(err.message || 'Failed to resend verification code');
        } finally {
            setResendLoading(false);
        }
    };

    const stepIndicator = (
        <div className="register-steps">
            <div className={`register-step ${step === 'role' ? 'active' : 'done'}`}>
                <div className="step-dot">1</div>
                <span>Role</span>
            </div>
            <div className="step-line" />
            <div className={`register-step ${step === 'details' ? 'active' : ''}`}>
                <div className="step-dot">2</div>
                <span>Details</span>
            </div>
        </div>
    );

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-brand">
                    <img src="/logo.png" alt="StartupHub" className="auth-logo-img" />
                    <h1>StartupHub</h1>
                    <p>Join the startup community</p>
                </div>

                <div className="auth-card card">
                    <h2>Create Account</h2>
                    <p className="auth-subtitle">Start your entrepreneurial journey</p>

                    {stepIndicator}

                    {error && <div className="alert alert-error">{error}</div>}

                    {verificationSent ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                                <Check size={40} color="#10b981" />
                            </div>
                            <h3 style={{ marginBottom: '16px' }}>Verify your email</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                                We've sent a verification code to <strong>{form.email}</strong>.<br />
                                Please enter the code below to complete registration.
                            </p>

                            <div className="form-group" style={{ maxWidth: '300px', margin: '0 auto 24px' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter 6-digit OTP"
                                    value={otp}
                                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '20px' }}
                                    maxLength={6}
                                />
                            </div>

                            <button onClick={handleVerifyOtp} className="btn btn-primary" disabled={loading || otp.length < 6}>
                                {loading ? 'Verifying...' : 'Verify Email'}
                            </button>

                            <div style={{ textAlign: 'center', marginTop: '20px' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Didn't receive the code?</p>
                                <button
                                    type="button"
                                    onClick={handleResendOtp}
                                    disabled={resendLoading}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: '8px 16px',
                                        cursor: resendLoading ? 'not-allowed' : 'pointer',
                                        color: 'var(--accent)',
                                        fontWeight: 600,
                                        fontSize: '0.95rem',
                                        opacity: resendLoading ? 0.5 : 1,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                    }}
                                >
                                    {resendLoading ? (
                                        <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                                    ) : 'Resend Code'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>

                            {/* ── Step 1: Role Selection ──────────────────────── */}
                            {step === 'role' && (
                                <div className="role-selection">
                                    <p className="role-prompt">I am a…</p>
                                    <div className="role-cards">
                                        <button
                                            className={`role-card ${userType === 'startup' ? 'selected' : ''}`}
                                            onClick={() => handleRoleSelect('startup')}
                                            id="role-startup"
                                        >
                                            <div className="role-card-icon startup-icon">
                                                <Building2 size={32} />
                                            </div>
                                            <h3>Startup</h3>
                                            <p>I'm building a product, looking for investors, co-founders, or talent.</p>
                                            <span className="role-card-badge">Builder</span>
                                        </button>

                                        <button
                                            className={`role-card ${userType === 'investor' ? 'selected' : ''}`}
                                            onClick={() => handleRoleSelect('investor')}
                                            id="role-investor"
                                        >
                                            <div className="role-card-icon investor-icon">
                                                <TrendingUp size={32} />
                                            </div>
                                            <h3>Investor</h3>
                                            <p>I invest in startups, looking for the next big idea to fund.</p>
                                            <span className="role-card-badge">Backer</span>
                                        </button>

                                        <button
                                            className={`role-card ${userType === 'freelancer' ? 'selected' : ''}`}
                                            onClick={() => handleRoleSelect('freelancer')}
                                            id="role-freelancer"
                                        >
                                            <div className="role-card-icon freelancer-icon">
                                                <Wrench size={32} />
                                            </div>
                                            <h3>Freelancer</h3>
                                            <p>I offer specialized services to startups (Tech, Design, Marketing, etc).</p>
                                            <span className="role-card-badge">Freelancer</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Step 2: Details Form ────────────────────────── */}
                            {step === 'details' && (
                                <form onSubmit={handleDetailsSubmit}>
                                    <div className="form-group">
                                        <label htmlFor="reg-display">Display Name</label>
                                        <input id="reg-display" type="text" className="form-input" placeholder="Your full name"
                                            value={form.displayName} onChange={e => updateField('displayName', e.target.value)} required maxLength={50} />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="reg-username">Username</label>
                                        <input id="reg-username" type="text" className="form-input" placeholder="Choose a username"
                                            value={form.username} onChange={e => updateField('username', e.target.value)} required maxLength={30} />
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                            Letters, numbers, and underscores only
                                        </p>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="reg-email">Email</label>
                                        <input id="reg-email" type="email" className="form-input" placeholder="you@example.com"
                                            value={form.email} onChange={e => updateField('email', e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="reg-password">Password</label>
                                        <div style={{ position: 'relative' }}>
                                            <input id="reg-password" type={showPassword ? 'text' : 'password'} className="form-input" placeholder="Create a strong password"
                                                value={form.password} onChange={e => updateField('password', e.target.value)} required />
                                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                        <div className="password-checks">
                                            {passwordChecks.map((check, i) => (
                                                <div key={i} className={`pwd-check ${check.valid ? 'valid' : ''}`}>
                                                    {check.valid ? <Check size={12} className="inline mr-1" /> : <Circle size={12} className="inline mr-1" />}
                                                    {check.label}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="reg-confirm">Confirm Password</label>
                                        <input id="reg-confirm" type="password" className="form-input" placeholder="Repeat your password"
                                            value={form.confirmPassword} onChange={e => updateField('confirmPassword', e.target.value)} required />
                                    </div>

                                    <div className="form-actions-row">
                                        <button type="button" className="btn btn-ghost" onClick={() => setStep('role')}>← Back</button>
                                        <button type="submit" className="btn btn-primary" disabled={loading} id="register-details-submit">
                                            {loading ? 'Creating Account...' : 'Create Account'}
                                        </button>
                                    </div>
                                </form>
                            )}

                        </>
                    )}
                </div>

                <p className="auth-footer">
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
