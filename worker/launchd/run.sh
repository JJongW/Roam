#!/bin/zsh
# launchd가 부르는 워커 진입점 — 맥미니 전용 worktree(Roam-worker)에서 돈다.
#
# 작업 폴더(Roam)에서 돌리면 브랜치를 바꿀 때마다 워커도 그 코드로 돈다. 그래서
# 워커는 자기 worktree를 갖고, 시작할 때마다 origin/main으로 맞춘다. 새 코드를
# 워커에 반영하려면: launchctl kickstart -k gui/$(id -u)/kr.roam.worker
set -euo pipefail
cd "${0:A:h}/../.."

git fetch -q origin main
git checkout -q --detach origin/main

# 의존성은 lockfile이 바뀌었을 때만 다시 깐다(매번 깔면 재시작이 분 단위가 된다).
if ! cmp -s package-lock.json .worker-lock.stamp 2>/dev/null; then
  npm ci --silent --no-audit --no-fund
  cp package-lock.json .worker-lock.stamp
fi

exec npm run worker
