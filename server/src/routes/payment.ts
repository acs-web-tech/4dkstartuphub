import { Router } from 'express';
import Razorpay from 'razorpay';
import { config } from '../config/env';
import Setting from '../models/Setting';
import User from '../models/User';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Initialize Razorpay only if keys are present
let razorpay: Razorpay | null = null;
if (config.razorpay.keyId && config.razorpay.keySecret) {
    razorpay = new Razorpay({
        key_id: config.razorpay.keyId,
        key_secret: config.razorpay.keySecret,
    });
}

// POST /api/payment/create-order
// Public: allowed for both new registration (no auth) and upgrades (auth handled in /upgrade)
router.post('/create-order', async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({ error: 'Payment gateway not configured' });
        }

        // Read dynamic price from settings
        const amountSetting = await Setting.findOne({ key: 'registration_payment_amount' });
        const amountInRupees = parseInt(amountSetting?.value || '950', 10);
        const amountInPaise = amountInRupees * 100;

        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        res.json({
            id: order.id,
            currency: order.currency,
            amount: order.amount,
            amountDisplay: amountInRupees,
            keyId: config.razorpay.keyId
        });
    } catch (error) {
        console.error('Razorpay order error:', error);
        res.status(500).json({ error: 'Failed to create payment order' });
    }
});

// POST /api/payment/upgrade
router.post('/upgrade', authenticate, async (req: AuthRequest, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing payment details' });
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', config.razorpay.keySecret || '');
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        // Securely update user status
        // Fetch membership validity setting
        const validitySetting = await Setting.findOne({ key: 'membership_validity_months' });
        const validityMonths = parseInt(validitySetting?.value || '12', 10);

        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + validityMonths);

        await User.findByIdAndUpdate(req.user!.userId, {
            payment_status: 'completed',
            razorpay_payment_id,
            razorpay_order_id,
            premium_expiry: expiryDate
        });

        console.log(`✅ User ${req.user!.userId} upgraded to Premium`);

        res.json({ success: true, message: 'Upgraded to Premium successfully' });
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ error: 'Failed to process upgrade' });
    }
});

export default router;
