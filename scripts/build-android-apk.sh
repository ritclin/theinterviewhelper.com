#!/usr/bin/env bash
# Build Android APK into public/downloads/interview-helper.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(which javac)")")")}"

cd "$ROOT/mobile-client"
npm install
npx expo prebuild --platform android --no-install
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon
mkdir -p "$ROOT/public/downloads"
cp app/build/outputs/apk/debug/app-debug.apk "$ROOT/public/downloads/interview-helper.apk"
echo "Built: public/downloads/interview-helper.apk"
