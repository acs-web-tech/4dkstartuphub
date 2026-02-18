
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersApi, uploadApi } from '../services/api';
import {
    User, Camera, Pencil, Mail, MapPin, Globe, Briefcase, Twitter, Calendar, Save, CheckCircle, AlertCircle
} from 'lucide-react';
import { SmartImage } from '../components/Common/SmartImage';

export default function Profile() {
    const { user, refreshUser } = useAuth();
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

            // Check file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                setMessage('File size exceeds 5MB limit');
                return;
            }


            setUploading(true);
            setMessage('');

            try {
                // Uploading file...
                const data = await uploadApi.upload(file);
                // Upload response logged
                updateField('avatarUrl', data.url);
                // Avatar URL updated
            } catch (err: any) {
                console.error('❌ Avatar upload failed:', err);
                setMessage(err.message || 'Failed to upload avatar image');
            } finally {
                setUploading(false);
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
                        onClick={handleAvatarClick}
                        title={editing ? "Click to change avatar" : ""}
                        style={{ cursor: editing && !uploading ? 'pointer' : 'default', position: 'relative' }}
                    >
                        {(editing ? form.avatarUrl : user.avatarUrl) ? (
                            <SmartImage
                                src={editing ? form.avatarUrl : user.avatarUrl}
                                alt=""
                                style={uploading ? { opacity: 0.5 } : {}}
                            />
                        ) : (
                            <span>{initials}</span>
                        )}

                        {uploading && (
                            <div className="avatar-overlay" style={{ background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div className="spinner" style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                            </div>
                        )}

                        {editing && !uploading && (
                            <div className="avatar-overlay">
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
                    <div className="profile-info">
                        <h2>{user.displayName}</h2>
                        <span className="profile-username">@{user.username}</span>
                        <span className={`role-badge role-${user.role}`}>{user.role}</span>
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
                            {user.website && (
                                <div className="profile-meta-item">
                                    <span className="meta-label"><Globe size={16} /> Website</span>
                                    <a href={user.website} target="_blank" rel="noopener noreferrer">{user.website}</a>
                                </div>
                            )}
                            {user.linkedin && (
                                <div className="profile-meta-item">
                                    <span className="meta-label"><Briefcase size={16} /> LinkedIn</span>
                                    <span>{user.linkedin}</span>
                                </div>
                            )}
                            {user.twitter && (
                                <div className="profile-meta-item">
                                    <span className="meta-label"><Twitter size={16} /> Twitter</span>
                                    <span>{user.twitter}</span>
                                </div>
                            )}
                            <div className="profile-meta-item">
                                <span className="meta-label"><Calendar size={16} /> Joined</span>
                                <span>{new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
                            </div>
                        </div>
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
        </div>
    );
}
