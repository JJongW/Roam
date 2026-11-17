import "server-only";
import type { Repository } from "@/lib/repositories/types";
import { buildRow, CONFIDENCE_SOURCE_PREFIX, HANDLE_CONFIDENCES, type BoardRow, type BoardSource, type HandleConfidence } from "@/lib/brands/board";
import type { ImportTarget } from "@/lib/brands/handle-import";
import { confirmedItems } from "@/lib/brands/profile";
import { getOutreachStore, subjectsFromGraph, type OutreachMode } from "@/lib/brands/outreach-store";
import type { Exhibition, ProfileField } from "@/lib/types";

/**
 * 연락 보드의 데이터 길목 하나. 화면과 API는 이 함수가 주는 `BoardRow`만 본다.
 *
 * 줄은 그 박람회의 **출전**이다(부스가 아니다). 부스 번호는 대표 배정 부스가 있으면 붙는 칸일 뿐이다
 * (2026-11-17 Ted: "브랜드가 우선, 부스는 그 이후"). 저장 자리는 outreach-store.ts가 고른다.
 *
 * ⚠️ 부스는 목록 조회(BoothListItem)다 — 여기서 쓰는 칸(code, kind, instagramUrl)은
 * 목록 조회가 가져오는 칸이다(CLAUDE.md "없음과 비어 있음").
 */
export async function loadContactBoard(
  repo: Repository,
  exhibition: Exhibition,
  today: string,
): Promise<{ rows: BoardRow[]; targets: ImportTarget[]; mode: OutreachMode; unlinkedBooths: number }> {
  const [booths, graph, store] = await Promise.all([
    repo.listBoothsByExhibitionId(exhibition.id),
    repo.loadExhibitorGraph(),
    getOutreachStore(repo),
  ]);
  const participants = graph.participants.filter((p) => p.exhibitionId === exhibition.id);
  const exhibitorById = new Map(graph.exhibitors.map((e) => [e.id, e]));
  const boothById = new Map(booths.map((b) => [b.id, b]));
  const subjects = subjectsFromGraph(graph, participants.map((p) => p.id));
  const states = await store.read(subjects);

  // 아직 브랜드로 정리되지 않은 부스(백필 전). 출전이 없어 줄이 될 수 없다 — 개수만 알린다.
  const linkedBooths = new Set(subjects.flatMap((s) => (s.boothId ? [s.boothId] : [])));
  const unlinkedBooths = booths.filter((b) => (b.kind ?? "exhibitor") === "exhibitor" && !linkedBooths.has(b.id)).length;

  const exhibitorIds = [...new Set(participants.map((p) => p.exhibitorId))];
  const fields = exhibitorIds.length ? await repo.listProfileFields({ exhibitorIds }) : [];
  const fieldOf = new Map<string, ProfileField>();
  for (const f of fields) if (f.exhibitorId) fieldOf.set(`${f.exhibitorId}:${f.field}`, f);
  const profileInstagram = (exhibitorId: string) => {
    const links = fieldOf.get(`${exhibitorId}:links`);
    if (!links || !Array.isArray(links.value)) return null;
    const url = (links.value as { kind?: string; url?: string }[]).find((l) => l.kind === "instagram")?.url;
    return url ? { url, confidence: confidenceFromSources(links.sources) } : null;
  };

  const brandHandles = (exhibitorId: string): BoardSource["handles"] => {
    const ig = profileInstagram(exhibitorId);
    return [
      ...(ig ? [{ value: ig.url, confidence: ig.confidence }] : []),
      { value: exhibitorById.get(exhibitorId)?.instagramUrl, confidence: "official" as const },
    ];
  };
  // DM 품목 자리는 확인된 칸만. AI 초안이 "공식 계정에 소개된" 사실처럼 브랜드에게 나가지 않게 한다.
  const itemsOf = (exhibitorId: string) => confirmedItems(fieldOf.get(`${exhibitorId}:items`));

  const nameOf = new Map(participants.map((p) => [p.id, p.displayName]));
  const rows: BoardRow[] = subjects.map((s) => {
    const booth = s.boothId ? boothById.get(s.boothId) : undefined;
    const st = states.get(s.participantId);
    return buildRow(
      {
        ref: { participantId: s.participantId, exhibitorId: s.exhibitorId, boothId: s.boothId },
        name: nameOf.get(s.participantId) ?? booth?.name ?? "",
        code: booth?.code ?? null,
        view: st?.view ?? null,
        writable: st?.writable ?? false,
        logs: st?.logs ?? [],
        // 브랜드 연락처(view.handle)가 먼저고(buildRow), 그다음 부스 링크, 브랜드 프로필, 브랜드 공식 링크.
        handles: [...(booth ? [{ value: booth.instagramUrl, confidence: "official" as const }] : []), ...brandHandles(s.exhibitorId)],
        items: itemsOf(s.exhibitorId),
      },
      today,
    );
  });

  // csv 가져오기는 브랜드에 쓴다 — 이 박람회의 브랜드와 그 이름들.
  const targets = new Map<string, ImportTarget>();
  for (const p of participants) {
    const e = exhibitorById.get(p.exhibitorId);
    const t = targets.get(p.exhibitorId) ?? { exhibitorId: p.exhibitorId, names: [], currentHandle: null };
    t.names.push(p.displayName, ...(p.aliases ?? []), ...(e ? [e.canonicalName, ...(e.aliases ?? [])] : []));
    // 이미 있는 인스타: 프로필 links 칸, 없으면 브랜드 공식 링크. 다르면 충돌로 보여 주고 덮지 않는다.
    t.currentHandle = profileInstagram(p.exhibitorId)?.url ?? e?.instagramUrl ?? t.currentHandle;
    targets.set(p.exhibitorId, t);
  }
  return { rows, targets: [...targets.values()], mode: store.mode, unlinkedBooths };
}

function confidenceFromSources(sources: string[]): HandleConfidence {
  const tag = sources.find((s) => s.startsWith(CONFIDENCE_SOURCE_PREFIX))?.slice(CONFIDENCE_SOURCE_PREFIX.length);
  return (HANDLE_CONFIDENCES as readonly string[]).includes(tag ?? "") ? (tag as HandleConfidence) : "official";
}
