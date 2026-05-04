#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="https://github.com/garrytan/gstack.git"
ORIGIN_URL="https://github.com/g4mm4p4nd4/gstack.git"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
BASE_BRANCH="$(git branch --show-current)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SYNC_BRANCH="${SYNC_BRANCH:-codex/upstream-sync-${STAMP}}"

if [[ -z "${BASE_BRANCH}" ]]; then
  echo "Refusing to sync from detached HEAD." >&2
  exit 1
fi

ensure_remote() {
  local name="$1"
  local url="$2"
  if git remote get-url "$name" >/dev/null 2>&1; then
    git remote set-url "$name" "$url"
  else
    git remote add "$name" "$url"
  fi
}

dirty_tracked="$(git status --porcelain --untracked-files=no)"
if [[ -n "${dirty_tracked}" ]]; then
  echo "Refusing to start upstream sync with dirty tracked files:" >&2
  echo "${dirty_tracked}" >&2
  exit 1
fi

ensure_remote origin "${ORIGIN_URL}"
ensure_remote upstream "${UPSTREAM_URL}"

git fetch origin --prune
git fetch upstream --prune

local_only="$(git rev-list --count "upstream/${UPSTREAM_BRANCH}..${BASE_BRANCH}")"
upstream_only="$(git rev-list --count "${BASE_BRANCH}..upstream/${UPSTREAM_BRANCH}")"

echo "Base branch: ${BASE_BRANCH}"
echo "Sync branch: ${SYNC_BRANCH}"
echo "Local-only commits: ${local_only}"
echo "Upstream-only commits: ${upstream_only}"

if [[ "${upstream_only}" == "0" ]]; then
  echo "Already contains upstream/${UPSTREAM_BRANCH}; nothing to merge."
  exit 0
fi

git switch -c "${SYNC_BRANCH}"

set +e
git merge --no-ff --no-commit "upstream/${UPSTREAM_BRANCH}"
merge_status="$?"
set -e

if [[ "${merge_status}" == "0" ]]; then
  echo "Merge staged cleanly. Run verification, commit, fast-forward ${BASE_BRANCH}, then push origin ${BASE_BRANCH}."
  exit 0
fi

echo "Merge has conflicts. Resolve them, then run verification and commit on ${SYNC_BRANCH}."
exit "${merge_status}"
