#!/bin/bash
# Build the Smart Laundry Driver APK
# Run from the repo root: bash apps/driver-app/scripts/build-apk.sh

set -e

echo "🔨 Step 1: Building admin React app..."
cd apps/admin
npm run build
echo "✅ Admin build complete"

echo "📱 Step 2: Syncing web assets to Android project..."
cd ../driver-app
npx cap sync android
echo "✅ Capacitor sync complete"

echo "🏗️ Step 3: Building release APK..."
cd android
./gradlew assembleRelease
echo "✅ APK built"

# Copy APK to distribution directory
APK_PATH="app/build/outputs/apk/release/app-release.apk"
DIST_DIR="../../../services/api/static/downloads"
mkdir -p "$DIST_DIR"
cp "$APK_PATH" "$DIST_DIR/smart-laundry-driver.apk"

echo ""
echo "🎉 Done! APK available at:"
echo "   Local: $DIST_DIR/smart-laundry-driver.apk"
echo "   URL:   https://your-domain.com/downloads/smart-laundry-driver.apk"
echo ""
echo "📲 Send this link to drivers to install."
