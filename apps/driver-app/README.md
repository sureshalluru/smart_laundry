# Smart Laundry Driver App

Native Android app that wraps the existing driver portal with background GPS tracking.

## Prerequisites

- Node.js 18+
- Android Studio (for SDK and emulator)
- Java 17 (for Gradle builds)

## Setup

```bash
# 1. Build the admin React app first
cd ../admin
npm install
npm run build

# 2. Install driver-app dependencies
cd ../driver-app
npm install

# 3. Add Android platform (generates android/ directory)
npx cap add android

# 4. Sync web assets to native project
npx cap sync android
```

## Build APK

```bash
# Debug APK (no signing needed)
cd android && ./gradlew assembleDebug

# Release APK (requires keystore setup)
cd android && ./gradlew assembleRelease
```

The APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

## Development

```bash
# Open in Android Studio
npx cap open android

# Live reload (connect device to same network)
# Uncomment server.url in capacitor.config.ts and set your IP
npx cap run android
```

## Distribution

Send the APK download link to drivers. They install it by:
1. Opening the link on their Android phone
2. Tapping "Download"
3. Opening the downloaded APK
4. Allowing "Install from unknown sources" if prompted
5. Tapping "Install"

## Keystore Setup (for Release Builds)

```bash
mkdir -p keystore
keytool -genkey -v -keystore keystore/driver-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias driver
```

Add to `android/gradle.properties`:
```
DRIVER_STORE_PASSWORD=your_password
DRIVER_KEY_PASSWORD=your_password
```
