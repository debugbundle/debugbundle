#!/bin/sh
set -eu

# Qualification tools only. Keep Darwin binaries separate from the Linux SDK
# used by Gradle; reuse already accepted SDK licences without accepting new ones.
repo_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
sdk_dir="$repo_dir/.tmp/android-macos"
user_dir="$repo_dir/.tmp/android-emulator-home"
api_level="${1:-37}"
case "$api_level" in
  23) image_package='system-images;android-23;default;arm64-v8a'; image_revision=7 ;;
  36) image_package='system-images;android-36;default;arm64-v8a'; image_revision=2 ;;
  37) image_package='system-images;android-37.0;google_apis;arm64-v8a'; image_revision=8 ;;
  *) echo 'Use API23,36 or37' >&2; exit 1 ;;
esac
mkdir -p "$sdk_dir/licenses" "$user_dir"
cp "$repo_dir"/sdks/debugbundle-android/.android-sdk/licenses/* "$sdk_dir/licenses/"
docker run --rm --platform linux/arm64 \
  -v "$repo_dir/sdks/debugbundle-android/.android-sdk/cmdline-tools:/tools:ro" \
  -v "$sdk_dir:/sdk" -v "$user_dir:/user" \
  -e REPO_OS_OVERRIDE=macosx -e ANDROID_USER_HOME=/user \
  gradle:9.4.1-jdk21 /tools/latest/bin/sdkmanager --sdk_root=/sdk --channel=0 emulator platform-tools 'cmdline-tools;23.0' "$image_package" </dev/null
python3 - "$sdk_dir" "$image_package" "$image_revision" <<'PY'
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
root = Path(sys.argv[1])
for package, expected in [('emulator', (37, 2, 12)), ('platform-tools', (37, 0, 1)),
                          ('cmdline-tools/23.0', (23, 0, 0)),
                          (sys.argv[2].replace(';', '/'), (int(sys.argv[3]), 0, 0))]:
    xml = ET.parse(root / package / 'package.xml')
    revision = xml.find('.//revision')
    actual = tuple(int(revision.findtext(part, '0')) for part in ['major', 'minor', 'micro'])
    if actual != expected:
        raise SystemExit(f'{package}: expected {expected}, got {actual}; qualify changed tools explicitly')
    print(f'{package}: pinned revision {actual}')
PY
"$sdk_dir/emulator/emulator" -accel-check
