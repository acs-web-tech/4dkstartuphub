import { Worker } from 'worker_threads';
import path from 'path';
import EmailJob from '../models/EmailJob';
import { config } from '../config/env';

// Worker Control
let worker: Worker | null = null;

export const startEmailWorker = () => {
    if (worker) return; // Already running

    // In production (compiled JS), the worker file is .js
    // In development (ts-node), we might need to handle .ts
    // Robust way: check extension or try-catch

    const workerParams = {
        // workerData can be passed here if needed
    };

    try {
        const isTs = __filename.endsWith('.ts') || process.execArgv.some(arg => arg.includes('ts-node'));

        if (isTs) {
            // Development: run .ts worker via ts-node
            worker = new Worker(`
                require('ts-node').register();
                require(require('path').resolve(__dirname, '../workers/emailWorker.ts'));
            `, { eval: true, workerData: workerParams });
        } else {
            // Production: run .js worker
            worker = new Worker(path.resolve(__dirname, '../workers/emailWorker.js'), { workerData: workerParams });
        }

        worker.on('message', (msg) => {
            if (msg.type === 'job_completed') {
                // console.log(`✅ Email job ${msg.id} processed`);
            }
        });

        worker.on('error', (err) => console.error('❌ Email Worker Error:', err));
        worker.on('exit', (code) => {
            if (code !== 0) console.error(`❌ Email Worker stopped with exit code ${code}`);
            worker = null;
            // Auto-restart logic
            setTimeout(startEmailWorker, 5000);
        });

        console.log('🚀 Email Worker Thread Started');
    } catch (e) {
        console.error("Failed to start email worker:", e);
    }
};

// LinkedIn-style HTML Template
const getHtmlTemplate = (title: string, body: string, actionButton?: { text: string, url: string }, isWelcome?: boolean) => {
    // 4DK Logo Placeholder
    const logoUrl = `${config.corsOrigin}/logo.png`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <!--[if mso]>
    <style type="text/css">
    body, table, td {font-family: Helvetica, Arial, sans-serif !important;}
    </style>
    <![endif]-->
    <style>
        body { margin: 0; padding: 0; background-color: #f3f2ef; font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Fira Sans", Ubuntu, Oxygen, "Oxygen Sans", Cantarell, "Droid Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Lucida Grande", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f3f2ef; padding: 20px 0; }
        .container { max-width: 550px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #ffffff; padding: 24px 32px 16px; border-bottom: 1px solid #e5e7eb; }
        .logo-text { color: #1e293b; font-size: 20px; font-weight: 700; display: inline-block; text-decoration: none; }
        .content { padding: 32px; color: #1e293b; line-height: 1.5; font-size: 16px; }
        .button-wrapper { margin-top: 24px; margin-bottom: 24px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #0a66c2; color: #ffffff !important; text-decoration: none; border-radius: 24px; font-weight: 600; font-size: 16px; text-align: center; }
        .button:hover { background-color: #004182; text-decoration: none; }
        .otp-box { background-color: #f3f4f6; padding: 16px; text-align: center; border-radius: 6px; margin: 24px 0; letter-spacing: 4px; font-size: 24px; font-weight: 700; color: #1e293b; border: 1px dashed #cbd5e1; }
        .footer { padding: 24px; text-align: center; color: #666; font-size: 12px; background-color: #f3f2ef; }
        .footer a { color: #0a66c2; text-decoration: none; margin: 0 6px; }
        h1 { margin: 0 0 16px; color: #1e293b; font-size: 22px; font-weight: 600; }
        p { margin: 0 0 12px; color: #1e293b; }
        a { color: #0a66c2; font-weight: 600; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                 <div style="font-weight: 900; font-size: 20px; color: #6366f1;">4DK <span style="color: #1e293b; font-weight: 600;">StartupHub</span></div>
            </div>
            <div class="content">
                <h1>${title}</h1>
                ${body}
                ${actionButton ? `
                <div class="button-wrapper">
                    <a href="${actionButton.url}" class="button">${actionButton.text}</a>
                </div>
                ` : ''}
            </div>
        </div>
        <div class="footer">
            <p>StartupHub &bull; Connect. Build. Grow.</p>
            <p>
                <a href="${config.corsOrigin}/privacy">Privacy Policy</a> &bull; 
                <a href="${config.corsOrigin}/contact">Contact Support</a>
            </p>
            <p style="margin-top: 12px; color: #999;">
                You are receiving this email because you are a member of 4DK StartupHub.
            </p>
        </div>
    </div>
</body>
</html>
    `;
};

export const emailService = {
    async enqueueEmail(to: string, subject: string, html: string) {
        try {
            await EmailJob.create({ to, subject, html });
            return true;
        } catch (error) {
            console.error(`❌ Failed to enqueue email for ${to}:`, error);
            return false;
        }
    },

    // Legacy support: sendVerificationEmail (Link-based) - Keeping it or redirecting to OTP logic?
    // User asked for "email verifications should be based on otp". Let's assume we replace the flow.
    // But callers might still be using the old signature. We'll add sendOTP methods.

    async sendOTP(to: string, name: string, type: 'verification' | 'reset', otp: string) {
        const subject = type === 'verification' ? 'Verify your email address' : 'Reset your password';
        const title = type === 'verification' ? 'Confirm your email' : 'Password Reset';
        const body = `
            <p>Hi ${name},</p>
            <p>Please use the verification code below to ${type === 'verification' ? 'verify your email address' : 'reset your password'}:</p>
            <div class="otp-box">${otp}</div>
            <p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
        `;
        const html = getHtmlTemplate(title, body);
        return this.enqueueEmail(to, subject, html);
    },

    async sendWelcomeEmail(to: string, name: string) {
        const url = `${config.corsOrigin}/feed`;
        const html = getHtmlTemplate(
            `Welcome to StartupHub!`,
            `<p>Hi ${name},</p>
             <p>Thanks for joining 4DK StartupHub! We're thrilled to have you as part of our community of innovators and investors.</p>
             <p>Get started by completing your profile and exploring the latest pitch requests.</p>`,
            { text: 'Go to Feed', url },
            true
        );
        return this.enqueueEmail(to, `Welcome to StartupHub via 4DK`, html);
    },

    // Changed to OTP based, but keeping this signature to avoid breaking TS immediately if used elsewhere
    // Ideally this should not be called anymore if we switch to OTP entirely. 
    async sendPasswordResetEmail(to: string, name: string, token: string) {
        // Fallback or deprecate. We'll use sendOTP instead in the controller.
        // For now, let's just log a warning or support it as legacy link.
        const url = `${config.corsOrigin}/reset-password?token=${token}`;
        const html = getHtmlTemplate(
            'Reset Password',
            `<p>Hi ${name},</p><p>Click the link below to reset your password:</p>`,
            { text: 'Reset Password', url }
        );
        return this.enqueueEmail(to, 'Reset your password', html);
    },

    async sendNotificationEmail(to: string, name: string, type: 'like' | 'comment' | 'mention', details: any) {
        // DISABLED per user request: "email for likes comments reactions no need"
        return true;
    },

    async sendBroadcastEmail(to: string, name: string, subject: string, content: string, actionUrl?: string) {
        const body = `<p>Hi ${name},</p><div style="font-size: 16px; color: #333; margin-top: 12px;">${content}</div>`;
        const html = getHtmlTemplate(subject, body, actionUrl ? { text: 'View Details', url: actionUrl } : undefined);
        return this.enqueueEmail(to, subject, html);
    },

    async sendPitchRequestStatus(to: string, name: string, status: string, pitchTitle: string) {
        const subject = `Pitch Status Update: ${status}`;
        const body = `<p>Hi ${name},</p><p>The status of your pitch request <strong>"${pitchTitle}"</strong> has been updated to <strong>${status}</strong>.</p><p>Check your dashboard for more details.</p>`;
        const html = getHtmlTemplate('Pitch Status Update', body, { text: 'View Dashboard', url: `${config.corsOrigin}/dashboard` });
        return this.enqueueEmail(to, subject, html);
    },

    async sendContactUsEmail(fromEmail: string, fromName: string, message: string) {
        // Email to ADMIN/Founder
        const adminEmail = 'founder@4dk.in'; // As requested
        const subject = `New Contact Message from ${fromName}`;
        const body = `<p><strong>From:</strong> ${fromName} (${fromEmail})</p><p><strong>Message:</strong></p><blockquote style="background:#f9f9f9; padding:10px; border-left: 3px solid #0a66c2;">${message}</blockquote>`;
        const html = getHtmlTemplate('New Contact Message', body);
        return this.enqueueEmail(adminEmail, subject, html);
    },

    async sendSubscriptionExpiryWarning(to: string, name: string, daysLeft: number) {
        const title = daysLeft === 0 ? 'Subscription Expiring Today' : 'Subscription Ending Soon';
        const subject = daysLeft === 0 ? 'Your Premium Membership Expires Today' : `Your Premium Membership expires in ${daysLeft} days`;
        const body = `
            <p>Hi ${name},</p>
            <p>This is a reminder that your Premium membership is set to expire ${daysLeft === 0 ? 'today' : `on ${new Date(Date.now() + daysLeft * 86400000).toLocaleDateString()}`}.</p>
            <p>To continue enjoying exclusive investor access and premium features, please renew your subscription.</p>
        `;
        const html = getHtmlTemplate(title, body, { text: 'Renew Now', url: `${config.corsOrigin}/pricing` });
        return this.enqueueEmail(to, subject, html);
    },

    async sendAccountStatusEmail(to: string, name: string, isActive: boolean) {
        const action = isActive ? 'activated' : 'deactivated';
        const subject = `Your account has been ${action}`;
        const body = `
            <p>Hi ${name},</p>
            <p>Your account has been <strong>${action}</strong> by the administration.</p>
            ${!isActive ? `<p>If you believe this is a mistake, please contact <a href="mailto:support@4dk.in">support@4dk.in</a>.</p>` : '<p>Welcome back! You can now log in and access all features.</p>'}
        `;
        const html = getHtmlTemplate(`Account ${isActive ? 'Activated' : 'Deactivated'}`, body, isActive ? { text: 'Login Now', url: `${config.corsOrigin}/login` } : undefined);
        return this.enqueueEmail(to, subject, html);
    }
};
