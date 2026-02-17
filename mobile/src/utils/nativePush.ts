import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { notificationsApi } from '../services/api';

export async function initializeNativePush() {
    if (!Capacitor.isNativePlatform()) return; // Do nothing on web

    try {
        // Request permission
        let status = await PushNotifications.checkPermissions();
        if (status.receive === 'prompt') {
            status = await PushNotifications.requestPermissions();
        }

        if (status.receive !== 'granted') {
            console.warn('Native Push: Permission denied');
            return;
        }

        // Register
        await PushNotifications.register();

        // Listeners
        // Clear old listeners first to avoid duplicates if re-initialized
        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token) => {
            console.log('Native Push Token:', token.value);
            // Send to server
            try {
                await notificationsApi.registerDevice(token.value);
            } catch (err) {
                console.error('Failed to send native token to server', err);
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Native Push Reg Error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push Recv:', notification);
            // If app is open, maybe show a toast?
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push Action:', notification);
            const data = notification.notification.data;
            if (data?.url) {
                // Determine if url is internal or external
                if (data.url.startsWith('/') || data.url.includes(window.location.host)) {
                    // Internal navigation handled by router, but window.location works too
                    window.location.href = data.url;
                } else {
                    window.open(data.url, '_system');
                }
            }
        });

        console.log('Native Push Initialized');

    } catch (err) {
        console.error('Error initializing native push', err);
    }
}
