#!/usr/bin/env sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
manifest_path="$repo_root/sdks.json"
workspace_root="$repo_root"
dry_run=0

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-sdks.sh [--manifest path] [--workspace-root path] [--dry-run]

Clone or fast-forward the standalone SDK repositories declared in sdks.json into this workspace.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --manifest)
      manifest_path="$2"
      shift 2
      ;;
    --workspace-root)
      workspace_root="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v git >/dev/null 2>&1; then
  echo "bootstrap-sdks: git is required" >&2
  exit 1
fi

run() {
  printf '+ %s\n' "$*"
  if [ "$dry_run" -eq 0 ]; then
    "$@"
  fi
}

emit_manifest_rows() {
  if command -v node >/dev/null 2>&1; then
    node --input-type=module -e '
import { readFileSync } from "node:fs";

const manifestPath = process.argv[1];
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (!Array.isArray(manifest.repositories)) {
  throw new Error("sdks.json must define a repositories array");
}

for (const repository of manifest.repositories) {
  if (
    !repository ||
    typeof repository.path !== "string" ||
    typeof repository.cloneUrl !== "string" ||
    typeof repository.branch !== "string"
  ) {
    throw new Error("Each sdk repository must include string path, cloneUrl, and branch fields");
  }

  process.stdout.write(`${repository.path}\t${repository.cloneUrl}\t${repository.branch}\n`);
}
' "$manifest_path"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "$manifest_path"
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    manifest = json.load(handle)

repositories = manifest.get('repositories')
if not isinstance(repositories, list):
    raise SystemExit('sdks.json must define a repositories array')

for repository in repositories:
    if not isinstance(repository, dict):
        raise SystemExit('Each sdk repository must be an object')
    path = repository.get('path')
    clone_url = repository.get('cloneUrl')
    branch = repository.get('branch')
    if not all(isinstance(value, str) for value in (path, clone_url, branch)):
        raise SystemExit('Each sdk repository must include string path, cloneUrl, and branch fields')
    print(f'{path}\t{clone_url}\t{branch}')
PY
    return
  fi

  if command -v python >/dev/null 2>&1; then
    python - <<'PY' "$manifest_path"
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    manifest = json.load(handle)

repositories = manifest.get('repositories')
if not isinstance(repositories, list):
    raise SystemExit('sdks.json must define a repositories array')

for repository in repositories:
    if not isinstance(repository, dict):
        raise SystemExit('Each sdk repository must be an object')
    path = repository.get('path')
    clone_url = repository.get('cloneUrl')
    branch = repository.get('branch')
    if not all(isinstance(value, str) for value in (path, clone_url, branch)):
        raise SystemExit('Each sdk repository must include string path, cloneUrl, and branch fields')
    print(f'{path}\t{clone_url}\t{branch}')
PY
    return
  fi

  if command -v ruby >/dev/null 2>&1; then
    ruby -r json -e '
manifest = JSON.parse(File.read(ARGV[0]))
repositories = manifest["repositories"]
raise "sdks.json must define a repositories array" unless repositories.is_a?(Array)

repositories.each do |repository|
  raise "Each sdk repository must be an object" unless repository.is_a?(Hash)
  path = repository["path"]
  clone_url = repository["cloneUrl"]
  branch = repository["branch"]
  unless [path, clone_url, branch].all? { |value| value.is_a?(String) }
    raise "Each sdk repository must include string path, cloneUrl, and branch fields"
  end

  puts [path, clone_url, branch].join("\t")
end
' "$manifest_path"
    return
  fi

  echo "bootstrap-sdks: install node, python3, python, or ruby to read $manifest_path" >&2
  exit 1
}

emit_manifest_rows |
while IFS="$(printf '\t')" read -r relative_path clone_url branch; do
  [ -n "$relative_path" ] || continue
  target_path="$workspace_root/$relative_path"
  parent_dir=$(dirname "$target_path")

  if [ -d "$target_path/.git" ]; then
    run git -C "$target_path" fetch --prune origin
    run git -C "$target_path" checkout "$branch"
    run git -C "$target_path" pull --ff-only origin "$branch"
    continue
  fi

  if [ -e "$target_path" ]; then
    echo "bootstrap-sdks: refusing to overwrite non-git path $target_path" >&2
    exit 1
  fi

  run mkdir -p "$parent_dir"
  run git clone --branch "$branch" --single-branch "$clone_url" "$target_path"
done