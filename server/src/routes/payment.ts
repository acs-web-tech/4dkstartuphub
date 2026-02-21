import { Router } from 'express';
import Razorpay from 'razorpay';
import { config } from '../config/env';
import Setting from '../models/Setting';
import User from '../models/User';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';

import { emailService } from '../services/email';

const router = Router();

// Initialize Razorpay only if keys are present
let razorpay: Razorpay | null = null;
if (config.razorpay.keyId && config.razorpay.keySecret) {
    razorpay = new Razorpay({
        key_id: config.razorpay.keyId,
        key_secret: config.razorpay.keySecret,
    });
}

// ... existing routes ...

// POST /api/payment/webhook
router.post('/webhook', async (req, res) => {
    try {
        // Basic signature check existence
        const signature = req.headers['x-razorpay-signature'];
        if (!signature) return res.status(400).json({ error: 'Missing signature' });

        const { event, payload } = req.body;

        if (event === 'payment.captured') {
            const payment = payload.payment.entity;
            const orderId = payment.order_id;
            const paymentId = payment.id;

            // Robust Verification: Fetch from Razorpay to confirm status
            if (razorpay) {
                const fetchedPayment = await razorpay.payments.fetch(paymentId);
                if (fetchedPayment.status !== 'captured' || fetchedPayment.order_id !== orderId) {
                    console.error('❌ Webhook verification failed: Payment status mismatch');
                    res.status(400).json({ error: 'Invalid payment state' });
                    return;
                }
            }

            const user = await User.findOne({ razorpay_order_id: orderId });

            if (user && user.payment_status !== 'completed') {
                const validitySetting = await Setting.findOne({ key: 'membership_validity_months' });
                const validityMonths = parseInt(validitySetting?.value || '12', 10);
                const expiryDate = new Date();
                expiryDate.setMonth(expiryDate.getMonth() + validityMonths);

                user.payment_status = 'completed';
                user.razorpay_payment_id = paymentId;
                user.premium_expiry = expiryDate;
                user.pitch_limit_reset_date = new Date();
                user.is_active = true;
                // Auto-verify email on payment to reduce friction? 
                // Let's keep existing flow: if they need verification, they can do it.
                // But user requested "should register him... miss him". 
                // If I leave is_email_verified as false (from init), they can login but might be blocked?
                // auth.ts:348 blocks login if verification required & not verified.
                // I will auto-verify email on successful payment to ensure immediate access.
                user.is_email_verified = true;
                user.email_verification_token = undefined;

                await user.save();

                try {
                    await emailService.sendWelcomeEmail(user.email, user.display_name);
                } catch (e) {
                    console.error('Webhook welcome email failed', e);
                }

                console.log(`✅ Webhook: User ${user.email} activated successfully via payment ${paymentId}`);
            }
        }

        if (event === 'payment.failed') {
            const payment = payload.payment.entity;
            const orderId = payment.order_id;
            const user = await User.findOne({ razorpay_order_id: orderId });
            if (user) {
                await emailService.sendPaymentFailedEmail(user.email, user.display_name, orderId);
                console.log(`❌ Webhook: Payment failed for user ${user.email} (Order: ${orderId})`);
            }
        }

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// POST /api/payment/create-order
router.post('/create-order', async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({ error: 'Payment gateway not configured' });
        }

        // Read dynamic price from settings
        const { type } = req.body;
        let amountSetting;

        if (type === 'upgrade') {
            amountSetting = await Setting.findOne({ key: 'pitch_request_payment_amount' });
        } else {
            amountSetting = await Setting.findOne({ key: 'registration_payment_amount' });
        }

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
            premium_expiry: expiryDate,
            pitch_limit_reset_date: new Date()
        });

        console.log(`✅ User ${req.user!.userId} upgraded to Premium`);

        res.json({ success: true, message: 'Upgraded to Premium successfully' });
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ error: 'Failed to process upgrade' });
    }
});

export default router;
