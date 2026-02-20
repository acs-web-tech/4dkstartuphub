import webpush from 'web-push';
import { config } from '../config/env';
import PushSubscription from '../models/PushSubscription';
import Notification from '../models/Notification';
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
            const messaging = getFirebaseMessaging();
            if (user?.fcm_tokens?.length && messaging) {
                const response = await messaging.sendEachForMulticast({
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
                    // Only remove PERMANENTLY invalid tokens (not temporary errors)
                    const PERMANENT_ERRORS = [
                        'messaging/invalid-registration-token',
                        'messaging/registration-token-not-registered',
                        'messaging/invalid-argument',
                        'messaging/invalid-payload',
                    ];
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
                        console.log(`🗑️ Removing ${staleTokens.length} stale FCM token(s) for user ${userId}`);
                        await User.findByIdAndUpdate(userId, {
                            $pull: { fcm_tokens: { $in: staleTokens } }
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
    async broadcast(data: { title: string; body: string; url?: string; icon?: string; image?: string }) {
        try {
            // 1. Web Push
            const subscriptions = await PushSubscription.find({});

            if (subscriptions.length) {
                const payload = JSON.stringify({
                    title: data.title,
                    body: data.body,
                    url: data.url || '/',
                    icon: data.icon || '/logo.png',
                    image: data.image
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
                console.log('📢 Starting Native Push Broadcast...');
                // Get all tokens from all users
                const users = await User.find({ 'fcm_tokens.0': { $exists: true } }).select('fcm_tokens');
                const tokens = users.reduce((acc, user) => [...acc, ...user.fcm_tokens], [] as string[]);
                // Remove duplicates
                const uniqueTokens = [...new Set(tokens)];

                console.log(`📱 Found ${uniqueTokens.length} unique FCM tokens for broadcast.`);

                if (uniqueTokens.length > 0) {
                    const PERMANENT_ERRORS = [
                        'invalid-registration-token',
                        'registration-token-not-registered',
                        'invalid-argument',
                        'invalid-payload',
                    ];
                    const batchSize = 500;
                    for (let i = 0; i < uniqueTokens.length; i += batchSize) {
                        const batch = uniqueTokens.slice(i, i + batchSize);
                        try {
                            console.log(`🚀 Sending batch ${Math.floor(i / batchSize) + 1} (${batch.length} tokens)...`);
                            const response = await messaging.sendEachForMulticast({
                                notification: {
                                    title: data.title,
                                    body: data.body,
                                    ...(data.image ? { imageUrl: data.image } : {})
                                },
                                android: {
                                    priority: 'high',
                                    notification: {
                                        defaultSound: true,
                                        notificationCount: 1,
                                        ...(data.image ? { imageUrl: data.image } : {})
                                    }
                                },
                                apns: {
                                    payload: {
                                        aps: {
                                            'mutable-content': 1
                                        }
                                    },
                                    ...(data.image ? { fcmOptions: { imageUrl: data.image } } : {})
                                },
                                data: {
                                    url: data.url || '/',
                                    type: 'broadcast',
                                    ...(data.image ? { image: data.image } : {})
                                },
                                tokens: batch
                            });
                            console.log(`✅ Batch sent: ${response.successCount} success, ${response.failureCount} failed.`);

                            if (response.failureCount > 0) {
                                const staleTokens: string[] = [];
                                response.responses.forEach((r, idx) => {
                                    if (!r.success) {
                                        const code = r.error?.code || '';
                                        console.warn(`⚠️ Broadcast token failed [${code}]: ${batch[idx]?.substring(0, 20)}...`);
                                        if (PERMANENT_ERRORS.some(e => code.includes(e))) {
                                            staleTokens.push(batch[idx]);
                                        }
                                    }
                                });
                                // Remove stale tokens from all users in bulk
                                if (staleTokens.length > 0) {
                                    console.log(`🗑️ Removing ${staleTokens.length} stale FCM tokens from broadcast batch`);
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
                } else {
                    console.log('⚠️ No mobile devices registered for push notifications.');
                }
            } else {
                console.warn('⚠️ Firebase Admin not initialized. Skipping native broadcast.');
            }
        } catch (err) {
            console.error('❌ Push broadcast error:', err);
        }
    }
}

export const pushService = new PushNotificationService();
