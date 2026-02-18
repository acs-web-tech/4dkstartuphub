# Deployment & Update Instructions

You have successfully applied several significant updates to your application. To ensure everything works as expected, please follow these steps.

## 1. Update Asset Links (✅ DONE)
**I have already updated `client/public/.well-known/assetlinks.json` with your SHA256 fingerprint.**

This fingerprint matches the `debug.keystore` which your `release` build is currently configured to use (in `android/app/build.gradle`).
*   **Action Required:** None for now.
*   **Note:** If you later generate a production keystore and update `build.gradle` to use it, you MUST update the fingerprint in `assetlinks.json` again.

## 2. Rebuild the Mobile App
Changes to `AndroidManifest.xml`, `App.tsx` (Deep Linking logic), and PWA hiding require a native rebuild.

1.  Navigate to `StartupShell/android`.
2.  Run the build command:
    ```bash
    ./gradlew assembleRelease
    ```
3.  Install the new APK on your device to test deep linking and the new "No Zoom" / "No PWA Prompt" behavior.

## 3. Rebuild the Server & Client
New backend dependencies (`cheerio`, `axios`) and frontend changes require a rebuild.

1.  In your root directory (where `docker-compose.yml` is):
    ```bash
    docker-compose up --build -d
    ```
    This will rebuild the Node.js server and the Vite client.

## 4. Configure App URLs (Admin Panel)
Once the app is running:
1.  Log in as an **Admin**.
2.  Go to the **Admin Panel > Settings**.
3.  Scroll down to **Mobile App Configuration**.
4.  Enter the URL for your Android App (e.g., Play Store link or direct `.apk` download link).
5.  Enter the iOS App Store URL (if applicable).
6.  Click **Save App URLs**.

Now, when users visit your site on mobile, the "Install App" button will direct them to these URLs instead of prompting for PWA installation.

## Summary of Changes
-   **Mobile UX:** Disabled zooming, text selection, and PWA prompts inside the native app.
-   **Offline Mode:** Replaced intrusive "Reconnecting" banner with a minimal indicator.
-   **Auth:** Fixed login page flickering for already logged-in users.
-   **Link Previews:** Added proper Open Graph rich link previews for posts.
-   **Deep Linking:** Configured the app to open `https://startup.4dk.in` links directly in the native app.
