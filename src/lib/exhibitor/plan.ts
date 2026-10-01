/**
 * 참가사 연결 계획 — 순수. DB도 네트워크도 안 탄다.
 *
 * 부스(이번 회차의 자리)를 참가사(행사를 넘는 정체)에 잇는다. 0040 구조:
 * exhibitor ← exhibition_participant(회차별 표기 이름) ← booth_participant.
 *
 * 규칙(설계 §4): 인스타 계정·웹 도메인이 겹치면 같은 참가사. 이름만 같으면 따로 두고
 * 연결 후보로 남긴다 — 0040 주석의 원칙("이름으로 자동 병합하지 않는다")이고,
 * 2026-10-01에 "분주"의 인스타 검색 1순위가 탄자니아 회사였던 것과 같은 이유다.
 */
import { identityKeys, nameKey } from "./identity";

export interface PlanBooth {
  id: string;
  exhibitionId: string;
  name: string;
  kind?: string;
  instagramUrl?: string;
  websiteUrl?: string;
}

export interface ExistingExhibitor {
  id: string;
  /** identityKeys로 만든 키(인스타·도메인). */
  keys: string[];
  /** 지금까지 회차별로 표기된 이름들 — 이름 후보 판정에만 쓴다. */
  names: string[];
}

export type Ref = { existing: string } | { new: string };

export interface PlanInput {
  booths: PlanBooth[];
  exhibitors?: ExistingExhibitor[];
  /** 기존 참가 사실 — 같은 참가사·같은 회차면 새로 만들지 않고 쓴다. */
  participants?: { id: string; exhibitorId: string; exhibitionId: string }[];
  /** 이미 참가 사실에 배정된 부스. 다시 건드리지 않는다(멱등). */
  assignedBoothIds?: Set<string>;
  /** 이미 판단한 후보 `${boothId}|${exhibitorId}` — 다시 내지 않는다. */
  decidedCandidates?: Set<string>;
}

export interface ExhibitorPlan {
  exhibitors: { key: string; canonicalName: string; instagramUrl?: string; websiteUrl?: string }[];
  participants: { key: string; exhibitorRef: Ref; exhibitionId: string; displayName: string }[];
  assignments: { boothId: string; participantRef: Ref; role: "primary" }[];
  candidates: { boothId: string; target: Ref; reason: string }[];
}

export function planExhibitorLinks(input: PlanInput): ExhibitorPlan {
  const assigned = input.assignedBoothIds ?? new Set<string>();
  const decided = input.decidedCandidates ?? new Set<string>();
  const existing = input.exhibitors ?? [];
  const booths = input.booths.filter((b) => b.kind !== "facility" && !assigned.has(b.id));

  // ── 확정 키로 묶는다(union-find) ─────────────────────────────────────────
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, c: string) => {
    const ra = find(a), rc = find(c);
    // 기존 참가사가 대표가 되게 한다 — 새 부스가 기존 정체에 붙는 방향.
    if (ra === rc) return;
    if (rc.startsWith("ex:")) parent.set(ra, rc);
    else parent.set(rc, ra);
  };
  const byKey = new Map<string, string>();
  const node = (id: string, keys: string[]) => {
    parent.set(id, id);
    for (const k of keys) {
      const seen = byKey.get(k);
      if (seen) union(seen, id);
      else byKey.set(k, id);
    }
  };
  for (const e of existing) node(`ex:${e.id}`, e.keys);
  for (const b of booths) node(b.id, identityKeys(b));

  const groups = new Map<string, PlanBooth[]>();
  for (const b of booths) {
    const r = find(b.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(b);
  }

  const plan: ExhibitorPlan = { exhibitors: [], participants: [], assignments: [], candidates: [] };
  const participantOf = new Map<string, Ref>(); // `${exhibitorKey}|${exhibitionId}`
  for (const p of input.participants ?? []) {
    participantOf.set(`ex:${p.exhibitorId}|${p.exhibitionId}`, { existing: p.id });
  }
  const refOfGroup = new Map<string, Ref>();

  for (const [root, members] of groups) {
    let ref: Ref;
    if (root.startsWith("ex:")) {
      ref = { existing: root.slice(3) };
    } else {
      const key = `new:${root}`;
      ref = { new: key };
      plan.exhibitors.push({
        key,
        canonicalName: members[0].name,
        instagramUrl: members.find((m) => m.instagramUrl)?.instagramUrl,
        websiteUrl: members.find((m) => m.websiteUrl)?.websiteUrl,
      });
    }
    refOfGroup.set(root, ref);
    const exKey = "existing" in ref ? `ex:${ref.existing}` : ref.new;
    for (const m of members) {
      const pk = `${exKey}|${m.exhibitionId}`;
      let pref = participantOf.get(pk);
      if (!pref) {
        // 같은 회차 첫 부스의 표기 이름 — 그 행사에 표기된 명칭으로 보여준다(설계 §3).
        pref = { new: pk };
        participantOf.set(pk, pref);
        plan.participants.push({ key: pk, exhibitorRef: ref, exhibitionId: m.exhibitionId, displayName: m.name });
      }
      plan.assignments.push({ boothId: m.id, participantRef: pref, role: "primary" });
    }
  }

  // ── 이름만 같은 것 → 연결 후보(사람이 본다) ───────────────────────────────
  const refKey = (r: Ref) => ("existing" in r ? `ex:${r.existing}` : r.new);
  const byName = new Map<string, Ref[]>();
  const addName = (name: string, r: Ref) => {
    const k = nameKey(name);
    if (!k) return;
    const list = byName.get(k) ?? [];
    if (!list.some((x) => refKey(x) === refKey(r))) list.push(r);
    byName.set(k, list);
  };
  for (const e of existing) for (const n of e.names) addName(n, { existing: e.id });
  const order: string[] = [];
  for (const [root, members] of groups) {
    const r = refOfGroup.get(root)!;
    order.push(refKey(r));
    for (const m of members) addName(m.name, r);
  }
  const rank = (r: Ref) => ("existing" in r ? -1 : order.indexOf(r.new));
  const emitted = new Set<string>();
  for (const [root, members] of groups) {
    const mine = refOfGroup.get(root)!;
    if ("existing" in mine) continue; // 기존 참가사에 확정으로 붙은 묶음은 더 볼 게 없다
    for (const m of members) {
      const k = nameKey(m.name);
      if (!k) continue;
      for (const other of byName.get(k) ?? []) {
        if (refKey(other) === refKey(mine)) continue;
        // 한 쌍은 한 번만 — 기존 참가사 쪽으로, 새끼리면 먼저 생긴 쪽으로 붙인다.
        if (rank(other) > rank(mine)) continue;
        const pair = `${refKey(mine)}>${refKey(other)}`;
        if (emitted.has(pair)) continue;
        if ("existing" in other && decided.has(`${m.id}|${other.existing}`)) continue;
        emitted.add(pair);
        plan.candidates.push({ boothId: m.id, target: other, reason: `이름이 같다: "${m.name}"` });
      }
    }
  }
  return plan;
}
