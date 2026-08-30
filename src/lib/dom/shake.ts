/** 저장 실패 시 폼 컨테이너를 짧게 흔들어 토스트 옆에 물리적 피드백을 더한다.
 *  transitions.dev 12-error-state-shake를 인라인 필드 에러가 없는 폼(admin 시트)에
 *  맞게 컨테이너 단위로 가볍게 적용한 버전. */
export function shakeElement(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("t-shake");
  void el.offsetWidth; // reflow — 클래스를 다시 붙였을 때 애니메이션이 재생되게 한다
  el.classList.add("t-shake");
}
