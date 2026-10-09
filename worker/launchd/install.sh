#!/bin/zsh
# 워커 전용 worktree를 만들고 launchd에 등록한다. 다시 돌려도 안전하다.
#   zsh worker/launchd/install.sh
set -euo pipefail
REPO="${0:A:h}/../.."
REPO="${REPO:A}"
WT="${REPO}-worker"
LABEL=kr.roam.worker
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# bootout은 비동기다 — 내린 직후 바로 bootstrap하면 "5: Input/output error"로 실패하고,
# set -e라 그 뒤(적체 점검 등록)가 통째로 안 돈다. 다 내려갈 때까지 기다린다.
reload() {
  local label=$1 plist=$2
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  for _ in {1..40}; do
    launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1 || break
    sleep 0.25
  done
  launchctl bootstrap "gui/$(id -u)" "$plist"
}

git -C "$REPO" fetch -q origin main
[[ -d "$WT" ]] || git -C "$REPO" worktree add -q --detach "$WT" origin/main
# 비밀값은 복사하지 않고 원본을 가리킨다 — 키를 바꾸면 한 곳만 고치면 된다.
ln -sf "$REPO/.env" "$WT/.env"

sed -e "s|__WORKTREE__|$WT|g" -e "s|__NODE_BIN__|${$(command -v node):h}|g" -e "s|__HOME__|$HOME|g" \
  "$REPO/worker/launchd/$LABEL.plist" > "$PLIST"

reload "$LABEL" "$PLIST"
echo "등록됨: $LABEL → $WT  (로그: ~/Library/Logs/roam-worker.log)"

# 적체 점검(하루 한 번) — 상시 워커와 같은 worktree에서 별도 프로세스로 돈다.
SWEEP=kr.roam.sweep
SWEEP_PLIST="$HOME/Library/LaunchAgents/$SWEEP.plist"
sed -e "s|__WORKTREE__|$WT|g" -e "s|__NODE_BIN__|${$(command -v node):h}|g" -e "s|__HOME__|$HOME|g" \
  "$REPO/worker/launchd/$SWEEP.plist" > "$SWEEP_PLIST"
reload "$SWEEP" "$SWEEP_PLIST"
echo "등록됨: $SWEEP  (매일 09:30, 로그: ~/Library/Logs/roam-sweep.log)"
