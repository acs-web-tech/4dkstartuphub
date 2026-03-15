
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersApi, uploadApi, authApi } from '../services/api';
import {
    User, Camera, Pencil, Mail, MapPin, Globe, Briefcase, Twitter, Calendar, Save, CheckCircle, AlertCircle, Eye, EyeOff, X
} from 'lucide-react';
import { validateFile } from '../utils/fileValidation';
import { getCdnUrl } from '../utils/cdn';

export default function Profile() {
    const { user, refreshUser } = useAuth();
    const [showAvatarViewer, setShowAvatarViewer] = useState(false);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        displayName: user?.displayName || '',
        bio: user?.bio || '',
        location: user?.location || '',
        website: user?.website || '',
        linkedin: user?.linkedin || '',
        twitter: user?.twitter || '',
        avatarUrl: user?.avatarUrl || '',
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [uploading, setUploading] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });
    const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync form state with user prop changes
    useEffect(() => {
        if (user) {
            setForm({
                displayName: user.displayName || '',
                bio: user.bio || '',
                location: user.location || '',
                website: user.website || '',
                linkedin: user.linkedin || '',
                twitter: user.twitter || '',
                avatarUrl: user.avatarUrl || '',
            });
        }
    }, [user]);

    const updateField = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleAvatarClick = () => {
        if (editing && !uploading && fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            try {
                validateFile(file, { allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] });
            } catch (err: any) {
                setMessage(err.message);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }


            setUploading(true);
            setMessage('');

            try {
                // Uploading file...
                const data = await uploadApi.upload(file, 'image');
                // Upload response logged
                updateField('avatarUrl', data.url);
                // Avatar URL updated
            } catch (err: any) {
                console.error('❌ Avatar upload failed:', err);
                setMessage(err.message || 'Failed to upload avatar image');
            } finally {
                setUploading(false);
                // Crucial fix: Reset the file input value so selecting the same file again triggers onChange
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');
        // Saving profile data
        try {
            await usersApi.updateProfile(form);

            await refreshUser();

            setEditing(false);
            setMessage('Profile updated successfully!');
        } catch (err: any) {
            console.error('❌ Profile update failed:', err);
            setMessage(err.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    // OTP verification state for password change
    const [passwordOtpStep, setPasswordOtpStep] = useState(false); // true = OTP input shown
    const [passwordOtp, setPasswordOtp] = useState('');
    const [otpResendTimer, setOtpResendTimer] = useState(0);
    const otpInputRef = useRef<HTMLInputElement>(null);

    // OTP resend countdown
    useEffect(() => {
        if (otpResendTimer <= 0) return;
        const t = setTimeout(() => setOtpResendTimer(prev => prev - 1), 1000);
        return () => clearTimeout(t);
    }, [otpResendTimer]);

    // Auto-focus OTP input when step changes
    useEffect(() => {
        if (passwordOtpStep && otpInputRef.current) {
            otpInputRef.current.focus();
        }
    }, [passwordOtpStep]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const { newPassword, confirmPassword } = passwordForm;

        // Comprehensive Validation
        if (newPassword !== confirmPassword) {
            setPasswordMessage({ text: 'New passwords do not match', type: 'error' });
            return;
        }

        if (newPassword.length < 8) {
            setPasswordMessage({ text: 'Password must be at least 8 characters long', type: 'error' });
            return;
        }

        const hasUpper = /[A-Z]/.test(newPassword);
        const hasLower = /[a-z]/.test(newPassword);
        const hasNumber = /[0-9]/.test(newPassword);
        const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

        if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
            setPasswordMessage({
                text: 'Password must include uppercase, lowercase, number, and special character.',
                type: 'error'
            });
            return;
        }

        setPasswordSaving(true);
        setPasswordMessage({ text: '', type: '' });

        try {
            const result = await authApi.changePassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            });

            if (result.otpRequired) {
                // Step 1 response — OTP sent to email
                setPasswordOtpStep(true);
                setPasswordOtp('');
                setOtpResendTimer(60); // 60s cooldown
                setPasswordMessage({ text: result.message || 'A verification code has been sent to your email.', type: 'success' });
            } else {
                // Direct success (shouldn't happen with new flow, but handle gracefully)
                setPasswordMessage({ text: 'Password updated successfully!', type: 'success' });
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setPasswordOtpStep(false);
                setPasswordOtp('');
            }
        } catch (err: any) {
            setPasswordMessage({ text: err.message || 'Failed to update password', type: 'error' });
        } finally {
            setPasswordSaving(false);
        }
    };

    const handleVerifyOtpAndChange = async (e: React.FormEvent) => {
        e.preventDefault();

        if (passwordOtp.length !== 6) {
            setPasswordMessage({ text: 'Please enter the 6-digit OTP from your email.', type: 'error' });
            return;
        }

        setPasswordSaving(true);
        setPasswordMessage({ text: '', type: '' });

        try {
            await authApi.changePassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword,
                otp: passwordOtp
            });
            setPasswordMessage({ text: 'Password updated successfully!', type: 'success' });
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setPasswordOtpStep(false);
            setPasswordOtp('');
        } catch (err: any) {
            setPasswordMessage({ text: err.message || 'OTP verification failed', type: 'error' });
        } finally {
            setPasswordSaving(false);
        }
    };

    const handleResendOtp = async () => {
        if (otpResendTimer > 0) return;
        setPasswordSaving(true);
        try {
            const result = await authApi.changePassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            });
            if (result.otpRequired) {
                setOtpResendTimer(60);
                setPasswordMessage({ text: 'A new verification code has been sent to your email.', type: 'success' });
            }
        } catch (err: any) {
            setPasswordMessage({ text: err.message || 'Failed to resend OTP', type: 'error' });
        } finally {
            setPasswordSaving(false);
        }
    };

    if (!user) return null;
    const initials = user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><User className="inline-icon" size={28} /> My Profile</h1>
            </div>

            {message && (
                <div className={`alert ${message.includes('success') ? 'alert-success' : 'alert-error'} flex items-center gap-2`}>
                    {message.includes('success') ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {message}
                </div>
            )}

            <div className="card profile-card">
                <div className="profile-header">
                    <div
                        className={`avatar avatar-xl ${editing ? 'avatar-editable' : ''}`}
                        onClick={() => {
                            if (editing && !uploading && fileInputRef.current) {
                                // Direct toggle to open file picker avoiding mobile "double-tap to hover" issue
                                fileInputRef.current.click();
                            } else if (!editing && user?.avatarUrl) {
                                setShowAvatarViewer(true);
                            }
                        }}
                        title={editing ? "Click to change avatar" : ""}
                        // Use cursor pointer to show it's clickable
                        style={{ cursor: (editing && !uploading) || (!editing && user?.avatarUrl) ? 'pointer' : 'default', position: 'relative' }}
                    >
                        {(editing ? form.avatarUrl : user.avatarUrl) ? <img src={getCdnUrl(editing ? form.avatarUrl : user.avatarUrl)} alt="" style={uploading ? { opacity: 0.5 } : {}} /> : <span>{initials}</span>}

                        {uploading && (
                            <div className="avatar-overlay" style={{ background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1 }}>
                                <div className="spinner" style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                            </div>
                        )}

                        {/* Always visible overlay on mobile/desktop whilst editing to avoid double-tap */}
                        {editing && !uploading && (
                            <div className="avatar-overlay" style={{ background: 'rgba(0,0,0,0.4)', opacity: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Camera size={24} color="white" />
                            </div>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </div>

                    {showAvatarViewer && user?.avatarUrl && (
                        <div 
                            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setShowAvatarViewer(false)}
                        >
                            <button 
                                style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', color: 'white', padding: '10px', cursor: 'pointer' }}
                                onClick={() => setShowAvatarViewer(false)}
                            >
                                <X size={24} />
                            </button>
                            <img 
                                src={getCdnUrl(user.avatarUrl)} 
                                alt="Profile Avatar" 
                                style={{ width: '300px', height: '300px', borderRadius: '50%', objectFit: 'cover', border: '4px solid white', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                    )}
                    <div className="profile-info">
                        <h2>{user.displayName}</h2>
                        <span className="profile-username">@{user.username}</span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <span className={`role-badge role-${user.role}`}>{user.role}</span>
                            {user.userType && (
                                <span className={`role-badge role-${user.userType}`} style={{
                                    background: user.userType === 'investor' ? 'rgba(96, 165, 250, 0.1)' :
                                        user.userType === 'startup' ? 'rgba(74, 222, 128, 0.1)' :
                                            'rgba(167, 139, 250, 0.1)',
                                    color: user.userType === 'investor' ? '#60a5fa' :
                                        user.userType === 'startup' ? '#4ade80' :
                                            '#a78bfa',
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    fontSize: '12px',
                                    fontWeight: '600'
                                }}>
                                    {user.userType === 'startup' ? '🚀 Startup' :
                                        user.userType === 'investor' ? '💰 Investor' :
                                            user.userType === 'freelancer' ? '🛠 Freelancer' : user.userType}
                                </span>
                            )}
                        </div>
                    </div>
                    <button className="btn btn-ghost" onClick={() => setEditing(!editing)} id="edit-profile-btn">
                        {editing ? 'Cancel' : <><Pencil size={16} /> Edit Profile</>}
                    </button>
                </div>

                {!editing ? (
                    <div className="profile-details">
                        {user.bio && <p className="profile-bio">{user.bio}</p>}
                        <div className="profile-meta-grid">
                            <div className="profile-meta-item">
                                <span className="meta-label"><Mail size={16} /> Email</span>
                                <span>{user.email}</span>
                            </div>
                            {user.location && (
                                <div className="profile-meta-item">
                                    <span className="meta-label"><MapPin size={16} /> Location</span>
                                    <span>{user.location}</span>
                                </div>
                            )}
                            <div className="profile-meta-item">
                                <span className="meta-label"><Calendar size={16} /> Joined</span>
                                <span>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'N/A'}</span>
                            </div>
                        </div>

                        {(user.website || user.linkedin || user.twitter) && (
                            <div className="profile-social-links" style={{
                                display: 'flex',
                                gap: '12px',
                                marginTop: '24px',
                                flexWrap: 'wrap',
                                borderTop: '1px solid var(--border)',
                                paddingTop: '20px'
                            }}>
                                {user.website && (
                                    <a href={user.website.startsWith('http') ? user.website : `https://${user.website}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="social-btn website-btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: '20px', color: 'var(--text-primary)', textDecoration: 'none', transition: 'all 0.2s', border: '1px solid var(--border)' }}
                                    >
                                        <Globe size={16} /> <span style={{ fontSize: '14px', fontWeight: '500' }}>Website</span>
                                    </a>
                                )}
                                {user.linkedin && (
                                    <a href={user.linkedin.startsWith('http') ? user.linkedin : `https://${user.linkedin}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="social-btn linkedin-btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(10, 102, 194, 0.1)', borderRadius: '20px', color: '#0a66c2', textDecoration: 'none', transition: 'all 0.2s', border: '1px solid rgba(10, 102, 194, 0.2)' }}
                                    >
                                        <Briefcase size={16} /> <span style={{ fontSize: '14px', fontWeight: '500' }}>LinkedIn</span>
                                    </a>
                                )}
                                {user.twitter && (
                                    <a href={user.twitter.startsWith('http') ? user.twitter : `https://twitter.com/${user.twitter.replace('@', '')}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="social-btn twitter-btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(29, 155, 240, 0.1)', borderRadius: '20px', color: '#1d9bf0', textDecoration: 'none', transition: 'all 0.2s', border: '1px solid rgba(29, 155, 240, 0.2)' }}
                                    >
                                        <Twitter size={16} /> <span style={{ fontSize: '14px', fontWeight: '500' }}>Twitter</span>
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <form className="profile-edit-form" onSubmit={handleSave}>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="edit-displayname">Display Name</label>
                                <input id="edit-displayname" type="text" className="form-input" value={form.displayName}
                                    onChange={e => updateField('displayName', e.target.value)} minLength={2} maxLength={50} required />
                            </div>
                            <div className="form-group">
                                <label htmlFor="edit-location">Location</label>
                                <input id="edit-location" type="text" className="form-input" placeholder="Chennai, India"
                                    value={form.location} onChange={e => updateField('location', e.target.value)} maxLength={100} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="edit-bio">Bio</label>
                            <textarea id="edit-bio" className="form-input" placeholder="Tell us about yourself..."
                                value={form.bio} onChange={e => updateField('bio', e.target.value)} maxLength={500} rows={4} />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="edit-website">Website</label>
                                <input id="edit-website" type="url" className="form-input" placeholder="https://..."
                                    value={form.website} onChange={e => updateField('website', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="edit-linkedin">LinkedIn</label>
                                <input id="edit-linkedin" type="text" className="form-input" placeholder="linkedin.com/in/..."
                                    value={form.linkedin} onChange={e => updateField('linkedin', e.target.value)} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="edit-twitter">Twitter / X</label>
                            <input id="edit-twitter" type="text" className="form-input" placeholder="@username"
                                value={form.twitter} onChange={e => updateField('twitter', e.target.value)} />
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={saving || uploading} id="save-profile-btn">
                                {(saving || uploading) ? (uploading ? 'Uploading...' : 'Saving...') : <><Save size={18} className="inline mr-1" /> Save Changes</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            <div className="card" style={{ marginTop: '24px' }}>
                <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Save size={20} /> Security Settings
                </h3>

                {passwordMessage.text && (
                    <div className={`alert ${passwordMessage.type === 'success' ? 'alert-success' : 'alert-error'} flex items-center gap-2`} style={{ marginBottom: '20px' }}>
                        {passwordMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                        {passwordMessage.text}
                    </div>
                )}

                {!passwordOtpStep ? (
                    /* ── STEP 1: Password Form ── */
                    <form className="profile-edit-form" onSubmit={handleChangePassword}>
                        <div className="form-group">
                            <label htmlFor="current-password">Current Password</label>
                            <div className="relative" style={{ position: 'relative' }}>
                                <input
                                    id="current-password"
                                    type={showPasswords.current ? "text" : "password"}
                                    className="form-input"
                                    value={passwordForm.currentPassword}
                                    onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle absolute right-3 top-3"
                                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}
                                >
                                    {showPasswords.current ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                        <div className="form-row" style={{ gap: '20px' }}>
                            <div className="form-group">
                                <label htmlFor="new-password">New Password</label>
                                <div className="relative" style={{ position: 'relative' }}>
                                    <input
                                        id="new-password"
                                        type={showPasswords.new ? "text" : "password"}
                                        className="form-input"
                                        value={passwordForm.newPassword}
                                        onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle absolute right-3 top-3"
                                        onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}
                                    >
                                        {showPasswords.new ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="confirm-password">Confirm New Password</label>
                                <div className="relative" style={{ position: 'relative' }}>
                                    <input
                                        id="confirm-password"
                                        type={showPasswords.confirm ? "text" : "password"}
                                        className="form-input"
                                        value={passwordForm.confirmPassword}
                                        onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle absolute right-3 top-3"
                                        onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}
                                    >
                                        {showPasswords.confirm ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="password-rules" style={{
                            fontSize: '12.5px',
                            color: 'var(--text-muted)',
                            marginTop: '8px',
                            padding: '12px',
                            background: 'var(--bg-secondary)',
                            borderRadius: '8px',
                            borderLeft: '3px solid var(--accent)'
                        }}>
                            <p style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' }}>Password Requirements:</p>
                            <ul style={{ listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '4px' }}>
                                <li style={{ color: passwordForm.newPassword.length >= 8 ? 'var(--green)' : '' }}>• Min 8 characters</li>
                                <li style={{ color: /[A-Z]/.test(passwordForm.newPassword) ? 'var(--green)' : '' }}>• One uppercase</li>
                                <li style={{ color: /[a-z]/.test(passwordForm.newPassword) ? 'var(--green)' : '' }}>• One lowercase</li>
                                <li style={{ color: /[0-9]/.test(passwordForm.newPassword) ? 'var(--green)' : '' }}>• One number</li>
                                <li style={{ color: /[^A-Za-z0-9]/.test(passwordForm.newPassword) ? 'var(--green)' : '' }}>• One special char</li>
                            </ul>
                        </div>

                        <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: '24px' }}>
                            <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
                                {passwordSaving ? 'Verifying...' : <><Mail size={16} className="inline mr-1" /> Verify & Update Password</>}
                            </button>
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>
                            🔒 For security, a one-time verification code will be sent to your registered email before the password is changed.
                        </p>
                    </form>
                ) : (
                    /* ── STEP 2: OTP Verification ── */
                    <form className="profile-edit-form" onSubmit={handleVerifyOtpAndChange}>
                        <div style={{
                            padding: '24px',
                            background: 'var(--bg-secondary)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            textAlign: 'center'
                        }}>
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <Mail size={28} color="white" />
                            </div>
                            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>Email Verification Required</h4>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                                We've sent a 6-digit verification code to <strong>{user.email}</strong>. Enter it below to confirm your password change.
                            </p>

                            <div className="form-group" style={{ maxWidth: '260px', margin: '0 auto' }}>
                                <input
                                    ref={otpInputRef}
                                    id="password-change-otp"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    className="form-input"
                                    style={{
                                        textAlign: 'center',
                                        fontSize: '1.8rem',
                                        fontWeight: 800,
                                        letterSpacing: '8px',
                                        padding: '16px',
                                        fontFamily: 'monospace',
                                    }}
                                    placeholder="••••••"
                                    value={passwordOtp}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                        setPasswordOtp(val);
                                    }}
                                    maxLength={6}
                                    autoComplete="one-time-code"
                                    required
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                                <button type="submit" className="btn btn-primary" disabled={passwordSaving || passwordOtp.length !== 6}>
                                    {passwordSaving ? 'Verifying...' : <><CheckCircle size={16} className="inline mr-1" /> Confirm Change</>}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => {
                                        setPasswordOtpStep(false);
                                        setPasswordOtp('');
                                        setPasswordMessage({ text: '', type: '' });
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>

                            <div style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Didn't receive the code?{' '}
                                {otpResendTimer > 0 ? (
                                    <span>Resend in <strong>{otpResendTimer}s</strong></span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResendOtp}
                                        disabled={passwordSaving}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, padding: 0, textDecoration: 'underline' }}
                                    >
                                        Resend Code
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
