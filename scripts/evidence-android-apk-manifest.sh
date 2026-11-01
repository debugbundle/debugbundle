#!/bin/sh
set -eu
repo_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
if [ "$#" != 3 ] || [ "$1" != manifest ] || [ "$2" != print ]; then
  echo 'Expected manifest print <synthetic APK>' >&2
  exit 1
fi
apk_path="$3"
case "$apk_path" in
  "$repo_dir"/sdks/debugbundle-react-native/.smoke/*.apk) ;;
  *) echo 'Only the workspace React Native smoke APK is permitted' >&2; exit 1 ;;
esac
docker run --rm --platform linux/amd64 \
  -v "$repo_dir/sdks/debugbundle-android/.android-sdk/build-tools:/android-sdk/build-tools:ro" \
  -v "$repo_dir/.tmp/android-macos/cmdline-tools/23.0:/android-sdk/cmdline-tools/23.0:ro" \
  -v "$apk_path:/fixture.apk:ro" gradle:9.4.1-jdk21 \
  /android-sdk/cmdline-tools/23.0/bin/apkanalyzer manifest print /fixture.apk
