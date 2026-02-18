# Native Mobile App Guide (React Native Shell)

This guide explains how to build, run, and troubleshoot the Native Android Shell application for StartupHub.

## 📱 Project Structure
- **Root:** `d:\STP\StartupShell`
- **Android Project:** `d:\STP\StartupShell\android`
- **Main Code:** `App.tsx` (Handles WebView and Push Notifications)

## 🛠️ Prerequisites
Ensure your environment is set up correctly:
1.  **Node.js**: Installed.
2.  **Java JDK**: Version 17 or 21 (We configured Gradle 8.6 + AGP 8.2.1 to support Java 21).
3.  **Android Studio & SDK**:
    - Ensure SDK is installed.
    - Path MUST be set in `d:\STP\StartupShell\android\local.properties`.
    - Example content of `local.properties`:
      ```properties
      sdk.dir=C\:\\Users\\YourUser\\AppData\\Local\\Android\\Sdk
      ```
      *(Note double backslashes on Windows)*.

## 🚀 Building the APK (Crucial!)

**ALWAYS build the RELEASE version** for standalone testing on a phone. The Debug version requires a development server connection and will show a "Red Screen" error if not connected via USB/ADB.

### Command to Build:
```powershell
cd StartupShell/android
./gradlew clean assembleRelease
```

### Output Location:
The APK file will be generated here:
`d:\STP\StartupShell\android\app\build\outputs\apk\release\app-release.apk`

Transfer this file to your phone and install it.

---

## 🔔 Push Notifications Setup

The app uses Firebase Cloud Messaging (FCM).

### 1. Client Configuration (`google-services.json`)
- Located at `StartupShell/android/app/google-services.json`.
- Contains your client ID (`mobilesdk_app_id`) and project details.
- **Package Name:** Must match `io.startuphub.app`.

### 2. Server Configuration (`service-account.json`)
- Located at `server/service-account.json`.
- Required for the Backend to authenticate with FCM and send messages.
- If missing, the server logs: `⚠️ Firebase Admin NOT initialized`.

### 3. How it Works
1.  **App Starts:** FCM SDK generates a device token.
2.  **Webview Load:** App injects token into the website context via `window.handleNativeToken` or `localStorage`.
3.  **Website Logic:** The React website (`client/src/context/AuthContext.tsx`) detects the token and sends it to `/api/notifications/register-device`.
4.  **Broadcasting:** Admin API sends a message -> Server iterates tokens -> Sends to FCM.

---

## 🔧 Troubleshooting Common Errors

### 1. "Unable to load script" / Red Screen on Phone
- **Cause:** You installed the **Debug** APK (`app-debug.apk`) but the phone cannot connect to your laptop's Metro server.
- **Fix:** Build the **Release** APK (`assembleRelease`) as described above.

### 2. "SDK location not found"
- **Cause:** Gradle cannot find Android SDK.
- **Fix:** Create/Edit `StartupShell/android/local.properties` and add `sdk.dir=PATH_TO_SDK`.

### 3. "Execution failed for task ... jlink"
- **Cause:** Java 21 incompatibility with older Android Gradle Plugin.
- **Fix:** We already upgraded to AGP 8.2.1. If it happens, ensure `gradle-wrapper.properties` is version 8.6.

### 4. "Native notification is not working"
- **Check 1 (Server):** Check server terminal logs. Look for:
  - `✅ Firebase Admin initialized`
  - `📢 Starting Native Push Broadcast...`
  - `✅ Batch sent: X success, Y failed`.
  - If you see `⚠️ Firebase Admin not initialized`, check `service-account.json`.
  - If you see `⚠️ No mobile devices`, the app hasn't registered the token yet.
- **Check 2 (Client):** Open the App. Warning or Logs?
  - Ensure you are logged in on the website inside the app.
  - The token is only sent AFTER login (`useEffect` in `AuthContext` depends on `user`).

### 5. Build Fails with "Manifest Merger Failed"
- **Cause:** Library version mismatch (e.g. `firebase-messaging` requires newer SDK).
- **Fix:** Ensure `minSdkVersion = 23` in `android/build.gradle`. (We already set this).

---

## 📦 Future Updates
If you change the website URL, update `WEBSITE_URL` in `StartupShell/App.tsx` and rebuild the APK.
