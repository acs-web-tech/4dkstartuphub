import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import PushSubscription from '../models/PushSubscription';
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

export default router;
