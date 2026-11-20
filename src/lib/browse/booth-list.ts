// UI 8 둘러보기의 부스 목록(L-B 분류 먼저, 11-11). 화면 없이 셀 수 있게 순수 함수로 둔다.
//
// - 편의시설(kind=facility)은 부스 목록에 넣지 않는다(지도 찾기 줄과 같은 규칙).
// - 분류는 부스 데이터의 categoryId를 따른다. 분류가 없거나 이 박람회 분류 목록에 없는 부스는
//   "그 밖" 한 줄에 모아 맨 아래 둔다(Figma 8-01).
// - 분류 줄은 곳 수가 많은 순. 같은 수면 이름 순.
// - 분류 속 부스는 부스 번호 순(8-02 "부스 번호 순이에요"). 번호가 없는 부스는 뒤에 이름 순(설계서 8-02
//   "번호가 없는 부스의 정렬 자리 미정" — 지어 넣지 않고 뒤로 보낸다).

export interface ListBooth {
  id: string;
  name: string;
  code?: string;
  categoryId?: string;
  /** 배치도 홀 이름(지도와 같은 말). 없으면 부스 데이터의 홀 이름. */
  hall?: string;
  /** 사진 자리. 부스 사진 첫 장, 없으면 로고. 둘 다 없으면 회색 자리. */
  image?: string;
}

export const OTHER_CATEGORY = "__other__";

export interface CategoryGroup {
  /** 분류 id. 분류 없는 줄은 OTHER_CATEGORY. */
  id: string;
  name: string;
  booths: ListBooth[];
}

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

/** 부스 번호 순(A2 < A10), 번호 없는 부스는 뒤에 이름 순. */
export function byBoothNumber(a: ListBooth, b: ListBooth): number {
  if (a.code && b.code) return collator.compare(a.code, b.code) || collator.compare(a.name, b.name);
  if (a.code) return -1;
  if (b.code) return 1;
  return collator.compare(a.name, b.name);
}

export function groupByCategory(
  booths: ListBooth[],
  categories: { id: string; name: string }[],
  otherName: string,
): CategoryGroup[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, ListBooth[]>();
  for (const b of booths) {
    const id = b.categoryId && nameById.has(b.categoryId) ? b.categoryId : OTHER_CATEGORY;
    const list = groups.get(id);
    if (list) list.push(b);
    else groups.set(id, [b]);
  }
  return [...groups.entries()]
    .map(([id, list]) => ({
      id,
      name: id === OTHER_CATEGORY ? otherName : nameById.get(id)!,
      booths: [...list].sort(byBoothNumber),
    }))
    .sort((a, b) => {
      if (a.id === OTHER_CATEGORY) return 1;
      if (b.id === OTHER_CATEGORY) return -1;
      return b.booths.length - a.booths.length || collator.compare(a.name, b.name);
    });
}

/** 부스가 실제로 있는 홀만, 주어진 홀 순서대로(8-01 "A홀부터 D홀까지"). */
export function hallsInOrder(order: string[], booths: ListBooth[]): string[] {
  const present = new Set(booths.map((b) => b.hall).filter(Boolean));
  return order.filter((h) => present.has(h));
}
