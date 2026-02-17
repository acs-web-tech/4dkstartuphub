import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import PushSubscription from '../models/PushSubscription';
import User from '../models/User';
import { config } from '../config/env';

const router = Router();

// GET /api/notifications/vapid-key — Get public VAPID key (Public)
router.get('/vapid-key', (req, res) => {
    res.json({ publicKey: config.vapid.publicKey });
});

// POST /api/notifications/subscribe — Save user push subscription
router.post('/subscribe', authenticate, async (req: AuthRequest, res) => {
    try {
        const { subscription, deviceType } = req.body;
        const userId = req.user!.userId;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription data' });
        }

        // Use update instead of create to avoid duplicates and update device info
        await PushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            {
                user_id: userId,
                subscription,
                device_type: deviceType || 'web'
            },
            { upsert: true, new: true }
        );

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Subscription error:', err);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// POST /api/notifications/unsubscribe — Remove user push subscription
router.post('/unsubscribe', authenticate, async (req: AuthRequest, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint is required' });
        }

        await PushSubscription.deleteOne({ 'subscription.endpoint': endpoint });
        res.json({ success: true });
    } catch (err) {
        console.error('Unsubscribe error:', err);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// POST /api/notifications/register-device — Save FCM token
router.post('/register-device', authenticate, async (req: AuthRequest, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        // Add token to user's set (avoid duplicates)
        await User.findByIdAndUpdate(req.user!.userId, {
            $addToSet: { fcm_tokens: token }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Device registration error:', err);
        res.status(500).json({ error: 'Failed to register device' });
    }
});

// POST /api/notifications/unregister-device — Remove FCM token
router.post('/unregister-device', authenticate, async (req: AuthRequest, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        await User.findByIdAndUpdate(req.user!.userId, {
            $pull: { fcm_tokens: token }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Device unregistration error:', err);
        res.status(500).json({ error: 'Failed to unregister device' });
    }
});

export default router;
