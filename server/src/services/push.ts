import webpush from 'web-push';
import { config } from '../config/env';
import PushSubscription from '../models/PushSubscription';
import Notification from '../models/Notification';
import { firebaseAdmin } from '../config/firebase';
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
     * Send a push notification to a specific user
     */
    async sendToUser(userId: string, data: { title: string; body: string; url?: string; icon?: string }) {
        try {
            // 1. Web Push
            const subscriptions = await PushSubscription.find({ user_id: userId });

            if (subscriptions.length) {
                const payload = JSON.stringify({
                    title: data.title,
                    body: data.body,
                    url: data.url || '/',
                    icon: data.icon || '/logo.png'
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
            const user = await User.findById(userId).select('fcm_tokens');
            if (user?.fcm_tokens?.length && firebaseAdmin) {
                const response = await firebaseAdmin.messaging().sendEachForMulticast({
                    notification: {
                        title: data.title,
                        body: data.body,
                    },
                    data: {
                        url: data.url || '/',
                        type: 'notification'
                    },
                    tokens: user.fcm_tokens
                });

                if (response.failureCount > 0) {
                    const failedTokens: string[] = [];
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success) {
                            failedTokens.push(user.fcm_tokens[idx]);
                        }
                    });
                    if (failedTokens.length > 0) {
                        await User.findByIdAndUpdate(userId, {
                            $pull: { fcm_tokens: { $in: failedTokens } }
                        });
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
    async broadcast(data: { title: string; body: string; url?: string; icon?: string }) {
        try {
            // 1. Web Push
            const subscriptions = await PushSubscription.find({});

            if (subscriptions.length) {
                const payload = JSON.stringify({
                    title: data.title,
                    body: data.body,
                    url: data.url || '/',
                    icon: data.icon || '/logo.png'
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
            if (firebaseAdmin) {
                const tokens = await User.distinct('fcm_tokens');

                if (tokens.length > 0) {
                    // Firebase limits multicast to 500 tokens
                    const batchSize = 500;
                    for (let i = 0; i < tokens.length; i += batchSize) {
                        const batch = tokens.slice(i, i + batchSize);
                        try {
                            await firebaseAdmin.messaging().sendEachForMulticast({
                                notification: {
                                    title: data.title,
                                    body: data.body
                                },
                                data: {
                                    url: data.url || '/',
                                    type: 'broadcast'
                                },
                                tokens: batch
                            });
                        } catch (e) {
                            console.error('FCM broadcast batch error:', e);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Push broadcast error:', err);
        }
    }
}

export const pushService = new PushNotificationService();
