import { notificationsApi } from '../services/api';

/**
 * Convert base64 VAPID key to Uint8Array for push manager
 */
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Register the device for push notifications
 */
export async function subscribeToPushNotifications() {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Push notifications not supported by this browser');
            return;
        }

        // 1. Wait for service worker to be ready
        const registration = await navigator.serviceWorker.ready;

        // 2. Get public VAPID key from server
        const { publicKey } = await notificationsApi.getVapidKey();

        if (!publicKey) {
            console.warn('⚠️ No VAPID public key received from server. Push notifications cannot be enabled.');
            return;
        }

        const trimmedKey = publicKey.trim();
        const convertedKey = urlBase64ToUint8Array(trimmedKey);

        // 3. Check for existing subscription
        let subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            // Check if applicationServerKey matches current server key
            const existingKey = subscription.options.applicationServerKey;
            if (existingKey) {
                const existingKeyArray = new Uint8Array(existingKey);
                const keysMatch = convertedKey.length === existingKeyArray.length &&
                    convertedKey.every((val, index) => val === existingKeyArray[index]);

                if (keysMatch) {
                    console.log('✅ Existing push subscription is valid');
                    return subscription;
                } else {
                    console.log('🔄 VAPID key mismatch, resubscribing with new key...');
                    await subscription.unsubscribe();
                }
            }
        }

        // 4. Subscribe
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
        });

        // 5. Send to server
        await notificationsApi.subscribe(subscription);
        console.log('✅ Successfully subscribed to push notifications');

        return subscription;
    } catch (err) {
        console.error('❌ Push subscription failed:', err);
    }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            await notificationsApi.unsubscribe(subscription.endpoint);
            await subscription.unsubscribe();
            console.log('✅ Successfully unsubscribed from push notifications');
        }
    } catch (err) {
        console.error('❌ Push unsubscription failed:', err);
    }
}
