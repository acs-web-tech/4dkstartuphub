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

// Stunning HTML Template
const getHtmlTemplate = (title: string, body: string, actionButton?: { text: string, url: string }, isWelcome?: boolean) => {
    // A nice celebration GIF for welcome emails
    const confettiGif = "https://media.giphy.com/media/26tOZ42MgWHZPP7JC/giphy.gif";

    // Additional styles for the "stunning" look
    const headerStyle = `
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        padding: 40px 20px;
        text-align: center;
        border-radius: 16px 16px 0 0;
        position: relative;
        overflow: hidden;
    `;

    const welcomeOverlay = isWelcome ? `
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: url('${confettiGif}'); background-size: cover; opacity: 0.2; pointer-events: none;"></div>
    ` : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        .content { padding: 40px 32px; color: #334155; line-height: 1.7; font-size: 16px; }
        .button { display: inline-block; padding: 14px 32px; background-color: #6366f1; color: #ffffff !important; text-decoration: none; border-radius: 50px; font-weight: 600; text-align: center; margin-top: 24px; box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3); }
        .footer { padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        h1 { margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; position: relative; z-index: 10; }
        h2 { color: #1e293b; margin-top: 0; }
        a { color: #6366f1; text-decoration: none; font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <div style="${headerStyle}">
            ${welcomeOverlay}
            <h1>StartupHub</h1>
        </div>
        <div class="content">
            <h2>${title}</h2>
            ${body}
            ${actionButton ? `<div style="text-align: center;"><a href="${actionButton.url}" class="button">${actionButton.text}</a></div>` : ''}
            ${actionButton ? `<p style="margin-top: 32px; font-size: 14px; text-align: center; color: #94a3b8;">Or copy this link: <br><a href="${actionButton.url}" style="color: #94a3b8; font-weight: normal;">${actionButton.url}</a></p>` : ''}
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} StartupHub. All rights reserved.</p>
            <p style="margin-top: 8px;">Connect. Build. Grow.</p>
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
            // console.log(`📥 Enqueued email for ${to}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to enqueue email for ${to}:`, error);
            return false;
        }
    },

    async sendVerificationEmail(to: string, name: string, token: string) {
        const url = `${config.apiUrl}/auth/verify-email?token=${token}`;
        const html = getHtmlTemplate(
            'Verify Your Email',
            `<p>Hi ${name},</p><p>Welcome to StartupHub! To secure your account and unlock all features, please verify your email address.</p>`,
            { text: 'Verify Email', url }
        );
        return this.enqueueEmail(to, 'Verify your StartupHub account', html);
    },

    async sendWelcomeEmail(to: string, name: string) {
        const url = `${config.corsOrigin}/feed`;
        const html = getHtmlTemplate(
            `Welcome Aboard, ${name}!`,
            `<p>You're now part of the most vibrant startup community.</p>
             <p>Here you can:</p>
             <ul>
                <li>Showcase your startup</li>
                <li>Connect with investors</li>
                <li>Find your co-founder</li>
             </ul>
             <p>Let's build the future together!</p>`,
            { text: 'Start Exploring', url },
            true // Trigger confetti/welcome style
        );
        return this.enqueueEmail(to, 'Welcome to StartupHub! 🎉', html);
    },

    async sendPasswordResetEmail(to: string, name: string, token: string) {
        const url = `${config.corsOrigin}/reset-password?token=${token}`;
        const html = getHtmlTemplate(
            'Reset Password',
            `<p>Hi ${name},</p><p>We received a request to check your password. Click below to reset it.</p>`,
            { text: 'Reset Password', url }
        );
        return this.enqueueEmail(to, 'Reset your password', html);
    },

    async sendNotificationEmail(to: string, name: string, type: 'like' | 'comment' | 'mention', details: { actorName: string, postTitle?: string, contentSnippet?: string }) {
        let subject = '';
        let body = '';
        let title = '';

        switch (type) {
            case 'like':
                subject = `${details.actorName} liked your post`;
                title = 'New Like!';
                body = `<p>Hi ${name},</p><p><strong>${details.actorName}</strong> liked your post <em>"${details.postTitle || 'Update'}"</em>.</p>`;
                break;
            case 'comment':
                subject = `${details.actorName} commented on your post`;
                title = 'New Comment!';
                body = `<p>Hi ${name},</p><p><strong>${details.actorName}</strong> commented on your post <em>"${details.postTitle || 'Update'}"</em>:</p><blockquote style="border-left: 4px solid #6366f1; padding-left: 12px; margin: 16px 0; color: #555;">"${details.contentSnippet || 'Comment'}"</blockquote>`;
                break;
            case 'mention':
                subject = `${details.actorName} mentioned you`;
                title = 'Mentioned in a post';
                body = `<p>Hi ${name},</p><p><strong>${details.actorName}</strong> mentioned you:</p><blockquote style="border-left: 4px solid #6366f1; padding-left: 12px; margin: 16px 0; color: #555;">"${details.contentSnippet || 'Mention'}"</blockquote>`;
                break;
        }

        const html = getHtmlTemplate(title, body, { text: 'View Notification', url: `${config.corsOrigin}/notifications` });
        return this.enqueueEmail(to, subject, html);
    },

    async sendBroadcastEmail(to: string, subject: string, content: string, actionUrl?: string) {
        const body = `<div style="font-size: 16px;">${content}</div>`;
        const html = getHtmlTemplate(subject, body, actionUrl ? { text: 'View Now', url: actionUrl } : undefined);
        return this.enqueueEmail(to, subject, html);
    }
};
