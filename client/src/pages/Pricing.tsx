
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, paymentApi, settingsApi } from '../services/api';
import { Rocket, ShieldCheck, Gem, Check, CreditCard, ArrowRight, Zap, Star, RefreshCw } from 'lucide-react';

export default function Pricing() {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [price, setPrice] = useState(950);
    const [validity, setValidity] = useState(12);
    const [error, setError] = useState('');

    useEffect(() => {
        settingsApi.getPublic()
            .then(data => {
                setPrice(data.registration_payment_amount || 950);
            })
            .catch(() => { });

        // We don't have a public validity endpoint yet, but 12 is default
    }, []);

    const handleUpgrade = async () => {
        if (!user) {
            navigate('/login');
            return;
        }

        setLoading(true);
        setError('');

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
                    try {
                        await paymentApi.verifyUpgrade({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        });
                        await refreshUser();
                        navigate('/feed');
                    } catch (err: any) {
                        setError(err.message || 'Verification failed');
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
                    ondismiss: () => setLoading(false)
                }
            };

            const rzp = new (window as any).Razorpay(options);
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
                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '16px', letterSpacing: '-0.02em' }}>
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
                padding: '40px',
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
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>₹</span>
                            <span style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{price}</span>
                            <span style={{ color: 'var(--text-muted)' }}>/year</span>
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
                                'Priority Verification Badge',
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
