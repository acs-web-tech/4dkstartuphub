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
        // Verify webhook signature to prevent forged events
        const signature = req.headers['x-razorpay-signature'] as string;
        if (!signature) return res.status(400).json({ error: 'Missing signature' });

        // Cryptographic verification: compute expected signature from raw body
        const webhookSecret = config.razorpay.webhookSecret;
        if (webhookSecret) {
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (expectedSignature !== signature) {
                console.warn('❌ Webhook signature mismatch — possible forged event');
                return res.status(400).json({ error: 'Invalid webhook signature' });
            }
        } else {
            console.warn('⚠️ RAZORPAY_WEBHOOK_SECRET not configured — webhook signature verification skipped');
            if (process.env.NODE_ENV === 'production') {
                return res.status(500).json({ error: 'Webhook secret not configured in production' });
            }
        }

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

            if (user && user.payment_status === 'pending') {
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

                await user.save({ validateModifiedOnly: true });

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
router.post('/create-order', authenticate, async (req: AuthRequest, res) => {
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

        // For upgrade orders, save the order_id on the user so verify-status can find it later
        if (type === 'upgrade' && req.user?.userId) {
            await User.findByIdAndUpdate(req.user.userId, {
                razorpay_order_id: order.id,
            });
        }

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

        // SECURITY 1: Verify the order_id matches the one WE created for THIS user
        const user = await User.findById(req.user!.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.razorpay_order_id !== razorpay_order_id) {
            console.warn(`⚠️ Upgrade blocked: User ${user.email} sent order_id ${razorpay_order_id} but DB has ${user.razorpay_order_id}`);
            return res.status(400).json({ error: 'Order ID mismatch. Please initiate a new payment.' });
        }

        // SECURITY 2: Check if this payment_id has already been used (prevent replay)
        const existingUser = await User.findOne({ razorpay_payment_id });
        if (existingUser) {
            // If it's the same user and already completed, just return success
            if (existingUser._id.toString() === req.user!.userId && existingUser.payment_status === 'completed') {
                return res.json({ success: true, message: 'Payment already verified' });
            }
            // If it's a different user or suspicious replay, block it
            if (existingUser._id.toString() !== req.user!.userId) {
                console.warn(`⚠️ Upgrade blocked: Payment ${razorpay_payment_id} already used by user ${existingUser.email}`);
                return res.status(400).json({ error: 'This payment has already been used' });
            }
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', config.razorpay.keySecret || '');
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        // SECURITY 3: Double-verify with Razorpay API that payment is actually captured
        if (razorpay) {
            try {
                const fetchedPayment = await razorpay.payments.fetch(razorpay_payment_id);
                if (fetchedPayment.status !== 'captured') {
                    console.warn(`⚠️ Upgrade blocked: Payment ${razorpay_payment_id} status is ${fetchedPayment.status}, not captured`);
                    return res.status(400).json({ error: 'Payment not captured. Please complete the payment.' });
                }
                if (fetchedPayment.order_id !== razorpay_order_id) {
                    console.warn(`⚠️ Upgrade blocked: Payment ${razorpay_payment_id} belongs to order ${fetchedPayment.order_id}, not ${razorpay_order_id}`);
                    return res.status(400).json({ error: 'Payment-order mismatch' });
                }
            } catch (fetchErr) {
                console.error('Razorpay payment fetch failed during upgrade:', fetchErr);
                // Don't block if Razorpay API is temporarily down — signature is already verified
            }
        }

        // Securely update user status
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

        console.log(`✅ User ${req.user!.userId} upgraded to Premium (Payment: ${razorpay_payment_id})`);

        res.json({ success: true, message: 'Upgraded to Premium successfully' });
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ error: 'Failed to process upgrade' });
    }
});

// POST /api/payment/verify-status — Server-side safety net
// When Razorpay payment completed but client-side verify failed,
// this endpoint checks directly with Razorpay and activates the user.
router.post('/verify-status', authenticate, async (req: AuthRequest, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({ error: 'Payment gateway not configured' });
        }

        const user = await User.findById(req.user!.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Already completed — no action needed
        if (user.payment_status === 'completed') {
            return res.json({ status: 'completed', message: 'Payment already verified' });
        }

        // Only re-verify for genuinely PENDING users (from registration flow).
        // If admin explicitly set 'expired' or 'free', DO NOT touch it.
        if (user.payment_status !== 'pending') {
            return res.json({ 
                status: user.payment_status, 
                message: `Payment status is '${user.payment_status}'. No verification needed.` 
            });
        }

        // SECURITY: Only use the order ID from the user's OWN database record.
        // Never accept orderId from the request body — an attacker could pass
        // someone else's captured order ID to get their account activated for free.
        const orderId = user.razorpay_order_id;
        if (!orderId) {
            return res.json({ status: 'no_order', message: 'No pending order found' });
        }

        // Fetch payments for this order directly from Razorpay
        const payments = await razorpay.orders.fetchPayments(orderId) as any;
        const items = payments.items || [];
        const successfulPayment = items.find((p: any) => p.status === 'captured');

        if (successfulPayment) {
            // Payment was captured — activate user
            const validitySetting = await Setting.findOne({ key: 'membership_validity_months' });
            const validityMonths = parseInt(validitySetting?.value || '12', 10);
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + validityMonths);

            user.payment_status = 'completed';
            user.razorpay_payment_id = successfulPayment.id;
            user.razorpay_order_id = orderId;
            user.premium_expiry = expiryDate;
            user.pitch_limit_reset_date = new Date();
            await user.save({ validateModifiedOnly: true });

            console.log(`✅ verify-status: User ${user.email} activated via Razorpay sync (Payment: ${successfulPayment.id})`);

            return res.json({
                status: 'completed',
                message: 'Payment verified and account activated',
                paymentId: successfulPayment.id,
            });
        }

        // Check if payment failed
        const failedPayment = items.find((p: any) => p.status === 'failed');
        if (failedPayment) {
            return res.json({
                status: 'failed',
                message: 'Payment failed. Please try again.',
            });
        }

        // No captured payment found
        return res.json({
            status: 'pending',
            message: 'Payment is still pending or not found.',
        });
    } catch (error) {
        console.error('verify-status error:', error);
        res.status(500).json({ error: 'Failed to verify payment status' });
    }
});

export default router;
