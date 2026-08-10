#!/bin/sh
# Commit and push whatever n8n just wrote into /repo.
# Usage: git-push.sh ["commit message"]
# Exits non-zero (failing the Execute Command node) on anything that needs a human.
set -e
cd /repo

MSG="${1:-update via n8n $(date -u +%Y-%m-%dT%H:%M:%SZ)}"

if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -m "$MSG"
elif [ -z "$(git log origin/main..HEAD 2>/dev/null)" ]; then
  echo "OK: nothing to commit and nothing ahead of origin"
  exit 0
fi

if git push origin main 2>/tmp/push.log; then
  echo "OK: pushed $(git rev-parse --short HEAD)"
  exit 0
fi

echo "push rejected, retrying after fetch+rebase..." >&2
git fetch origin main

if git rebase origin/main 2>/tmp/rebase.log && git push origin main; then
  echo "OK: pushed after rebase $(git rev-parse --short HEAD)"
  exit 0
else
  echo "ERROR: push failed even after rebase. Resolve manually in /root/n8n-repo (host) / /repo (container)." >&2
  cat /tmp/push.log /tmp/rebase.log >&2
  git rebase --abort 2>/dev/null || true
  exit 1
fi
