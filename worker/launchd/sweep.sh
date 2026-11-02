#!/bin/zsh
# 검수 적체 점검 — launchd(kr.roam.sweep)가 하루 한 번 부른다.
#
# git을 건드리지 않는다: 상시 워커(run.sh)가 같은 worktree를 checkout하므로
# 동시에 하면 충돌한다. 점검 코드를 고쳐 main에 올린 뒤엔 워커를 재시작하면
# worktree가 따라온다:
#   launchctl kickstart -k gui/$(id -u)/kr.roam.worker
set -euo pipefail
cd "${0:A:h}/../.."
exec npm run sweep
