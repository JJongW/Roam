// 앱 이벤트 개인정보 거름망(화면 설계서 E 2-1). 순수 함수.
//
// - 위치를 추적하지 않는다(11-11 결정, 처리방침 "정밀 위치정보 안 씀"). 좌표, 걸음, 방향 키는 버린다.
// - 메모, 회고, 로미에게 묻는 말, 닉네임, 검색어 원문은 넣지 않는다. 길이 구간(len_bucket)만 둔다.
//   검색어 0건 원문 저장은 미정이라 지금은 버린다.
// 이벤트 이름 목록을 서버가 막지는 않는다 — 이름 단일 소스는 iOS 쪽 enum이고(E 6절),
// 서버는 모양과 개인정보만 지킨다.

/** 버리는 속성 키. 소문자 비교, 접두나 접미로 붙은 것도 잡는다(예 user_lat, memo_text). */
const FORBIDDEN_KEY = /(^|_)(lat|lng|lon|latitude|longitude|location|coord|coords|gps|heading|bearing|altitude|step_count|pedometer|memo|recap|text|body|content|nickname|email|query|question|address)($|_)/i;

/** 문자열 속성 최대 길이. 이보다 길면 글 원문일 가능성이 커서 버린다. */
const MAX_STRING = 80;

export function sanitizeProps(props: Record<string, unknown> | undefined): {
  props: Record<string, unknown>;
  dropped: string[];
} {
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(props ?? {})) {
    if (FORBIDDEN_KEY.test(k)) {
      dropped.push(k);
      continue;
    }
    if (typeof v === "string" && v.length > MAX_STRING) {
      dropped.push(k);
      continue;
    }
    out[k] = v;
  }
  return { props: out, dropped };
}
