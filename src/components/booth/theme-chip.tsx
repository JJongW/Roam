import { primaryThemeFromTags, themeLabel } from "@/lib/booth/themes";

/**
 * 부스의 대표 테마(무엇을 그리는가) 한 개. 카테고리 칩(국내작가/기업)이 "누구인가"를
 * 말한다면 이건 "무엇을 그리는가"다 — 방문객의 취향이 실제로 붙는 축이라 먼저 읽히게
 * 카테고리보다 앞에 둔다. 근거가 없는 부스(소개가 부스코드·날짜뿐)엔 그리지 않는다.
 */
export function ThemeChip({ tags }: { tags: string[] }) {
  const key = primaryThemeFromTags(tags);
  if (!key) return null;
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
      {themeLabel(key)}
    </span>
  );
}
