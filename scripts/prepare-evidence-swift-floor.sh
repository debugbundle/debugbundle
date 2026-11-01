#!/bin/sh
# Extract the signed upstream floor toolchain locally; never run its installer.
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task_dir="$task_root/.tmp/swift-5.10"
task_pkg="$task_dir/swift-5.10-RELEASE-osx.pkg"
mkdir -p "$task_dir"
if [ ! -f "$task_pkg" ]; then
  curl --fail --location --retry 2 --output "$task_pkg.partial" \
    https://download.swift.org/swift-5.10-release/xcode/swift-5.10-RELEASE/swift-5.10-RELEASE-osx.pkg
  mv "$task_pkg.partial" "$task_pkg"
fi
pkgutil --check-signature "$task_pkg" > "$task_dir/signature.txt"
cat "$task_dir/signature.txt"
grep -F 'Status: signed by a developer certificate issued by Apple for distribution' "$task_dir/signature.txt" >/dev/null
grep -F 'Developer ID Installer: Swift Open Source (V9AUD2URP3)' "$task_dir/signature.txt" >/dev/null
shasum -a 256 "$task_pkg" > "$task_dir/package.sha256"
if [ ! -d "$task_dir/extracted" ]; then
  pkgutil --expand-full "$task_pkg" "$task_dir/extracted"
fi
find "$task_dir/extracted" -path '*/usr/bin/swift' -print > "$task_dir/compiler-paths.txt"
test "$(wc -l < "$task_dir/compiler-paths.txt" | tr -d ' ')" = 1
task_swift=$(cat "$task_dir/compiler-paths.txt")
test -x "$task_swift"
"$task_swift" --version | tee "$task_dir/version.txt"
grep -F 'Swift version 5.10 ' "$task_dir/version.txt" >/dev/null
