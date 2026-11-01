#!/usr/bin/env python3
"""Run installed native evidence on a workspace-owned headless Android emulator."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
SDK = ROOT / ".tmp/android-macos"
USER = ROOT / ".tmp/android-emulator-home"
AVD = USER / "avd"
SERIAL = "emulator-5580"
CONSUMER = ROOT / "sdks/debugbundle-android/smoke/android-consumer"
ENV = {**os.environ, "ANDROID_HOME": str(SDK), "ANDROID_SDK_ROOT": str(SDK),
       "ANDROID_USER_HOME": str(USER), "ANDROID_AVD_HOME": str(AVD),
       "ANDROID_SDK_HOME": str(USER), "ANDROID_ADB_SERVER_PORT": "5047",
       "ADB_SERVER_SOCKET": "tcp:localhost:5047"}


def run(args, **kwargs):
    kwargs.setdefault('timeout', 180)
    return subprocess.run([str(arg) for arg in args], env=ENV, check=True, text=True, **kwargs)


def adb(*args, **kwargs):
    return run([SDK / "platform-tools/adb", "-P", "5047", "-s", SERIAL, *args], **kwargs)


def built_apk(directory, application_id):
    metadata = json.loads((directory / 'output-metadata.json').read_text())
    if metadata.get('applicationId') != application_id or len(metadata.get('elements', [])) != 1:
        raise RuntimeError(f'Unexpected APK metadata in {directory}')
    artifact = directory / metadata['elements'][0]['outputFile']
    if artifact.resolve().parent != directory.resolve():
        raise RuntimeError('APK output escaped its build directory')
    return artifact


def file_identity(path):
    return {"path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', choices=['23', '36', '37'], default='37')
    parser.add_argument('--react-native', action='store_true')
    parser.add_argument('--performance', action='store_true')
    args = parser.parse_args()
    NAME = f"debugbundle-evidence-api{args.api}"
    receipt_base = ROOT / ".tmp/evidence-release" / f"android-api{args.api}"
    image_package = ("system-images;android-37.0;google_apis;arm64-v8a" if args.api == '37'
                     else f"system-images;android-{args.api};default;arm64-v8a")
    apk = built_apk(CONSUMER / "build/outputs/apk/debug", 'com.debugbundle.smoke')
    tests = built_apk(CONSUMER / "build/outputs/apk/androidTest/debug", 'com.debugbundle.smoke.test')
    for path in [apk, tests, SDK / "emulator/emulator"]:
        if not path.is_file():
            raise SystemExit(f"Build/provision required first: {path}")
    # Never attach to or terminate another task's ADB server or device.
    for port in [5047, 5580, 5581]:
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
            probe.listen(1)
    AVD.mkdir(parents=True, exist_ok=True)
    receipt_base.mkdir(parents=True, exist_ok=True)
    mode = "react-native" if args.react_native else "performance" if args.performance else "native"
    RECEIPTS = Path(tempfile.mkdtemp(prefix=mode + "-", dir=receipt_base))
    maven = ROOT / "sdks/debugbundle-android/.tmp/evidence-maven"
    artifacts = sorted(path for path in maven.rglob("*") if path.is_file() and not path.is_symlink())
    if not artifacts:
        raise RuntimeError('Installed Android Maven artifacts are missing')
    inputs = {"api": args.api, "mode": mode, "artifacts": [file_identity(path) for path in artifacts],
              "application": file_identity(apk), "instrumentation": file_identity(tests),
              "runner": file_identity(Path(__file__).resolve())}
    (RECEIPTS / "inputs.json").write_text(json.dumps(inputs, indent=2) + "\n")
    print(f"Isolated Android receipt: {RECEIPTS}", flush=True)
    avd_metadata = AVD / f"{NAME}.ini"
    expected_target = 'android-37.0' if args.api == '37' else f'android-{args.api}'
    if not avd_metadata.exists() or f'target={expected_target}\n' not in avd_metadata.read_text():
        run(["docker", "run", "--rm", "-i", "--platform", "linux/arm64",
             "-v", f"{SDK}:{SDK}", "-v", f"{USER}:{USER}",
             "-e", "REPO_OS_OVERRIDE=macosx", "-e", f"ANDROID_HOME={SDK}",
             "-e", f"ANDROID_SDK_ROOT={SDK}", "-e", f"ANDROID_USER_HOME={USER}",
             "-e", f"ANDROID_AVD_HOME={AVD}", "gradle:9.4.1-jdk21",
             str(SDK / "cmdline-tools/23.0/bin/avdmanager"), "create", "avd", "--force", "--name", NAME,
             "--path", str(AVD / f"{NAME}.avd"), "--package",
             image_package, "--device", "pixel"], input="no\n")
    if f'target={expected_target}\n' not in avd_metadata.read_text():
        raise RuntimeError('AVD manager did not preserve the selected Android API identity')
    emulator = None
    try:
        run([SDK / "platform-tools/adb", "-P", "5047", "start-server"])
        with (RECEIPTS / "emulator.log").open("w") as log:
            emulator = subprocess.Popen([str(SDK / "emulator/emulator"), "-avd", NAME,
                "-port", "5580", "-no-window", "-no-audio", "-no-boot-anim", "-no-metrics",
                "-no-snapshot", "-accel", "on", "-gpu", "swiftshader", "-memory", "2048", "-cores", "2"],
                env=ENV, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 240
            while time.monotonic() < deadline:
                if emulator.poll() is not None:
                    raise RuntimeError(f"Emulator exited {emulator.returncode}; inspect {RECEIPTS / 'emulator.log'}")
                try:
                    result = subprocess.run([str(SDK / "platform-tools/adb"), "-P", "5047", "-s", SERIAL,
                        "shell", "getprop", "sys.boot_completed"], env=ENV, text=True, capture_output=True, timeout=10)
                except subprocess.TimeoutExpired:
                    continue
                if result.returncode == 0 and result.stdout.strip() == "1":
                    break
                time.sleep(2)
            else:
                raise RuntimeError("Workspace emulator did not boot within four minutes")
            identity = adb("shell", "getprop", capture_output=True).stdout
            (RECEIPTS / "runtime.txt").write_text(identity)
            if not re.search(r"\[ro.build.version.sdk\]: \[" + args.api + r"\]", identity):
                raise RuntimeError(f"Expected Android API{args.api} runtime")
            adb("install", "-r", str(apk))
            adb("install", "-r", str(tests))
            result = adb("shell", "am", "instrument", "-w", "-r", "-e", "class",
                "com.debugbundle.smoke.InstalledEvidenceDeviceTest",
                "com.debugbundle.smoke.test/androidx.test.runner.AndroidJUnitRunner", capture_output=True, timeout=180)
            (RECEIPTS / "instrumentation.txt").write_text(result.stdout + result.stderr)
            print(result.stdout, flush=True)
            if "OK (1 test)" not in result.stdout or "FAILURES" in result.stdout or "INSTRUMENTATION_FAILED" in result.stdout:
                raise RuntimeError("Installed native device evidence did not pass exactly one required test")
            print(f"Actual API{args.api} arm64 installed native cause/recovery/privacy/capability delivery passed", flush=True)
            if args.performance:
                comparison = adb("shell", "am", "instrument", "-w", "-r", "-e", "class",
                    "com.debugbundle.smoke.InstalledEvidencePerformanceTest",
                    "com.debugbundle.smoke.test/androidx.test.runner.AndroidJUnitRunner", capture_output=True, timeout=240)
                (RECEIPTS / "performance.txt").write_text(comparison.stdout + comparison.stderr)
                print(comparison.stdout, flush=True)
                if "OK (1 test)" not in comparison.stdout or comparison.stdout.count('"capture_ns_per_pair"') != 12:
                    raise RuntimeError('ART performance comparison did not pass with twelve measured rows')
            if args.react_native:
                rn = ROOT / 'sdks/debugbundle-react-native'
                archive = rn / '.smoke/debugbundle-sdk-react-native-3.1.0.tgz'
                archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
                shutil.copytree(ROOT / 'sdks/debugbundle-android/.tmp/evidence-maven', rn / '.smoke/android-maven', dirs_exist_ok=True)
                rn_env = {**ENV, 'PATH': str(SDK / 'platform-tools') + os.pathsep + ENV.get('PATH', ''),
                    'ANDROID_SERIAL': SERIAL,
                    'ANDROID_SDK_ROOT': str(ROOT / 'sdks/debugbundle-android/.android-sdk'),
                    'ANDROID_HOME': str(ROOT / 'sdks/debugbundle-android/.android-sdk'),
                    'ANDROID_USER_HOME': str(ROOT / 'sdks/debugbundle-android/.android-home'),
                    'RN_SMOKE_REUSE_STAGED_ANDROID': '1', 'RN_SMOKE_VERSION': '0.87.1',
                    'RN_SMOKE_ANDROID_ARCHITECTURES': 'arm64-v8a',
                    'RN_SMOKE_EVIDENCE_PERFORMANCE': '1',
                    'RN_SMOKE_CLI_VERSION': '20.1.3',
                    'RN_SMOKE_APKANALYZER': str(ROOT / 'scripts/evidence-android-apk-manifest.sh')}
                subprocess.run(['node', str(rn / 'scripts/smoke-react-native-app.mjs'),
                    '--android', '--runtime', '--skip-build'], cwd=rn, env=rn_env, check=True, timeout=1800)
                if hashlib.sha256(archive.read_bytes()).hexdigest() != archive_hash:
                    raise RuntimeError('React Native smoke repacked different bytes; refresh exact-artifact qualification')
                (RECEIPTS / 'react-native-inputs.json').write_text(json.dumps({
                    'archive': file_identity(archive),
                    'application': file_identity(rn / '.smoke/android-output/app-release.apk'),
                }, indent=2) + '\n')
            (RECEIPTS / 'passed.json').write_text(json.dumps({'api': args.api, 'mode': mode}) + '\n')
    finally:
        if emulator is not None:
            emulator.terminate()
            try:
                emulator.wait(timeout=20)
            except subprocess.TimeoutExpired:
                emulator.kill()
                emulator.wait(timeout=10)
        run([SDK / "platform-tools/adb", "-P", "5047", "kill-server"], timeout=20)
