import { useState, useEffect } from 'react';
import { Lightbulb, Plus, Upload, Loader2, CheckCircle2, XCircle, Clock, FileText, Lock, CreditCard } from 'lucide-react';
import { pitchApi, uploadApi, paymentApi, settingsApi } from '../services/api';
import { PitchRequest } from '../types';
import { useAuth } from '../context/AuthContext';

declare global {
    interface Window {
        Razorpay: any;
    }
}

export default function PitchRequests() {
    const { user, refreshUser } = useAuth();
    const [tab, setTab] = useState<'my' | 'submit'>('my');
    const [pitches, setPitches] = useState<PitchRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [premiumBlocked, setPremiumBlocked] = useState(false);
    const [upgrading, setUpgrading] = useState(false);
    const [upgradePrice, setUpgradePrice] = useState(950);
    const [pitchCount, setPitchCount] = useState(0);
    const [pitchLimit, setPitchLimit] = useState(1);

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const isPremium = user?.role === 'admin' || user?.role === 'moderator' || (
        user?.paymentStatus?.toLowerCase() === 'completed' &&
        user?.premiumExpiry &&
        new Date(user.premiumExpiry) > new Date()
    );

    // Always load pitches on mount to pre-check quota
    useEffect(() => {
        loadPitches();
    }, []);

    useEffect(() => {
        if (tab === 'my') {
            loadPitches();
        }
    }, [tab]);

    useEffect(() => {
        settingsApi.getPublic().then(d => setUpgradePrice((d as any).pitch_request_payment_amount || 950));
    }, []);

    const loadPitches = () => {
        setLoading(true);
        setPremiumBlocked(false);
        pitchApi.getMyPitches()
            .then(data => {
                setPitches(data.pitches);
                setPitchCount(data.count || 0);
                setPitchLimit(data.limit || 0);

                // Proactive limit check: if limit > 0 and count >= limit, block submission
                // Proactive limit check: block everyone who hits their quota
                if (data.limit > 0 && data.count >= data.limit) {
                    setPremiumBlocked(true);
                }
            })
            .catch(err => {
                // Handle both text-based and status-based blocks
                if (err.status === 402 || err.message?.includes('Premium access required')) {
                    setPremiumBlocked(true);
                } else {
                    console.error(err);
                }
            })
            .finally(() => setLoading(false));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (selectedFile.size > 5 * 1024 * 1024) {
                setError('File size exceeds 5MB limit');
                e.target.value = '';
                return;
            }
            setError(''); // Clear error if any
            setFile(selectedFile);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!title.trim() || !description.trim()) {
            setError('Title and description are required');
            return;
        }

        setSubmitting(true);
        try {
            let deckUrl = '';
            if (file) {
                const uploadData = await uploadApi.upload(file);
                deckUrl = uploadData.url;
            }

            await pitchApi.submit({
                title: title.trim(),
                description: description.trim(),
                deckUrl: deckUrl || undefined
            });

            setMessage('Pitch request submitted successfully!');
            setTitle('');
            setDescription('');
            setFile(null);
            setTimeout(() => {
                setTab('my');
                setMessage('');
            }, 1500);
        } catch (err: any) {
            // Detect ALL forms of quota/premium blocks
            if (
                err.status === 402 ||
                err.message?.includes('Premium access required') ||
                err.message?.includes('Limit Reached') ||
                err.data?.code === 'LIMIT_REACHED' ||
                err.data?.code === 'PREMIUM_REQUIRED'
            ) {
                setPremiumBlocked(true);
                // Update count/limit from server response if available
                if (err.data?.count !== undefined) setPitchCount(err.data.count);
                if (err.data?.limit !== undefined) setPitchLimit(err.data.limit);
                setTab('my'); // Switch to show the gate
            } else {
                setError(err.message || 'Failed to submit pitch');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved':
                return <span className="status-badge active"><CheckCircle2 size={14} className="inline mr-1" /> Approved</span>;
            case 'disapproved':
                return <span className="status-badge inactive"><XCircle size={14} className="inline mr-1" /> Disapproved</span>;
            default:
                return <span className="status-badge pending"><Clock size={14} className="inline mr-1" /> Pending</span>;
        }
    };

    // Premium gate UI
    const handleUpgrade = async () => {
        setUpgrading(true);
        try {
            const order = await paymentApi.createOrder('upgrade');

            const options = {
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: 'StartupHub',
                description: `Premium Upgrade — ₹${upgradePrice}`,
                order_id: order.id,
                handler: async (response: any) => {
                    try {
                        await paymentApi.verifyUpgrade({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        });
                        await refreshUser();
                        setPremiumBlocked(false);
                        loadPitches();
                    } catch (err: any) {
                        alert('Upgrade failed: ' + err.message);
                    }
                },
                prefill: {
                    name: user?.displayName,
                    email: user?.email,
                },
                theme: {
                    color: '#6366f1',
                    backdrop_color: 'rgba(15, 15, 20, 0.85)',
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (response: any) => {
                alert(`Payment failed: ${response.error.description}`);
            });
            rzp.open();
        } catch (err: any) {
            alert('Failed to initiate upgrade: ' + err.message);
            setUpgrading(false);
        } finally {
            // Note: setUpgrading(false) is handled in callbacks or error
            // but we can set it false here if we want to reset button state after pop-up opens
            // Actually Razorpay opens in a modal, so we can keep spinning or stop.
            // Let's stop spinning when modal opens (or shortly after)
            setTimeout(() => setUpgrading(false), 2000);
        }
    };
    // Unified gate UI
    const renderPremiumGate = (isLimitGate = false) => (
        <div className="premium-gate">
            <div className="premium-gate-card card">
                <div className="premium-gate-icon">
                    {isLimitGate ? <XCircle size={48} color="var(--accent)" /> : (user?.paymentStatus?.toLowerCase() === 'expired' ? <XCircle size={48} color="var(--red)" /> : <Lock size={48} />)}
                </div>
                <h2>
                    {isLimitGate ? 'Pitch Limit Reached' : (user?.paymentStatus?.toLowerCase() === 'expired' ? 'Membership Expired' : 'Premium Feature')}
                </h2>
                <p className="premium-gate-desc">
                    {isLimitGate
                        ? `You have reached the limit of ${pitchLimit} pitch request${pitchLimit > 1 ? 's' : ''}. Upgrade or renew your plan to submit more.`
                        : (user?.paymentStatus?.toLowerCase() === 'expired'
                            ? 'Your premium membership has expired. Please renew your subscription to continue using pitch requests.'
                            : 'Pitch Requests are exclusively available to premium members. Upgrade your account to submit and manage pitch requests.')
                    }
                </p>
                <div className="premium-gate-features">
                    <div className="premium-feature-item"><CheckCircle2 size={16} /> <span>Submit unlimited pitch requests</span></div>
                    <div className="premium-feature-item"><CheckCircle2 size={16} /> <span>Get reviewed by community admins</span></div>
                    <div className="premium-feature-item"><CheckCircle2 size={16} /> <span>Attach pitch decks & documents</span></div>
                    <div className="premium-feature-item"><CheckCircle2 size={16} /> <span>Receive admin feedback & approval</span></div>
                </div>
                <button className="btn-premium w-full" onClick={handleUpgrade} disabled={upgrading}>
                    {upgrading ? (
                        <><Loader2 className="animate-spin inline mr-2" size={20} /> Processing...</>
                    ) : (
                        <><CreditCard className="inline mr-2" size={20} /> {user?.paymentStatus?.toLowerCase() === 'expired' ? 'Renew Premium' : 'Upgrade'} for ₹{upgradePrice}</>
                    )}
                </button>
            </div>
        </div>
    );

    // If generally not premium/expired, block whole page
    if (!isPremium) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1><Lightbulb className="inline-icon" size={28} /> Pitch Requests</h1>
                    <p className="page-subtitle">Submit your startup ideas for review</p>
                </div>
                {renderPremiumGate()}
            </div>
        );
    }

    const limitReached = premiumBlocked || (pitchLimit > 0 && pitchCount >= pitchLimit);

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Lightbulb className="inline-icon" size={28} /> Pitch Requests</h1>
                <p className="page-subtitle">Submit your startup ideas for review</p>
            </div>

            <div className="tabs-header mb-6">
                <button
                    className={`tab-btn ${tab === 'my' ? 'active' : ''}`}
                    onClick={() => setTab('my')}
                >
                    <FileText size={16} className="inline mr-2" /> My Requests
                </button>
                {!limitReached && (
                    <button
                        className={`tab-btn ${tab === 'submit' ? 'active' : ''}`}
                        onClick={() => setTab('submit')}
                    >
                        <Plus size={16} className="inline mr-2" /> New Pitch
                    </button>
                )}
            </div>

            {tab === 'my' ? (
                <div className="pitches-list">
                    {loading ? (
                        <div className="loading-container"><div className="spinner" /><p>Loading...</p></div>
                    ) : pitches.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon"><Lightbulb size={48} /></span>
                            <h2>No pitch requests yet</h2>
                            <p>Have a great idea? Submit a pitch request now!</p>
                            {!limitReached && (
                                <button className="btn btn-primary mt-4" onClick={() => setTab('submit')}>
                                    Create Pitch
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {pitches.map(pitch => (
                                <div key={pitch.id} className="card p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-xl font-semibold">{pitch.title}</h3>
                                        {getStatusBadge(pitch.status)}
                                    </div>
                                    <p className="text-gray-400 mb-4 whitespace-pre-wrap">{pitch.description}</p>

                                    {pitch.deckUrl && (
                                        <a
                                            href={pitch.deckUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center text-primary hover:underline mb-4"
                                        >
                                            <FileText size={16} className="mr-1" /> View Pitch Deck
                                        </a>
                                    )}

                                    {pitch.status !== 'pending' && pitch.adminMessage && (
                                        <div className={`mt-4 p-3 rounded bg-dark-lighter border ${pitch.status === 'approved' ? 'border-green-900' : 'border-red-900'}`}>
                                            <p className="text-sm font-semibold mb-1">
                                                Admin Feedback ({pitch.reviewerName}):
                                            </p>
                                            <p className="text-sm opacity-90">{pitch.adminMessage}</p>
                                        </div>
                                    )}

                                    <div className="text-xs text-gray-500 mt-4">
                                        Submitted on {new Date(pitch.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                limitReached ? renderPremiumGate(true) : (
                    <div className="max-w-2xl mx-auto">
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold mb-4">Submit a Pitch Request</h2>


                            {error && (
                                <div className="alert alert-danger mb-4">
                                    <XCircle size={16} className="inline mr-2" /> {error}
                                </div>
                            )}

                            {message && (
                                <div className="alert alert-success mb-4">
                                    <CheckCircle2 size={16} className="inline mr-2" /> {message}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                <div className="form-group mb-4">
                                    <label className="block mb-2 font-medium">Pitch Title</label>
                                    <input
                                        type="text"
                                        className="form-input w-full"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder="e.g., AI-Powered Logistics Platform"
                                        maxLength={200}
                                        required
                                    />
                                </div>

                                <div className="form-group mb-4">
                                    <label className="block mb-2 font-medium">Description</label>
                                    <textarea
                                        className="form-input w-full min-h-[150px]"
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Describe your idea in detail..."
                                        maxLength={5000}
                                        required
                                    />
                                </div>

                                <div className="form-group mb-6">
                                    <label className="block mb-2 font-medium">Pitch Deck (Optional)</label>
                                    <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer relative">
                                        <input
                                            type="file"
                                            onChange={handleFileChange}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            accept=".pdf,.ppt,.pptx,.doc,.docx"
                                        />
                                        <div className="pointer-events-none">
                                            <Upload size={32} className="mx-auto mb-2 text-gray-400" />
                                            <p className="text-sm text-gray-300">
                                                {file ? file.name : 'Click or drop file to upload (PDF, PPT, DOC)'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary w-full py-3 flex justify-center items-center"
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <><Loader2 size={20} className="animate-spin mr-2" /> Submitting...</>
                                    ) : (
                                        <><Plus size={20} className="mr-2" /> Submit Pitch Request</>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                ))}

        </div>
    );
}
