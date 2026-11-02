/**
 * 인스타 댓글 → 자동 DM 규칙. 댓글에 키워드가 들어 있으면 그 규칙의 메시지를
 * 댓글 단 사람에게 DM(Private Reply)으로 한 번 보낸다.
 *
 * 규칙은 코드에 둔다 — 카드뉴스 한 편에 규칙 하나 수준이라 관리 화면을 만들 만큼
 * 자주 바뀌지 않는다. 바꾸면 배포한다.
 *
 * 문구 규칙: 화자는 Roam 계정, 해요체(Roam-design `docs/content/card-news/README.md`).
 * publicReply에는 **어떤 규칙의 키워드도 넣지 않는다** — 내 계정 답글이 다시
 * 웹훅으로 들어와도 handle.ts가 자기 댓글을 거르지만, 이중 안전장치다.
 */
export interface DmRule {
  id: string;
  /** 정규화(공백·문장부호 제거, 소문자) 후 부분 일치. */
  keywords: string[];
  /** 지정하면 이 게시물들의 댓글에만 반응한다. 비우면 모든 게시물. */
  mediaIds?: string[];
  /** DM 본문. Private Reply는 댓글당 한 번만 보낼 수 있다. */
  message: string;
  /** 댓글에 공개로 다는 답글(선택). DM이 메시지 요청함에 숨는 경우를 안내한다. */
  publicReply?: string;
}

export const DM_RULES: DmRule[] = [
  {
    id: "ddp-map",
    keywords: ["지도"],
    message: [
      "안녕하세요, Roam이에요 🗺️",
      "DDP디자인페어 부스와 아트홀 입구·출구 위치는 여기서 볼 수 있어요.",
      "https://roam.ai.kr/exhibitions/ddp-designfair-2026/map",
      "",
      "로그인 없이도 둘러볼 수 있어요.",
    ].join("\n"),
    publicReply: "DM으로 보내드렸어요! 안 보이면 메시지 요청함을 확인해 주세요.",
  },
];

/** 비교용 정규화 — 공백·문장부호·기호를 지우고 소문자로. "지 도!" → "지도". */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

export function matchRule(
  text: string,
  mediaId: string | undefined,
  rules: DmRule[] = DM_RULES,
): DmRule | null {
  const t = normalizeForMatch(text);
  if (!t) return null;
  return (
    rules.find(
      (r) =>
        (!r.mediaIds || (mediaId !== undefined && r.mediaIds.includes(mediaId))) &&
        r.keywords.some((k) => t.includes(normalizeForMatch(k))),
    ) ?? null
  );
}
