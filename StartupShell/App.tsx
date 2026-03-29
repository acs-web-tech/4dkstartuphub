
import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Alert, StatusBar, SafeAreaView, PermissionsAndroid, Linking } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import messaging from '@react-native-firebase/messaging';

const WEBSITE_URL = 'https://startup.4dk.in';

const App = () => {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  // Track whether the WebView is ready to receive injected JS
  const [webViewReady, setWebViewReady] = useState(false);
  // Store the token so we can send it once the WebView is ready
  const pendingToken = useRef<string | null>(null);
  // Initial URL state for deep linking
  const [startUrl, setStartUrl] = useState(WEBSITE_URL);

  // ─── 0. Deep Linking Handling ─────────────────────────────────────────────
  useEffect(() => {
    // 1. App Launch from Link (Cold Start)
    Linking.getInitialURL().then(url => {
      if (url && (url.startsWith('http') || url.startsWith('startup4dk://'))) {
        console.log('🔗 Deep Link (Cold):', url);
        // Normalize custom scheme if used, but we use http/https mostly
        setStartUrl(url);
      }
    });

    // 2. App Already Open (Warm Start)
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (url) {
        console.log('🔗 Deep Link (Warm):', url);
        webViewRef.current?.injectJavaScript(`window.location.href = '${url}'; true;`);
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, []);

  // ─── Helper: Send token to WebView ───────────────────────────────────────
  // Uses postMessage so the web app receives it reliably via window.onmessage
  const sendTokenToWebView = (token: string) => {
    if (!webViewRef.current) {
      pendingToken.current = token;
      return;
    }
    const script = `
      (function() {
        var token = ${JSON.stringify(token)};
        // Method 1: Call handler directly if already set up
        if (typeof window.handleNativeToken === 'function') {
          window.handleNativeToken(token);
        } else {
          // Method 2: Store in localStorage as fallback
          localStorage.setItem('fcm_native_token', token);
        }
        // Method 3: Dispatch a custom event so any listener can pick it up
        window.dispatchEvent(new CustomEvent('fcm_token', { detail: { token: token } }));
      })();
      true;
    `;
    webViewRef.current.injectJavaScript(script);
  };

  // ─── 1. Request Permission & Get FCM Token ────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        // Step 1: Android 13+ (API 33+) requires explicit POST_NOTIFICATIONS permission
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          console.log('🔔 Android Permission Status:', granted);
        }

        // Step 2: Firebase permission request (Internal registration)
        // We call this unconditionally to ensure Firebase internals are ready
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
          console.log('🚫 Push notification permission denied by Firebase');
          return;
        }

        // Step 3: Get FCM token
        const token = await messaging().getToken();
        console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
        pendingToken.current = token;

        // If WebView is already ready, send immediately
        if (webViewReady) {
          sendTokenToWebView(token);
        }
      } catch (error) {
        console.error('Failed during notification setup:', error);
      }
    };

    init();
  }, []);

  // ─── 2. Send pending token when WebView becomes ready ────────────────────
  useEffect(() => {
    if (webViewReady && pendingToken.current) {
      sendTokenToWebView(pendingToken.current);
      pendingToken.current = null;
    }
  }, [webViewReady]);

  // ─── 3. Handle Token Refresh ──────────────────────────────────────────────
  useEffect(() => {
    return messaging().onTokenRefresh(token => {
      console.log('🔄 FCM Token Refreshed');
      pendingToken.current = token;
      if (webViewReady) {
        sendTokenToWebView(token);
        pendingToken.current = null;
      }
    });
  }, [webViewReady]);

  // ─── 4. Handle Notification Taps (Background/Quit state) ─────────────────
  useEffect(() => {
    messaging().getInitialNotification().then(remoteMessage => {
      if (remoteMessage?.data?.url) {
        const url = remoteMessage.data.url as string;
        setTimeout(() => {
          const fullUrl = url.startsWith('/') ? `${WEBSITE_URL}${url}` : url;
          webViewRef.current?.injectJavaScript(
            `window.location.href = ${JSON.stringify(fullUrl)}; true;`
          );
        }, 2000);
      }
    });

    const unsubscribe = messaging().onNotificationOpenedApp(remoteMessage => {
      if (remoteMessage?.data?.url) {
        const url = remoteMessage.data.url as string;
        const fullUrl = url.startsWith('/') ? `${WEBSITE_URL}${url}` : url;
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(fullUrl)}; true;`
        );
      }
    });

    return unsubscribe;
  }, []);

  // ─── 5. Handle Foreground Notifications ──────────────────────────────────
  // App is open → do NOT navigate (avoids page refresh mid-chat/post).
  // The web app's WebSocket already updates the bell badge in real time.
  // Background/quit notifications still navigate via onNotificationOpenedApp
  // and getInitialNotification below — those are unaffected.
  useEffect(() => {
    // Must subscribe to onMessage so Firebase delivers the notification
    // to the device even when the app is in foreground — just do nothing with it.
    const unsubscribe = messaging().onMessage(async _remoteMessage => {
      // Intentionally empty — web app handles display via WebSocket
    });
    return unsubscribe;
  }, []);

  // ─── 6. Hardware Back Button ──────────────────────────────────────────────
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };
    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [canGoBack]);

  // ─── 7. Handle messages FROM the WebView (optional) ──────────────────────
  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'REQUEST_FCM_TOKEN') {
        // Web app is asking for the token explicitly
        messaging().getToken().then(token => {
          sendTokenToWebView(token);
        });
      }
    } catch {
      // Not JSON, ignore
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <WebView
        ref={webViewRef}
        source={{ uri: startUrl }}
        style={{ flex: 1 }}
        allowsBackForwardNavigationGestures
        onNavigationStateChange={(navState) => {
          setCanGoBack(navState.canGoBack);
        }}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onMessage={onMessage}
        onLoadEnd={() => {
          // WebView is ready — mark it and send any pending token
          // Use a small delay to ensure JS context is fully initialized
          setTimeout(() => {
            setWebViewReady(true);
          }, 500);
        }}
      />
    </SafeAreaView>
  );
};

export default App;
