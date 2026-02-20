
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, paymentApi, settingsApi, request } from '../services/api'; // user request imported
import { Rocket, Eye, EyeOff, Check, Circle, Building2, TrendingUp, CreditCard, Shield, RefreshCw, Wrench } from 'lucide-react';

declare global {
    interface Window {
        Razorpay: any;
    }
}

type UserType = 'startup' | 'investor' | 'freelancer';

export default function Register() {
    const { register, user, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    // Redirect if already logged in
    useEffect(() => {
        if (!authLoading && user) {
            navigate('/feed', { replace: true });
        }
    }, [user, authLoading, navigate]);

    if (authLoading) return <div className="loading-container"><div className="spinner" /></div>;
    const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '', displayName: '' });
    const [userType, setUserType] = useState<UserType | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [step, setStep] = useState<'role' | 'details' | 'payment'>('role');
    const [paymentRequired, setPaymentRequired] = useState<boolean | null>(null); // null = loading
    const [paymentAmount, setPaymentAmount] = useState(950);
    const [verificationSent, setVerificationSent] = useState(false);
    const [otp, setOtp] = useState('');

    // Fetch public settings on mount
    useEffect(() => {
        settingsApi.getPublic()
            .then(data => {
                setPaymentRequired(data.registration_payment_required);
                setPaymentAmount(data.registration_payment_amount || 950);
            })
            .catch(() => setPaymentRequired(true));
    }, []);

    const updateField = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

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

    const [savedOrder, setSavedOrder] = useState<{ orderId: string, keyId: string, amount: number, currency: string, userId: string } | null>(null);

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
            // Initiate Registration (check dupes + create pending user)
            const res = await authApi.initiateRegistration({
                username: form.username,
                email: form.email,
                password: form.password,
                displayName: form.displayName,
                userType: userType!,
            });

            // If payment NOT required (frontend logic based on response or settings)
            // My initiateRegistration logic returns `user` and `accessToken` if !paymentRequired
            // But types might need adjustment. Let's rely on `paymentRequired` state here or check existing res properties.
            if ((res as any).accessToken) {
                navigate('/feed');
                return;
            }

            if ((res as any).requireVerification) {
                setVerificationSent(true);
                setLoading(false);
                return;
            }

            // Payment IS required
            setSavedOrder(res);
            setLoading(false);
            setStep('payment');

        } catch (err: any) {
            setError(err.message || 'Registration failed');
            setLoading(false);
        }
    };

    const handlePayment = async () => {
        if (!savedOrder) {
            setError('Order details missing. Please go back and try again.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Step 2: Open Razorpay checkout using Saved Order
            const options = {
                key: savedOrder.keyId,
                amount: savedOrder.amount,
                currency: savedOrder.currency,
                name: 'StartupHub',
                description: `${userType === 'startup' ? 'Startup' : userType === 'investor' ? 'Investor' : 'Freelancer'} Registration — ₹${paymentAmount}`,
                order_id: savedOrder.orderId,
                handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                    try {
                        // Step 3: Finalize Registration
                        const res = await authApi.finalizeRegistration({
                            order_id: response.razorpay_order_id,
                            payment_id: response.razorpay_payment_id,
                            signature: response.razorpay_signature,
                        });

                        // Manually update auth context user if needed, or rely on page reload/navigation
                        // Since useAuth likely checks /me or token, we just navigate.

                        if (res.requireVerification) {
                            setVerificationSent(true);
                        } else {
                            // Force a reload or update context? 
                            // Usually navigate to feed is enough if tokens are set.
                            // But useAuth might need a trigger.
                            window.location.href = '/feed'; // distinct reload to pick up cookies
                        }
                    } catch (err: any) {
                        setError(err.message || 'Registration failed after payment');
                        setLoading(false);
                    }
                },
                prefill: {
                    name: form.displayName,
                    email: form.email,
                    contact: '', // Optional
                },
                theme: {
                    color: '#6366f1',
                    backdrop_color: 'rgba(15, 15, 20, 0.85)',
                },
                modal: {
                    ondismiss: () => {
                        setLoading(false);
                    },
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (response: any) => {
                setError(`Payment failed: ${response.error.description || 'Unknown error'}`);
                setLoading(false);
            });
            rzp.open();
        } catch (err: any) {
            setError(err.message || 'Failed to initiate payment');
            setLoading(false);
        }
    };

    // ── Resend & Verify OTP ─────────────────────────────────────
    const handleVerifyOtp = async () => {
        setLoading(true);
        setError('');
        try {
            await request('/auth/verify-email-otp', {
                method: 'POST',
                body: JSON.stringify({ otp })
            });
            window.location.href = '/feed';
        } catch (err: any) {
            if (err.message && err.message.includes('Already verified')) {
                window.location.href = '/feed';
            } else {
                setError(err.message || 'Verification failed');
                setLoading(false);
            }
        }
    };

    const handleResendOtp = async () => {
        try {
            await request('/auth/send-verification-otp', { method: 'POST' });
            alert('Code resent successfully');
        } catch (err) { }
    };

    // ── Step Indicator ──────────────────────────────────────────
    const totalSteps = paymentRequired ? 3 : 2;

    const stepIndicator = (
        <div className="register-steps">
            <div className={`register-step ${step === 'role' ? 'active' : 'done'}`}>
                <div className="step-dot">1</div>
                <span>Role</span>
            </div>
            <div className="step-line" />
            <div className={`register-step ${step === 'details' ? 'active' : (step === 'payment' ? 'done' : '')}`}>
                <div className="step-dot">2</div>
                <span>Details</span>
            </div>
            {paymentRequired && (
                <>
                    <div className="step-line" />
                    <div className={`register-step ${step === 'payment' ? 'active' : ''}`}>
                        <div className="step-dot">3</div>
                        <span>Payment</span>
                    </div>
                </>
            )}
        </div>
    );

    // Show loading while checking settings
    if (paymentRequired === null) {
        return (
            <div className="auth-page">
                <div className="auth-container">
                    <div className="auth-brand">
                        <Rocket size={64} className="logo-icon-lg text-primary" />
                        <h1>StartupHub</h1>
                        <p>Loading...</p>
                    </div>
                    <div className="loading-container"><div className="spinner" /></div>
                </div>
            </div>
        );
    }

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

                            <p style={{ marginTop: '20px', fontSize: '14px' }}>
                                <button className="btn btn-ghost" onClick={handleResendOtp} style={{ fontSize: '14px' }}>
                                    Resend Code
                                </button>
                            </p>
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
                                            {loading ? 'Creating Account...' : (paymentRequired ? 'Continue to Payment →' : 'Create Account')}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* ── Step 3: Payment (only if required) ──────────── */}
                            {step === 'payment' && paymentRequired && (
                                <div className="payment-step">
                                    <div className="payment-summary-card">
                                        <div className="payment-summary-header">
                                            <CreditCard size={20} /> Order Summary
                                        </div>
                                        <div className="payment-summary-body">
                                            <div className="payment-line">
                                                <span>Account Type</span>
                                                <span className="payment-type-badge">
                                                    {userType === 'startup' ? <Building2 size={14} /> : userType === 'investor' ? <TrendingUp size={14} /> : <Wrench size={14} />}
                                                    {userType === 'startup' ? 'Startup' : userType === 'investor' ? 'Investor' : 'Freelancer'}
                                                </span>
                                            </div>
                                            <div className="payment-line">
                                                <span>User</span>
                                                <span>{form.displayName} (@{form.username})</span>
                                            </div>
                                            <div className="payment-divider" />
                                            <div className="payment-line payment-total">
                                                <span>Registration Fee</span>
                                                <span className="payment-amount">₹{paymentAmount}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="payment-security">
                                        <Shield size={16} />
                                        <span>Secured by Razorpay — 256-bit encryption</span>
                                    </div>

                                    <div className="form-actions-row">
                                        <button type="button" className="btn btn-ghost" onClick={() => setStep('details')}>← Back</button>
                                        <button
                                            className="btn btn-primary btn-pay"
                                            onClick={handlePayment}
                                            disabled={loading}
                                            id="pay-and-register"
                                        >
                                            {loading ? 'Processing...' : `💳 Pay ₹${paymentAmount} & Register`}
                                        </button>
                                    </div>
                                </div>
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
