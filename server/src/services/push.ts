import webpush from 'web-push';
import { config } from '../config/env';
import PushSubscription from '../models/PushSubscription';
import { getFirebaseMessaging } from '../config/firebase';
import User from '../models/User';

class PushNotificationService {
    constructor() {
        if (config.vapid.publicKey && config.vapid.privateKey) {
            webpush.setVapidDetails(
                'mailto:admin@stphub.com',
                config.vapid.publicKey,
                config.vapid.privateKey
            );
        } else {
            console.warn('⚠️ Push notifications are not fully configured. Missing VAPID keys.');
        }
    }

    /**
     * Helper to ensure URLs are absolute for push notification clients (FCM/iOS/Android)
     */
    private ensureAbsoluteUrl(url?: string): string | undefined {
        if (!url) return undefined;
        if (url.startsWith('http')) return url;

        // Use API_URL if set, otherwise fall back to CORS_ORIGIN (the actual public domain)
        let baseDomain: string;
        if (config.apiUrl && !config.apiUrl.includes('localhost')) {
            baseDomain = config.apiUrl.split('/api')[0];
        } else {
            // CORS_ORIGIN is always set to the real domain in production (e.g., https://startup.4dk.in)
            baseDomain = config.corsOrigin || 'https://startup.4dk.in';
        }
        // Ensure relative URLs start with /
        const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
        const result = `${baseDomain}${normalizedUrl}`;
        console.log(`[Push] ensureAbsoluteUrl: "${url}" → "${result}"`);
        return result;
    }

    /**
     * Send a push notification to a specific user
     */
    async sendToUser(userId: string, data: { title: string; body: string; url?: string; icon?: string; image?: string }) {
        try {
            const absoluteUrl = this.ensureAbsoluteUrl(data.url) || '/';
            const absoluteIcon = this.ensureAbsoluteUrl(data.icon || '/logo.png');
            const absoluteImage = this.ensureAbsoluteUrl(data.image);

            console.log(`[Push] Sending to user ${userId}. Image: ${absoluteImage}`);

            // 1. Web Push
            const subscriptions = await PushSubscription.find({ user_id: userId });

            if (subscriptions.length) {
                const payload = JSON.stringify({
                    title: data.title,
                    body: data.body,
                    url: absoluteUrl,
                    icon: absoluteIcon,
                    badge: absoluteIcon, // For web push, badge is often the icon
                    image: absoluteImage
                });

                const sendPromises = subscriptions.map(sub => {
                    return webpush.sendNotification(sub.subscription, payload)
                        .catch(async (err) => {
                            if (err.statusCode === 404 || err.statusCode === 410) {
                                await PushSubscription.deleteOne({ _id: sub._id });
                            }
                        });
                });
                await Promise.all(sendPromises);
            }

            // 2. Native Push (FCM)
            // Re-fetch user to ensure fcm_tokens are up-to-date if user was modified above
            const userWithTokens = await User.findById(userId).select('fcm_tokens');
            const messaging = getFirebaseMessaging();
            if (userWithTokens?.fcm_tokens?.length && messaging) {
                const fcmPayload: any = {
                    notification: {
                        title: data.title,
                        body: data.body,
                        ...(absoluteImage ? { imageUrl: absoluteImage, image: absoluteImage } : {}),
                        ...(absoluteIcon && !absoluteImage ? { imageUrl: absoluteIcon } : {})
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            ...(absoluteImage ? { image: absoluteImage } : (absoluteIcon ? { icon: 'stock_ticker_update' } : {}))
                        }
                    },
                    data: {
                        url: absoluteUrl,
                        type: 'notification',
                        ...(absoluteImage ? { image: absoluteImage, picture: absoluteImage } : {}),
                        ...(absoluteIcon ? { icon: absoluteIcon } : {}) // Add icon to data for some clients
                    }
                };

                // Add APNS specific options for iOS if an image is present
                if (absoluteImage) {
                    fcmPayload.apns = {
                        payload: { aps: { 'mutable-content': 1 } },
                        fcmOptions: { imageUrl: absoluteImage }
                    };
                }

                const response = await messaging.sendEachForMulticast({
                    ...fcmPayload,
                    tokens: userWithTokens.fcm_tokens
                });

                if (response.failureCount > 0) {
                    const PERMANENT_ERRORS = ['invalid-registration-token', 'registration-token-not-registered', 'invalid-argument', 'invalid-payload'];
                    const staleTokens: string[] = [];
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success) {
                            const code = resp.error?.code || '';
                            console.warn(`⚠️ FCM token failed [${code}]: ${user.fcm_tokens[idx]?.substring(0, 20)}...`);
                            if (PERMANENT_ERRORS.some(e => code.includes(e.split('/')[1]))) {
                                staleTokens.push(user.fcm_tokens[idx]);
                            }
                        }
                    });
                    if (staleTokens.length > 0) {
                        await User.findByIdAndUpdate(userId, { $pull: { fcm_tokens: { $in: staleTokens } } });
                    }
                }
            }
        } catch (err) {
            console.error('Push notification service error:', err);
        }
    }

    /**
     * Broadcast a push notification to all users
     */
    async broadcast(data: { title: string; body: string; url?: string; icon?: string; image?: string }) {
        try {
            const absoluteUrl = this.ensureAbsoluteUrl(data.url) || '/';
            const absoluteIcon = this.ensureAbsoluteUrl(data.icon || '/logo.png');
            const absoluteImage = this.ensureAbsoluteUrl(data.image);

            console.log(`[Push Broadcast] image input: "${data.image}", resolved: "${absoluteImage}"`);

            // 1. Web Push
            const subscriptions = await PushSubscription.find({});
            if (subscriptions.length) {
                const payload = JSON.stringify({
                    title: data.title,
                    body: data.body,
                    url: absoluteUrl,
                    icon: absoluteIcon,
                    badge: absoluteIcon,
                    image: absoluteImage
                });

                const sendPromises = subscriptions.map(sub => {
                    return webpush.sendNotification(sub.subscription, payload)
                        .catch(async (err) => {
                            if (err.statusCode === 404 || err.statusCode === 410) {
                                await PushSubscription.deleteOne({ _id: sub._id });
                            }
                        });
                });
                await Promise.all(sendPromises);
            }

            // 2. Native Push (FCM)
            const messaging = getFirebaseMessaging();
            if (messaging) {
                const users = await User.find({ 'fcm_tokens.0': { $exists: true } }).select('fcm_tokens');
                const tokens = users.reduce((acc, user) => [...acc, ...user.fcm_tokens], [] as string[]);
                const uniqueTokens = [...new Set(tokens)];

                if (uniqueTokens.length > 0) {
                    const PERMANENT_ERRORS = ['invalid-registration-token', 'registration-token-not-registered', 'invalid-argument', 'invalid-payload'];
                    const batchSize = 500;

                    const fcmPayload: any = {
                        notification: {
                            title: String(data.title).substring(0, 100),
                            body: String(data.body).substring(0, 500),
                        },
                        data: {
                            url: absoluteUrl,
                            type: 'broadcast',
                        },
                        android: {
                            priority: 'high' as const,
                            notification: {
                                sound: 'default',
                            }
                        }
                    };

                    if (absoluteImage) {
                        fcmPayload.notification.imageUrl = absoluteImage;
                        fcmPayload.notification.image = absoluteImage; // Compatibility with some SDKs
                        fcmPayload.image = absoluteImage; // Compatibility with some REST v1 maps
                        fcmPayload.android.notification.image = absoluteImage;
                        fcmPayload.android.notification.channelId = 'default';
                        fcmPayload.apns = {
                            payload: { aps: { 'mutable-content': 1 } },
                            fcmOptions: { imageUrl: absoluteImage }
                        };
                        fcmPayload.data.image = absoluteImage;
                        fcmPayload.data.picture = absoluteImage;
                        fcmPayload.data.fcm_options = { image: absoluteImage };
                    }

                    for (let i = 0; i < uniqueTokens.length; i += batchSize) {
                        const batch = uniqueTokens.slice(i, i + batchSize);
                        try {
                            const response = await messaging.sendEachForMulticast({
                                ...fcmPayload,
                                tokens: batch
                            });
                            if (response.failureCount > 0) {
                                const staleTokens: string[] = [];
                                response.responses.forEach((r, idx) => {
                                    if (!r.success) {
                                        const code = r.error?.code || '';
                                        if (PERMANENT_ERRORS.some(e => code.includes(e))) {
                                            staleTokens.push(batch[idx]);
                                        }
                                    }
                                });
                                if (staleTokens.length > 0) {
                                    await User.updateMany(
                                        { fcm_tokens: { $in: staleTokens } },
                                        { $pull: { fcm_tokens: { $in: staleTokens } } }
                                    );
                                }
                            }
                        } catch (e) {
                            console.error('❌ FCM broadcast batch error:', e);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('❌ Push broadcast error:', err);
        }
    }
}

export const pushService = new PushNotificationService();
