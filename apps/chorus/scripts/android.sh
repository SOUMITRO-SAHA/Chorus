#!/usr/bin/env bash
# Chorus — build, install and launch on the connected Android device.
# Usage: bun run android:install
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${JAVA_HOME:-}" ]; then
  if [ -d /opt/homebrew/opt/openjdk@17 ]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
  elif command -v /usr/libexec/java_home >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
    if [ -n "$JAVA_HOME" ]; then
      export JAVA_HOME
    fi
  fi
fi

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [ ! -d "$ANDROID_HOME" ]; then
  echo "Android SDK not found at $ANDROID_HOME. Set ANDROID_HOME and retry." >&2
  exit 1
fi

if [ -z "${NDK_HOME:-}" ]; then
  NDK_HOME="$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort | tail -1 || true)"
  if [ -n "$NDK_HOME" ]; then
    export NDK_HOME
  fi
fi

export PATH="$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$PATH"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install Android platform-tools and retry." >&2
  exit 1
fi

TARGET="${TARGET:-aarch64}"

DEVICE="${ANDROID_SERIAL:-}"
DEVICES="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
if [ -n "$DEVICE" ]; then
  if ! printf '%s\n' "$DEVICES" | grep -Fxq "$DEVICE"; then
    echo "ANDROID_SERIAL '$DEVICE' is not an authorized connected device." >&2
    exit 1
  fi
else
  DEVICE_COUNT="$(printf '%s\n' "$DEVICES" | awk 'NF { count += 1 } END { print count + 0 }')"
  if [ "$DEVICE_COUNT" -eq 0 ]; then
    echo "No authorized Android device is connected. Connect one or run bun run android:wireless." >&2
    exit 1
  fi
  if [ "$DEVICE_COUNT" -gt 1 ]; then
    printf 'Multiple Android devices are connected:\n%s\nSet ANDROID_SERIAL to the target device and retry.\n' "$DEVICES" >&2
    exit 1
  fi
  DEVICE="$DEVICES"
fi

echo "▸ Building Android APK ($TARGET, debug)…"
bun run tauri android build --target "$TARGET" --debug --apk

APK="src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
if [ ! -f "$APK" ]; then
  echo "Expected APK not found: $APK" >&2
  exit 1
fi

echo "▸ Installing…"
adb -s "$DEVICE" wait-for-device
adb -s "$DEVICE" install -r "$APK"

echo "▸ Launching…"
adb -s "$DEVICE" shell am force-stop com.soumitrasaha.chorus 2>/dev/null || true
adb -s "$DEVICE" shell monkey -p com.soumitrasaha.chorus -c android.intent.category.LAUNCHER 1 >/dev/null

echo "✅ Chorus installed & launched on $DEVICE"
