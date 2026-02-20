import nodemailer from 'nodemailer';
import { config } from '../config/env';

// ── Stunning Email Template Helper ───────────────────────────
function getHtmlTemplate(title: string, bodyContent: string, actionButton?: { text: string; url: string }) {
    const logoUrl = `${config.corsOrigin}/logo.png`;

    // Ensure body contains absolute URLs for links
    const absoluteBody = bodyContent.replace(/href="\//g, `href="${config.corsOrigin}/`);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f1f5f9; padding: 40px 0; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); }
        .header { background: linear-gradient(135deg, #000000 0%, #312e81 100%); padding: 48px 32px; text-align: center; }
        .content { padding: 48px; color: #1e293b; line-height: 1.7; font-size: 16px; }
        .button-wrapper { margin: 40px 0; text-align: center; }
        .button { display: inline-block; padding: 16px 36px; background: linear-gradient(90deg, #4f46e5 0%, #6366f1 100%); color: #ffffff !important; text-decoration: none; border-radius: 14px; font-weight: 700; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.4); text-transform: uppercase; letter-spacing: 0.5px; }
        .otp-box { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 32px; text-align: center; border-radius: 16px; margin: 32px 0; letter-spacing: 8px; font-size: 36px; font-weight: 800; color: #1e293b; border: 2px solid #e2e8f0; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.06); }
        .footer { padding: 40px; text-align: center; color: #64748b; font-size: 13px; background-color: #f1f5f9; }
        .footer-links { margin-bottom: 24px; }
        .footer-links a { color: #4f46e5; text-decoration: none; margin: 0 12px; font-weight: 600; }
        h1 { margin: 0 0 24px; color: #0f172a; font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
        p { margin: 0 0 20px; color: #475569; }
        .highlight { color: #4f46e5; font-weight: 700; }
        .brand-name { font-weight: 900; font-size: 26px; color: #ffffff; letter-spacing: -1px; margin-top: 12px; }
        .status-badge { display: inline-block; padding: 8px 16px; border-radius: 9999px; font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                 <img src="${logoUrl}" alt="StartupHub" height="56" style="height: 56px; width: auto; display: block; margin: 0 auto;">
                 <div class="brand-name">STARTUP<span style="color: #6366f1;">HUB</span></div>
             </div>
            <div class="content">
                <h1>${title}</h1>
                ${absoluteBody}
                ${actionButton ? `
                <div class="button-wrapper">
                    <a href="${actionButton.url}" class="button">${actionButton.text}</a>
                </div>
                ` : ''}
                <div style="margin-top: 48px; padding-top: 32px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
                    Cheers,<br>
                    <span style="color: #0f172a; font-weight: 700; font-size: 16px;">The StartupHub Team</span>
                </div>
            </div>
        </div>
        <div class="footer">
            <div class="footer-links">
                <a href="${config.corsOrigin}/privacy">Privacy Policy</a> &bull;
                <a href="${config.corsOrigin}/contact">Contact Support</a>
            </div>
            <p style="font-weight: 600; margin-bottom: 8px;">StartupHub &bull; India's Premier Startup Corridor</p>
            <p style="line-height: 1.5; font-size: 12px; opacity: 0.8;">
                &copy; ${new Date().getFullYear()} 4DK Ventures. All rights reserved.<br>
                You are receiving this email because you are part of our exclusive community.
            </p>
        </div>
    </div>
</body>
</html>
`;
}

// ── Email Queue System ──────────────────────────────────────
const emailQueue: Array<{ to: string; subject: string; html: string; retry: number }> = [];
let isWorkerRunning = false;

const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
        user: config.email.user,
        pass: config.email.pass,
    },
});

export const startEmailWorker = () => {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    console.log('📧 Email Background Worker Started.');

    setInterval(async () => {
        if (emailQueue.length === 0) return;
        const email = emailQueue.shift();
        if (!email) return;

        try {
            await transporter.sendMail({
                from: `"4DK StartupHub" <${config.email.from}>`,
                to: email.to,
                subject: email.subject,
                html: email.html,
            });
        } catch (err) {
            console.error(`❌ Email failed to ${email.to}:`, err);
            if (email.retry < 3) {
                email.retry++;
                emailQueue.push(email);
            }
        }
    }, 2000);
};

export const emailService = {
    async enqueueEmail(to: string, subject: string, html: string) {
        emailQueue.push({ to, subject, html, retry: 0 });
        return true;
    },

    async sendOTP(to: string, name: string, type: 'verification' | 'reset', otp: string) {
        const title = type === 'verification' ? 'Security Verification 🔐' : 'Account Recovery 🔑';
        const bodyContent = `
            <p>Hey <span class="highlight">${name}</span>,</p>
            <p>To keep your account secure and verified, please enter the <span class="highlight">one-time passcode</span> below on our platform:</p>
            <div class="otp-box">${otp}</div>
            <p style="text-align: center; font-size: 14px; color: #64748b;">This code will remain active for <span class="highlight">10 minutes</span>. If you didn't request this, simply ignore this email or contact support if you suspect unauthorized activity.</p>
        `;
        return this.enqueueEmail(to, `${otp} is your StartupHub verification code`, getHtmlTemplate(title, bodyContent));
    },

    async sendWelcomeEmail(to: string, name: string) {
        const title = 'Welcome to the Future! 🚀';
        const bodyContent = `
            <p>Welcome, <span class="highlight">${name}</span>!</p>
            <p>We're absolutely thrilled to have you join <span class="highlight">StartupHub</span>. You've just stepped into India's most exclusive ecosystem for startups and investors.</p>
            <p><strong>Your Premium Access is now Active.</strong> Here's how to make the most of it:</p>
            <ul style="padding-left: 20px; color: #475569;">
                <li><span class="highlight">Polish your profile</span> to stand out to potential partners.</li>
                <li><span class="highlight">Join the Pulse</span>—our real-time feed of opportunities.</li>
                <li><span class="highlight">Pitch with Power</span>—submit your requests for admin review.</li>
            </ul>
            <p>We can't wait to see what you build. Let's make history together!</p>
        `;
        return this.enqueueEmail(to, `🚀 You're In! Welcome to StartupHub, ${name}`, getHtmlTemplate(title, bodyContent, { text: 'Start Your Journey', url: `${config.corsOrigin}/feed` }));
    },

    async sendPasswordResetEmail(to: string, name: string, token: string) {
        const title = 'Reset Your Password 🔒';
        const url = `${config.corsOrigin}/reset-password?token=${token}`;
        const bodyContent = `
            <p>Hi <span class="highlight">${name}</span>,</p>
            <p>We received a request to reset the password for your StartupHub account. No worries—it happens to the best of us!</p>
            <p>Click the button below to choose a <span class="highlight">new, strong password</span>. This link will be active for one hour.</p>
        `;
        return this.enqueueEmail(to, 'Action Required: Reset your StartupHub password', getHtmlTemplate(title, bodyContent, { text: 'Reset Password', url }));
    },

    async sendNotificationEmail(to: string, name: string, type: 'like' | 'comment' | 'mention', details: any) {
        return true; // Disabled per user request
    },

    async sendPitchLimitReachedEmail(to: string, name: string, limit: number) {
        const title = 'You\'re on Fire! 🔥';
        const bodyContent = `
            <p>Hi <span class="highlight">${name}</span>,</p>
            <p>Your activity level is impressive! You've reached your current limit of <span class="highlight">${limit} pitch requests</span>.</p>
            <p>To continue scaling your exposure and reaching more investors, consider upgrading your membership or reaching out to our success team for a limit increase.</p>
        `;
        return this.enqueueEmail(to, 'Important: Pitch Request Limit Reached', getHtmlTemplate(title, bodyContent, { text: 'View Premium Plans', url: `${config.corsOrigin}/pricing` }));
    },

    async sendPitchSubmissionEmail(to: string, name: string, pitchTitle: string) {
        const title = 'Pitch Received! 📑';
        const bodyContent = `
            <p>Fantastic news, <span class="highlight">${name}</span>!</p>
            <p>Your pitch request <span class="highlight">"${pitchTitle}"</span> has been successfully submitted and is now being meticulously reviewed by our curators.</p>
            <p>We aim to maintain the highest standards for our investor network, so this check usually takes 24-48 hours. We'll notify you as soon as your status changes.</p>
        `;
        return this.enqueueEmail(to, 'Confirmation: Your Pitch is in Review', getHtmlTemplate(title, bodyContent, { text: 'Track Progress', url: `${config.corsOrigin}/dashboard` }));
    },

    async sendPitchRequestStatus(to: string, name: string, status: string, pitchTitle: string) {
        const title = 'Pitch Update Available ⚡';
        const isApproved = status.toLowerCase() === 'approved';
        const badgeColor = isApproved ? '#10b981' : '#f43f5e';
        const badgeBg = isApproved ? '#ecfdf5' : '#fff1f2';

        const bodyContent = `
            <p>Hi <span class="highlight">${name}</span>,</p>
            <p>The review for your pitch <span class="highlight">"${pitchTitle}"</span> is complete.</p>
            <div style="text-align: center; margin: 32px 0;">
                <span class="status-badge" style="background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}40;">
                    ${status.toUpperCase()}
                </span>
            </div>
            <p>Check your admin panel for detailed feedback and required next steps from our reviewing team.</p>
        `;
        return this.enqueueEmail(to, `Update: Your Pitch Status is ${status}`, getHtmlTemplate(title, bodyContent, { text: 'Read Review', url: `${config.corsOrigin}/dashboard` }));
    },

    async sendContactUsEmail(fromEmail: string, fromName: string, message: string) {
        const title = 'New Support Inquiry 📬';
        const bodyContent = `
            <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 24px; border-radius: 8px; margin: 24px 0;">
                <p style="margin-bottom: 12px;"><strong>From:</strong> ${fromName} <br><small>${fromEmail}</small></p>
                <p style="white-space: pre-wrap; color: #1e293b;">${message}</p>
            </div>
            <p style="font-size: 14px; opacity: 0.8;">Action required: Please respond to this inquiry via the admin dashboard or direct email.</p>
        `;
        return this.enqueueEmail('founder@4dk.in', `Support: New Message from ${fromName}`, getHtmlTemplate(title, bodyContent));
    },

    async sendSubscriptionExpiryWarning(to: string, name: string, daysLeft: number) {
        const isExpired = daysLeft < 0;
        const title = isExpired ? 'Membership Expired ⚠️' : 'Membership Update ⏳';
        let bodyText = '';

        if (daysLeft === 30) {
            bodyText = 'Time flies! Your Premium membership is set to expire in <span class="highlight">30 days</span>. Renew now to stay connected with India\'s top investors without interruption.';
        } else if (daysLeft === 0) {
            bodyText = 'Important: Your Premium membership <span class="highlight">expires today</span>. Don\'t lose access to your private chat rooms and active pitch requests—renew now.';
        } else if (daysLeft === -1) {
            bodyText = 'Your Premium membership <span class="highlight">has expired</span>. We\'ve paused your premium features, but your data is safe. Reactivate today to jump back into the ecosystem.';
        } else {
            bodyText = `A courtesy notice that your Premium membership will conclude in <span class="highlight">${daysLeft} days</span>.`;
        }

        return this.enqueueEmail(to, `Notice: ${title}`, getHtmlTemplate(title, `<p>Hi ${name},</p><p>${bodyText}</p>`, { text: isExpired ? 'Reactivate Now' : 'Keep my Premium Status', url: `${config.corsOrigin}/pricing` }));
    },

    async sendPaymentFailedEmail(to: string, name: string, orderId: string) {
        const title = 'Payment Unsuccessful ❌';
        const bodyContent = `
            <p>Hi <span class="highlight">${name}</span>,</p>
            <p>We were unable to process your transaction for order <span class="highlight">${orderId}</span>. No worries—your account is still safe, and no funds were debited if the bank rejected the charge.</p>
            <p>Please try a different payment method to secure your <span class="highlight">Premium Status</span> and continue your journey.</p>
        `;
        return this.enqueueEmail(to, 'Action Required: Your payment could not be processed', getHtmlTemplate(title, bodyContent, { text: 'Fix Payment', url: `${config.corsOrigin}/pricing` }));
    },

    async sendAccountStatusEmail(to: string, name: string, isActive: boolean) {
        const statusText = isActive ? 'Restored ✅' : 'Suspended 🚫';
        const title = `Account ${statusText}`;
        const bodyContent = `
            <p>Hello <span class="highlight">${name}</span>,</p>
            <p>This is a formal update regarding your account status. Your access has been <span class="highlight">${statusText.toLowerCase()}</span> by our administrative team.</p>
            ${isActive
                ? '<p>Welcome back! All platform features are now available to you again. We look forward to your contributions.</p>'
                : '<p>Your account access has been temporarily restricted. If you believe this is a misunderstanding, please reach out to our integrity team for a review.</p>'}
        `;
        return this.enqueueEmail(to, `Security: Your Account has been ${statusText}`, getHtmlTemplate(title, bodyContent, isActive ? { text: 'Sign In Now', url: `${config.corsOrigin}/login` } : undefined));
    },

    async sendPendingPaymentReminder(to: string, name: string) {
        const title = 'One Final Step! 🏁';
        const bodyContent = `
            <p>Hey <span class="highlight">${name}</span>, you're so close!</p>
            <p>We noticed you haven't quite finished your registration at <span class="highlight">StartupHub</span>. You're just one step away from connecting with the people who can change your startup's trajectory.</p>
            <p>Complete your membership payment today to instantly unlock India's most powerful network of innovators and funders.</p>
        `;
        return this.enqueueEmail(to, 'Final Step: Your membership is waiting for you', getHtmlTemplate(title, bodyContent, { text: 'Complete Registration', url: `${config.corsOrigin}/login` }));
    }
};
