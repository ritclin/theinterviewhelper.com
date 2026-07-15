#!/usr/bin/env bash
# Build standalone Android release APK (JS embedded — no Metro required)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(which javac)")")")}"

cd "$ROOT/mobile-client"
npm install
npx expo prebuild --platform android --no-install
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon
mkdir -p "$ROOT/public/downloads"
cp app/build/outputs/apk/release/app-release.apk "$ROOT/public/downloads/interview-helper.apk"
echo "Built standalone APK: public/downloads/interview-helper.apk"
