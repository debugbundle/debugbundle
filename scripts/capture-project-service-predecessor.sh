#!/bin/sh
set -eu
mkdir -p .tmp
fixture_dir=$(mktemp -d .tmp/project-service-predecessor.XXXXXX)
cleanup() {
  case "$fixture_dir" in .tmp/project-service-predecessor.*) rm -rf -- "$fixture_dir" ;; esac
}
trap cleanup EXIT INT TERM
revision=$(git rev-parse HEAD)
git archive "$revision" | tar -x -C "$fixture_dir"
docker run --rm --network none -v "$PWD:/workspace" -w /workspace node:24-alpine \
  node --import tsx scripts/capture-project-service-predecessor.ts "$fixture_dir" "$revision"
