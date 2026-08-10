#!/bin/sh
# Sync /repo with origin/main before n8n reads files.
# Exits non-zero (failing the Execute Command node) on anything that needs a human.
set -e
cd /repo

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: /repo has uncommitted changes before pull, aborting." >&2
  git status --porcelain >&2
  exit 1
fi

git fetch origin main

if git merge --ff-only origin/main 2>/dev/null; then
  echo "OK: fast-forwarded to $(git rev-parse --short HEAD)"
  exit 0
fi

if git merge --no-edit origin/main; then
  echo "OK: merged origin/main -> $(git rev-parse --short HEAD)"
  exit 0
else
  echo "ERROR: merge conflict pulling origin/main. Resolve manually in /root/n8n-repo (host) / /repo (container)." >&2
  git merge --abort
  exit 1
fi
