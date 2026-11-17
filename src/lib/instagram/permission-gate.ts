/**
 * 게시 전 허락 문. 게시물에 나온 브랜드마다 허락 기록을 보고, 하나라도 걸리면 게시를 막는다.
 * (2026-11-17 어드민 자동화 라운드 테이블 "지금" 6번.)
 *
 * 게시물과 브랜드를 잇는 칸은 원래 없었다(카드뉴스 copy.json에도 출전 id가 없다). 가장 작은 연결로
 * 게시 요청이 출전 id 목록을 들고 온다 — `ig:publish --brands <파일>`. 브랜드가 하나도 안 나오는
 * 게시물은 `--no-brands`로 그렇다고 밝혀야 한다. 둘 다 없으면 막는다(표시 없이 빠져나가는 길은 두지 않는다).
 *
 * 막는 것
 * - 허락 기록이 없거나, 상태가 허락(granted)이나 일부 허락(partial)이 아님
 * - 쓰려는 용도가 허락 범위(allowed_use)에 없음. 허락 범위가 비어 있으면 어느 용도도 맞지 않는다고 본다
 * - 연락 금지(brand_outreach.do_not_contact) 브랜드
 * - 내려 달라는 요청(takedown-request)을 받은 브랜드, 또는 철회(withdrawn)
 * - 허락 범위에 "게시 전 확인 원함"(preview)이 있는데 체크리스트 "게시 전 공유"가 안 켜짐
 *
 * 순수 판단(checkPublishPermissions)과 읽기(loadPublishGate)를 나눈다. 쓰기는 없다.
 */
import { z } from "zod";
import { CONTACT_STATUS_LABEL } from "@/lib/brands/contact";
import type { Repository } from "@/lib/repositories/types";
import type { BrandOutreach, BrandOutreachLog, ExhibitorGraph, ParticipantPermission } from "@/lib/types";

/** 용도 이름. `photo`는 계정 사진(account-photo)이나 보내 준 사진(sent-photo) 어느 쪽이든 된다. */
export const PUBLISH_USES = ["photo", "account-photo", "sent-photo", "tag", "text", "price"] as const;
export type PublishUse = (typeof PUBLISH_USES)[number];

const USE_MATCH: Record<PublishUse, string[]> = {
  photo: ["account-photo", "sent-photo"],
  "account-photo": ["account-photo"],
  "sent-photo": ["sent-photo"],
  tag: ["tag"],
  text: ["text"],
  price: ["price"],
};
const USE_LABEL: Record<PublishUse, string> = {
  photo: "사진",
  "account-photo": "계정 사진",
  "sent-photo": "보내 준 사진",
  tag: "계정 표기",
  text: "글",
  price: "가격",
};

/** `--brands` 파일. 게시물에 나온 브랜드의 출전 id와 쓰는 용도(안 적으면 사진). */
export const featuredBrandsSchema = z.object({
  version: z.literal("publish-brands.v1"),
  brands: z
    .array(
      z.object({
        participantId: z.string().min(1),
        /** 사람이 알아보기 위한 이름. 판단에는 안 쓴다. */
        name: z.string().optional(),
        uses: z.array(z.enum(PUBLISH_USES)).min(1).default(["photo"]),
      }),
    )
    .min(1, "브랜드가 하나도 없으면 파일 대신 --no-brands를 붙여요"),
});
export type FeaturedBrand = z.infer<typeof featuredBrandsSchema>["brands"][number];

export interface GateData {
  participants: Map<string, { exhibitorId: string; displayName: string }>;
  permissions: Map<string, ParticipantPermission>;
  outreach: Map<string, BrandOutreach>;
  logs: BrandOutreachLog[];
}

/** 막는 이유 목록(해요체). 비어 있으면 통과. */
export function checkPublishPermissions(featured: FeaturedBrand[], data: GateData): string[] {
  const out: string[] = [];
  for (const f of featured) {
    const p = data.participants.get(f.participantId);
    const who = p?.displayName ?? f.name ?? f.participantId;
    if (!p) {
      out.push(`${who}: 출전을 찾을 수 없어요. 출전 id를 확인해 주세요`);
      continue;
    }
    const o = data.outreach.get(p.exhibitorId);
    if (o?.doNotContact) out.push(`${who}: 연락하지 않기로 한 브랜드라 게시할 수 없어요`);
    const takedown = data.logs.some(
      (l) => l.exhibitorId === p.exhibitorId && l.kind === "takedown-request" && l.direction === "inbound",
    );
    if (takedown) out.push(`${who}: 내려 달라는 요청을 받은 브랜드라 게시할 수 없어요`);
    const perm = data.permissions.get(f.participantId);
    if (!perm || perm.status === "not-sent") {
      out.push(`${who}: 허락 기록이 없어요. 허락을 받고 연락 보드에 남긴 뒤 게시해 주세요`);
      continue;
    }
    if (perm.status === "withdrawn") {
      out.push(`${who}: 허락을 철회한 브랜드라 게시할 수 없어요`);
      continue;
    }
    if (perm.status !== "granted" && perm.status !== "partial") {
      out.push(`${who}: 아직 허락을 받지 않았어요(지금 상태: ${CONTACT_STATUS_LABEL[perm.status]})`);
      continue;
    }
    const allowed = new Set(perm.allowedUse);
    const missing = f.uses.filter((u) => !USE_MATCH[u].some((a) => allowed.has(a)));
    if (missing.length)
      out.push(
        allowed.size === 0
          ? `${who}: 허락 범위가 비어 있어요. 무엇을 써도 되는지 연락 보드에 남겨 주세요`
          : `${who}: 허락 범위에 없는 용도가 있어요(${missing.map((u) => USE_LABEL[u]).join(", ")})`,
      );
    if (allowed.has("preview") && !perm.checklist["preview-shared"])
      out.push(`${who}: 게시 전에 보여 드리기로 했어요. 공유한 뒤 체크리스트 "게시 전 공유"를 켜 주세요`);
  }
  return out;
}

/** 저장소에서 판단에 쓸 값을 읽는다(읽기만). 연락 테이블(0062)이 없으면 막는 이유를 돌려준다. */
export async function loadPublishGate(repo: Repository, featured: FeaturedBrand[]): Promise<string[]> {
  if (!(await repo.hasParticipantOutreach()))
    return ["허락 기록 테이블(participant_permission)을 읽을 수 없어서 확인하지 못했어요"];
  const graph: ExhibitorGraph = await repo.loadExhibitorGraph();
  const want = new Set(featured.map((f) => f.participantId));
  const mine = graph.participants.filter((p) => want.has(p.id));
  const exhibitorIds = [...new Set(mine.map((p) => p.exhibitorId))];
  const exhibitionIds = [...new Set(mine.map((p) => p.exhibitionId))];
  const [perms, outs, logs] = await Promise.all([
    Promise.all(exhibitionIds.map((id) => repo.listParticipantPermissions(id))).then((x) => x.flat()),
    exhibitorIds.length ? repo.listBrandOutreach(exhibitorIds) : Promise.resolve([]),
    exhibitorIds.length ? repo.listBrandOutreachLogs(exhibitorIds) : Promise.resolve([]),
  ]);
  return checkPublishPermissions(featured, {
    participants: new Map(mine.map((p) => [p.id, { exhibitorId: p.exhibitorId, displayName: p.displayName }])),
    permissions: new Map(perms.filter((p) => want.has(p.participantId)).map((p) => [p.participantId, p])),
    outreach: new Map(outs.map((o) => [o.exhibitorId, o])),
    logs,
  });
}
