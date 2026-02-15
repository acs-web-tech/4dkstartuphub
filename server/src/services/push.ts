import webpush from 'web-push';
import { config } from '../config/env';
import PushSubscription from '../models/PushSubscription';
import Notification from '../models/Notification';

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
            const subscriptions = await PushSubscription.find({ user_id: userId });

            if (!subscriptions.length) return;

            const payload = JSON.stringify({
                title: data.title,
                body: data.body,
                url: data.url || '/',
                icon: data.icon || '/logo.png'
            });

            const sendPromises = subscriptions.map(sub => {
                return webpush.sendNotification(sub.subscription, payload)
                    .catch(async (err) => {
                        // If subscription is expired or invalid, remove it
                        if (err.statusCode === 404 || err.statusCode === 410) {
                            console.log(`🧹 Removing invalid push subscription for user ${userId}`);
                            await PushSubscription.deleteOne({ _id: sub._id });
                        } else {
                            console.error('Push notification error:', err);
                        }
                    });
            });

            await Promise.all(sendPromises);
        } catch (err) {
            console.error('Push notification service error:', err);
        }
    }

    /**
     * Broadcast a push notification to all users
     */
    async broadcast(data: { title: string; body: string; url?: string; icon?: string }) {
        try {
            const subscriptions = await PushSubscription.find({});

            if (!subscriptions.length) return;

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
        } catch (err) {
            console.error('Push broadcast error:', err);
        }
    }
}

export const pushService = new PushNotificationService();
