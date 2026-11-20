// 브랜드 합치기의 순수한 부분. supabase와 mock 저장소가 같이 쓴다.

/**
 * 브랜드를 합칠 때 대상에 남길 이름과 파일 키. 바뀔 게 없으면 null. 순수.
 * - aliases: 대상 것 + from의 대표 이름과 다른 이름(대상 대표 이름과 같은 것은 뺀다). 검색과 이름 후보에만 쓴다.
 * - metadata.brandKeys: 합집합. 같은 brands.v1 파일을 다시 올려도 합친 브랜드를 찾게 한다.
 */
export function carryIdentity(
  from: { canonicalName: string; aliases: string[]; metadata: Record<string, unknown> },
  to: { canonicalName: string; aliases: string[]; metadata: Record<string, unknown> },
): { aliases: string[]; metadata: Record<string, unknown> } | null {
  const keysOf = (m: Record<string, unknown>) => (Array.isArray(m.brandKeys) ? m.brandKeys.filter((k): k is string => typeof k === "string") : []);
  const toKeys = keysOf(to.metadata);
  const brandKeys = [...new Set([...toKeys, ...keysOf(from.metadata)])];
  const aliases = [...new Set([...to.aliases, from.canonicalName, ...from.aliases].map((a) => a.trim()))].filter(
    (a) => a && a !== to.canonicalName.trim(),
  );
  const sameAliases = aliases.length === to.aliases.length && aliases.every((a, i) => a === to.aliases[i]);
  if (sameAliases && brandKeys.length === toKeys.length) return null;
  return { aliases, metadata: brandKeys.length ? { ...to.metadata, brandKeys } : to.metadata };
}

