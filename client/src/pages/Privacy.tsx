
import { Shield, Lock, Eye, FileText, Mail, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Privacy() {
    const navigate = useNavigate();

    return (
        <div className="page-container" style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate(-1)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer'
                    }}
                >
                    <ArrowLeft size={18} /> Back
                </button>
            </div>

            <div className="card" style={{ padding: '60px', borderRadius: '24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'var(--accent-gradient)'
                }} />
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        backgroundColor: 'var(--primary-light)',
                        color: 'var(--primary)',
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px'
                    }}>
                        <Shield size={32} />
                    </div>
                    <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>Privacy Policy</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Last updated: February 20, 2026</p>
                </div>

                <div className="prose" style={{ color: 'var(--text-main)', lineHeight: '1.8' }}>
                    <p>At <strong>4DK StartupHub</strong>, we take your privacy seriously. This policy describes how we collect, use, and protect your personal information.</p>

                    <h2 style={{ fontSize: '20px', fontWeight: '700', marginTop: '32px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Lock size={20} className="text-primary" /> 1. Information We Collect
                    </h2>
                    <p>We collect information that you provide directly to us when you create an account, such as your name, email address, bio, and professional links. We also collect data related to your pitches and interactions on the platform.</p>

                    <h2 style={{ fontSize: '20px', fontWeight: '700', marginTop: '32px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Eye size={20} className="text-primary" /> 2. How We Use Your Data
                    </h2>
                    <p>Your data is used to provide and improve our services, facilitate connections between startups and investors, and send important updates about your account or activity on the platform.</p>

                    <h2 style={{ fontSize: '20px', fontWeight: '700', marginTop: '32px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={20} className="text-primary" /> 3. Data Protection
                    </h2>
                    <p>We implement industry-standard security measures to safeguard your personal information. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>

                    <h2 style={{ fontSize: '20px', fontWeight: '700', marginTop: '32px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={20} className="text-primary" /> 4. Third-Party Services
                    </h2>
                    <p>We use Razorpay for payment processing. Your payment details are handled securely by them and never stored on our servers.</p>

                    <h2 style={{ fontSize: '20px', fontWeight: '700', marginTop: '32px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mail size={20} className="text-primary" /> 5. Contact Us
                    </h2>
                    <p>If you have any questions about this Privacy Policy, please contact us at:</p>
                    <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', marginTop: '16px' }}>
                        <p style={{ margin: 0 }}><strong>Email:</strong> support@4dk.in</p>
                        <p style={{ margin: 0 }}><strong>Founder:</strong> founder@4dk.in</p>
                    </div>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '40px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                &copy; 2026 4DK Software Solutions. All rights reserved.
            </div>
        </div>
    );
}
