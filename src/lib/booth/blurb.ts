// 부스 소개글(description·longDescription)에 **실제 내용**이 있는지 판정한다. 순수·LLM 없음.
//
// 왜 필요한가: 시드가 부스 필드로 소개글을 **합성한다**
// (`${name}의 부스입니다. 부스 번호 ${code}. … 참가사입니다.`). SIF 914곳의 소개는
// 골격이 4종뿐이고 SIBF 256곳은 92종이다 — 즉 1,170곳의 "소개"는 이름과 번호를
// 문장으로 옮긴 것이고 정보가 아니다.
//
// `/api/ai/booth-summary`는 소개가 **비어 있을 때만** 모델을 부르지 않는다
// ("이름과 분야만 주면 모델이 그럴듯한 한 줄을 지어낸다", 2026-10-02). 합성 소개는
// 비어 있지 않지만 들어 있는 정보가 같다 — 같은 이유로 똑같이 막아야 한다.
//
// 판정 방식: **문장 단위로** 시드 템플릿 문장을 버리고, 남은 문장에서 부스 자기
// 필드(이름·코드·회사)를 지운 뒤 글자가 남는지 본다. 문장째로 버리기 때문에 전시명을
// 몰라도 된다 — "2026 서울일러스트레이션페어 참가 해외 기업입니다"가 통째로 빠진다.
// 문구 목록을 쓰는 건 시드가 우리 코드라 문장이 고정이기 때문이다 — 남의 글을
// 추측하는 게 아니다.

/** 시드가 합성한 문장임을 알려주는 표지. `seed*.ts`가 바뀌면 여기도 맞춘다. */
const TEMPLATE_MARKERS = [
  "의 부스입니다",
  "부스 번호",
  "분야:",
  "현장에서 신간 전시와 굿즈, 사인회를 만나볼 수 있어요",
];

/**
 * 시드의 꼬리 문장 — `<전시명> 참가 <분류>입니다`. 분류가 전시마다 다르므로
 * ("참가사"·"참가 브랜드"·"참가 국내 작가"·"참가 해외 기업") 열거하지 않는다.
 *
 * 꼬리를 **짧은 것만** 잡는다. 카페쇼 소개는 "[2025 서울카페쇼 참가 정보] …
 * 글로벌 기업입니다"처럼 참가와 입니다 사이에 실제 내용이 길게 들어 있는데,
 * 길이 제한이 없으면 그 문장을 통째로 버려 실제 정보를 합성으로 오판한다.
 */
const TEMPLATE_TAIL = /참가\s*[가-힣A-Za-z\s]{0,12}입니다\s*$/;

/** 합성이 아닌 실질 내용으로 인정할 최소 글자 수(한글·영문만 센다). */
const MIN_RESIDUE = 15;

export interface BlurbOwnFields {
  name?: string;
  code?: string | null;
  company?: string;
}

/**
 * 소개글에서 템플릿 문장과 부스 자기 필드를 뺀 나머지. 판정 근거를 보고 싶을 때 쓴다.
 */
export function blurbResidue(blurb: string, own: BlurbOwnFields = {}): string {
  const kept = blurb
    .split(/[.。\n]/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !TEMPLATE_MARKERS.some((m) => s.includes(m)) &&
        !TEMPLATE_TAIL.test(s),
    )
    .join(" ");
  let t = kept;
  for (const v of [own.name, own.company]) {
    if (v && v.trim()) t = t.split(v.trim()).join(" ");
  }
  if (own.code) t = t.split(own.code).join(" ");
  // 숫자·기호는 내용으로 세지 않는다 — 템플릿에 연도와 부스번호가 들어 있다.
  return t.replace(/[^가-힣a-zA-Z]/g, "");
}

/**
 * 이 소개글에 모델에게 줄 만한 사실이 들어 있는가.
 * false면 호출하지 않는다 — 합성 문장에서 뽑은 한 줄은 지어낸 것과 같다.
 */
export function hasRealBlurb(
  blurb: string | undefined | null,
  own: BlurbOwnFields = {},
): boolean {
  const text = blurb?.trim();
  if (!text) return false;
  return blurbResidue(text, own).length >= MIN_RESIDUE;
}
