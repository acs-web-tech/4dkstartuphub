# 📱 Android App Maintenance & Upgrade Guide

> **Purpose:** This guide provides exact, 100% reliable instructions for the most common app maintenance tasks requested by Google Play and your team: updating the app icon, bumping the Google Play compatibility targets (SDK versions), and releasing new app updates (version bumps).

---

## 🎨 1. How to Change the App Icon

We have a custom, automated NodeJS script inside the `server` folder that perfectly generates all Android `mipmap` resolutions (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi) directly from your main web logo.

**Step-by-step to update the logo:**
1. Replace your main logo file at `d:\STP\client\public\logo.png` with your new, high-resolution logo.
2. Open PowerShell / Terminal and navigate to the server folder:
   ```powershell
   cd d:\STP\server
   ```
3. Run the automatic icon generator script:
   ```powershell
   node make-icons.js
   ```
4. *Done!* The script will output `DONE!` and perfectly overwrite all native `ic_launcher`, round, foreground, and background icons inside `StartupShell/android/app/src/main/res/`.

*(Note: The script currently defaults to a dark `#0d1117` background. If your new logo requires a different background, edit lines 18, 23, and 33 in `d:\STP\server\make-icons.js` before running it).*

---

## 🎯 2. Upgrading Android SDK (Fixing Google Play Store "Target API" Warnings)

Google Play updates its requirements every August, forcing apps to target the latest Android API level (e.g., API 34, 35). If Google sends you an email demanding an upgrade, here is exactly how to do it without breaking the app.

1. Open `d:\STP\StartupShell\android\build.gradle` in a code editor.
2. Find the `ext { ... }` block at the very top.
3. Update **both** `compileSdkVersion` and `targetSdkVersion` to the number Google requires. 
   *(Do **NOT** change `minSdkVersion` unless absolutely necessary).*

**Before:**
```groovy
ext {
    buildToolsVersion = "34.0.0"
    minSdkVersion = 23          
    compileSdkVersion = 34
    targetSdkVersion = 34
    //...
}
```

**After (Example for Google's API 35 requirement):**
```groovy
ext {
    buildToolsVersion = "34.0.0"
    minSdkVersion = 23          
    compileSdkVersion = 35   // <--- UPDATE THIS
    targetSdkVersion = 35    // <--- UPDATE THIS
    //...
}
```

4. **Install the new SDK:** Use the command line sdkmanager included in your project:
   ```powershell
   cd d:\STP\android-sdk\cmdline-tools\latest\bin
   .\sdkmanager.bat "platforms;android-35"
   ```
5. Clean and rebuild the project (see bottom of this guide).

---

## 🚀 3. Sending Updates to Google Play (Yearly / Feature Version Upgrades)

Every time you upload a *new* APK/AAB file to the Google Play Console for a user update, Google strictly requires a higher `versionCode`. If you don't change this, Google will reject your upload saying "Version code already exists."

1. Open `d:\STP\StartupShell\android\app\build.gradle`.
2. Scroll down to the `defaultConfig { ... }` block.
3. Update `versionCode` and `versionName`.

* **`versionCode`**: Must be a whole number. **Always increase it by exactly 1** every time you upload to Google Play. (Users never see this number).
* **`versionName`**: The human-readable version users see in the Play Store (e.g., "1.0", "1.1", "2.0"). You can set this to whatever makes sense for your marketing.

**Example Update (From version 1.0 to 1.1):**
```groovy
defaultConfig {
    applicationId "io.startuphub.app"
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 2       // <--- INCREASE THIS BY 1 (e.g., 1 -> 2)
    versionName "1.1"   // <--- UPDATE THIS For Users (e.g., "1.0" -> "1.1")
}
```

---

## 🛠️ Final Step: Rebuilding the App Safely

After performing **any** of the 3 tasks above, you *must* clean the old build cache and generate a fresh Release APK to see the changes.

Open PowerShell / Terminal:
```powershell
cd d:\STP\StartupShell\android

# 1. Erase all old cached files (Crucial after SDK/Version changes)
./gradlew clean

# 2. Build the fresh release application
./gradlew assembleRelease
```

Upload the resulting file (`android/app/build/outputs/apk/release/app-release.apk`) to your phone to test the new icon/version, or generate an AAB (`./gradlew bundleRelease`) to upload directly to the Google Play Store!
