
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, paymentApi, settingsApi } from '../services/api';
import { loadRazorpay } from '../utils/razorpay';
import { Rocket, ShieldCheck, Gem, Check, CreditCard, ArrowRight, Zap, Star, RefreshCw, AlertTriangle } from 'lucide-react';

export default function Pricing() {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [price, setPrice] = useState(950);
    const [validity, setValidity] = useState(12);
    const [error, setError] = useState('');
    // Store payment details for retry verification
    const pendingPaymentRef = useRef<{ razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string } | null>(null);
    const [showVerifyButton, setShowVerifyButton] = useState(false);

    useEffect(() => {
        settingsApi.getPublic()
            .then(data => {
                setPrice(data.registration_payment_amount || 950);
            })
            .catch(() => { });

        // Restore pending payment details from localStorage (survives page refresh)
        try {
            const stored = localStorage.getItem('pending_upgrade_payment');
            if (stored) {
                const parsed = JSON.parse(stored);
                pendingPaymentRef.current = parsed;
                setShowVerifyButton(true);
            }
        } catch { /* ignore parse errors */ }

        // Server-side safety net: auto-check if a payment was captured but not verified
        if (user) {
            paymentApi.verifyPaymentStatus()
                .then(result => {
                    if (result.status === 'completed') {
                        // Payment was already captured — clear any stale data and redirect
                        localStorage.removeItem('pending_upgrade_payment');
                        pendingPaymentRef.current = null;
                        setShowVerifyButton(false);
                        refreshUser().then(() => navigate('/feed'));
                    }
                })
                .catch(() => { /* silent — non-critical check */ });
        }
    }, []);

    // Verify payment with stored details (retry-safe)
    const verifyPayment = async () => {
        const details = pendingPaymentRef.current;
        if (!details) {
            // Fallback: try server-side verify
            setVerifying(true);
            setError('');
            try {
                const result = await paymentApi.verifyPaymentStatus();
                if (result.status === 'completed') {
                    localStorage.removeItem('pending_upgrade_payment');
                    setShowVerifyButton(false);
                    await refreshUser();
                    navigate('/feed');
                    return;
                }
            } catch { /* ignore */ }
            setVerifying(false);
            setError('No payment details found. Please try paying again.');
            setShowVerifyButton(false);
            return;
        }

        setVerifying(true);
        setError('');

        try {
            await paymentApi.verifyUpgrade(details);
            pendingPaymentRef.current = null;
            localStorage.removeItem('pending_upgrade_payment');
            setShowVerifyButton(false);
            await refreshUser();
            navigate('/feed');
        } catch (err: any) {
            // Signature verify failed — try server-side direct check as fallback
            try {
                const result = await paymentApi.verifyPaymentStatus();
                if (result.status === 'completed') {
                    localStorage.removeItem('pending_upgrade_payment');
                    pendingPaymentRef.current = null;
                    setShowVerifyButton(false);
                    await refreshUser();
                    navigate('/feed');
                    return;
                }
            } catch { /* ignore fallback error */ }
            setError(err.message || 'Verification failed. Please try again or contact support.');
        } finally {
            setVerifying(false);
        }
    };

    const handleUpgrade = async () => {
        if (!user) {
            navigate('/login');
            return;
        }

        setLoading(true);
        setError('');
        setShowVerifyButton(false);

        try {
            const order = await paymentApi.createOrder('upgrade');

            const options = {
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: '4DK StartupHub',
                description: 'Premium Membership Upgrade',
                order_id: order.id,
                handler: async (response: any) => {
                    // Store payment details immediately for retry safety
                    const paymentDetails = {
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                    };
                    pendingPaymentRef.current = paymentDetails;
                    // Persist to localStorage so it survives page refresh
                    try { localStorage.setItem('pending_upgrade_payment', JSON.stringify(paymentDetails)); } catch {}

                    try {
                        await paymentApi.verifyUpgrade(paymentDetails);
                        pendingPaymentRef.current = null;
                        localStorage.removeItem('pending_upgrade_payment');
                        setShowVerifyButton(false);
                        await refreshUser();
                        navigate('/feed');
                    } catch (err: any) {
                        // Payment succeeded at Razorpay but our verify call failed
                        // Show verify button so user can retry
                        setError(err.message || 'Payment completed but verification failed. Please click "Verify Payment" to complete.');
                        setShowVerifyButton(true);
                        setLoading(false);
                    }
                },
                prefill: {
                    name: user.displayName,
                    email: user.email,
                },
                theme: {
                    color: '#3b82f6',
                },
                modal: {
                    ondismiss: () => {
                        setLoading(false);
                    }
                }
            };

            const isLoaded = await loadRazorpay();
            if (!isLoaded) {
                throw new Error('Are you online? Razorpay SDK failed to load');
            }

            const rzp = new (window as any).Razorpay(options);
            rzp.on('payment.failed', (response: any) => {
                setError(`Payment failed: ${response.error?.description || 'Unknown error'}. Please try again.`);
                setLoading(false);
            });
            rzp.open();
        } catch (err: any) {
            setError(err.message || 'Failed to initiate payment');
            setLoading(false);
        }
    };

    return (
        <div className="pricing-page" style={{
            minHeight: 'calc(100vh - var(--header-h))',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            background: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.05), transparent), radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.05), transparent)'
        }}>
            <div className="pricing-header" style={{ textAlign: 'center', marginBottom: '48px', maxWidth: '600px' }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    background: 'var(--accent-soft)',
                    borderRadius: '100px',
                    color: 'var(--accent)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '16px',
                    border: '1px solid var(--accent-border)'
                }}>
                    <Zap size={14} /> UNLOCK FULL POWER
                </div>
                <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.5rem)', fontWeight: 800, marginBottom: '16px', letterSpacing: '-0.02em' }}>
                    Join the Elite <span className="text-gradient">Startup</span> Community
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                    Access exclusive investor networks, pitch requests, and premium chat rooms. One-time payment for long-term growth.
                </p>
            </div>

            {error && (
                <div className="alert alert-danger" style={{ marginBottom: '24px', maxWidth: '400px', width: '100%' }}>
                    {error}
                </div>
            )}

            <div className="pricing-card" style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--accent-border)',
                borderRadius: '24px',
                padding: 'clamp(24px, 5vw, 40px)',
                width: '100%',
                maxWidth: '440px',
                position: 'relative',
                boxShadow: 'var(--shadow-accent)',
                overflow: 'hidden'
            }}>
                {/* Decorative background pulse */}
                <div style={{
                    position: 'absolute',
                    top: '-50px',
                    right: '-50px',
                    width: '150px',
                    height: '150px',
                    background: 'var(--accent)',
                    filter: 'blur(80px)',
                    opacity: 0.2,
                    zIndex: 0
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '4px' }}>Premium Access</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>The standard for professionals</p>
                        </div>
                        <div style={{ background: 'var(--bg-tertiary)', padding: '10px', borderRadius: '12px' }}>
                            <Gem size={28} className="text-primary" style={{ color: 'var(--accent)' }} />
                        </div>
                    </div>

                    <div style={{ marginBottom: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 'clamp(1rem, 3vw, 1.2rem)', fontWeight: 600, color: 'var(--text-secondary)' }}>₹</span>
                            <span style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{price}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.8rem, 2.5vw, 1rem)' }}>/year</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 600, marginTop: '4px' }}>
                            Best Value for Startups
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '32px', marginBottom: '32px' }}>
                        <ul style={{ listStyle: 'none' }}>
                            {[
                                'Direct Pitch Requests to Investors',
                                'Access to All Premium Chat Rooms',
                                'Exclusive Networking Opportunities',
                                'Early Access to Events & Meetups',
                                '24/7 Priority Support'
                            ].map((feature, i) => (
                                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', fontSize: '0.95rem' }}>
                                    <div style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        background: 'var(--green)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <Check size={12} color="white" strokeWidth={3} />
                                    </div>
                                    {feature}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {showVerifyButton ? (
                        <button
                            onClick={verifyPayment}
                            disabled={verifying}
                            className="btn btn-primary"
                            style={{
                                width: '100%',
                                padding: '16px',
                                fontSize: '1.1rem',
                                fontWeight: 700,
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                boxShadow: '0 8px 20px -6px rgba(16, 185, 129, 0.5)',
                                background: 'linear-gradient(135deg, #10b981, #059669)'
                            }}
                        >
                            {verifying ? (
                                <><RefreshCw className="spinner" size={20} /> Verifying Payment...</>
                            ) : (
                                <><AlertTriangle size={20} /> Verify Payment <ArrowRight size={18} /></>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={handleUpgrade}
                            disabled={loading}
                            className="btn btn-primary"
                            style={{
                                width: '100%',
                                padding: '16px',
                                fontSize: '1.1rem',
                                fontWeight: 700,
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                boxShadow: '0 8px 20px -6px rgba(59, 130, 246, 0.5)'
                            }}
                        >
                            {loading ? (
                                <><RefreshCw className="spinner" size={20} /> Processing...</>
                            ) : (
                                <><CreditCard size={20} /> Pay Once, Access All <ArrowRight size={18} /></>
                            )}
                        </button>
                    )}

                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '20px' }}>
                        Secure payment powered by Razorpay. 100% encryption.
                    </p>
                </div>
            </div>

            <div style={{ marginTop: '48px', display: 'flex', gap: '40px', color: 'var(--text-muted)', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={18} /> Secure Checkout
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Rocket size={18} /> Multi-platform Access
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Star size={18} /> Highly Rated
                </div>
            </div>
        </div>
    );
}
