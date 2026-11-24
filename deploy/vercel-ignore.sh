#!/usr/bin/env bash
# Vercel Ignored Build Step helper.
# Exit 0 to skip the build, 1 to build.
# Safe default: build on any error or missing history.
set -u
app="${1:-}"
if [ -z "$app" ]; then exit 1; fi

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$root" ]; then cd "$root" || exit 1; fi

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
curr="${VERCEL_GIT_COMMIT_SHA:-}"
if [ -z "$curr" ]; then curr="HEAD"; fi
if [ -z "$prev" ] || [ "$prev" = "$curr" ]; then exit 1; fi

if git diff --quiet "$prev" "$curr" -- \
  "apps/$app" \
  packages \
  pnpm-lock.yaml \
  package.json \
  pnpm-workspace.yaml \
  tsconfig.base.json \
  eslint.config.mjs \
  deploy/vercel-ignore.sh
then
  echo "Skipping $app: no relevant changes since $prev"
  exit 0
fi
exit 1
