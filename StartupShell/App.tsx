
import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Alert, StatusBar, SafeAreaView } from 'react-native';
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
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.log('Push notification permission denied');
        return;
      }

      try {
        const token = await messaging().getToken();
        console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
        pendingToken.current = token;
        // If WebView is already ready, send immediately
        if (webViewReady) {
          sendTokenToWebView(token);
        }
      } catch (error) {
        console.error('Failed to get FCM token:', error);
      }
    };

    init();
  }, []); // Run once on mount

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
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      Alert.alert(
        remoteMessage.notification?.title || 'New Notification',
        remoteMessage.notification?.body,
        [
          {
            text: 'View',
            onPress: () => {
              if (remoteMessage.data?.url) {
                const url = remoteMessage.data.url as string;
                const fullUrl = url.startsWith('/') ? `${WEBSITE_URL}${url}` : url;
                webViewRef.current?.injectJavaScript(
                  `window.location.href = ${JSON.stringify(fullUrl)}; true;`
                );
              }
            }
          },
          { text: 'Dismiss', style: 'cancel' }
        ]
      );
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
        source={{ uri: WEBSITE_URL }}
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
