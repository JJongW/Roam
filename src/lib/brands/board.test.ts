import { describe, expect, it } from "vitest";
import { actionFlags, applyContactResult, buildRow, daysBetween, filterRows, funnel, handleCandidates, sortRows, type BoardSource } from "./board";
import { emptyView, type ContactView } from "./contact-actions";

const T = "2026-11-17";
let n = 0;
function src(o: Partial<Omit<BoardSource, "view">> & { view?: Partial<ContactView> | null } = {}): BoardSource {
  n++;
  const { view, ...rest } = o;
  return {
    ref: { participantId: `p${n}`, exhibitorId: `e${n}`, boothId: null },
    name: `브랜드${n}`,
    code: null,
    view: view === null || view === undefined ? null : { ...emptyView(), ...view },
    writable: true,
    logs: [],
    handles: [],
    ...rest,
  };
}

describe("할 일 판단", () => {
  it("보낸 지 7일을 넘기면(8일째부터) 답 기다림", () => {
    expect(daysBetween("2026-11-10", T)).toBe(7);
    expect(actionFlags({ status: "sent", sentAt: "2026-11-10" }, [], T)).toEqual([]);
    expect(actionFlags({ status: "sent", sentAt: "2026-11-09" }, [], T)).toEqual(["overdue"]);
    expect(actionFlags({ status: "read", sentAt: "2026-11-01" }, [], T)).toEqual(["overdue"]);
    // 답이 온 곳은 기다림이 아니다
    expect(actionFlags({ status: "granted", sentAt: "2026-11-01" }, [], T)).toEqual([]);
  });
  it("답장 처리 전: 상태가 답장이거나, 보냄인데 마지막 기록이 받은 연락", () => {
    expect(actionFlags({ status: "replied", sentAt: T }, [], T)).toEqual(["reply-unprocessed"]);
    const inbound = [{ direction: "inbound" as const, kind: "message" as const, occurredAt: "2026-11-16T00:00:00Z" }];
    expect(actionFlags({ status: "sent", sentAt: "2026-11-16" }, inbound, T)).toEqual(["reply-unprocessed"]);
    expect(actionFlags({ status: "granted", sentAt: "2026-11-16" }, inbound, T)).toEqual([]);
  });
  it("수정이나 내려 달라는 요청은 처리함 기록 전까지", () => {
    const req = { direction: "inbound" as const, kind: "edit-request" as const, occurredAt: "2026-11-16T00:00:00Z" };
    expect(actionFlags({ status: "granted", sentAt: T }, [req], T)).toEqual(["request-open"]);
    expect(
      actionFlags({ status: "granted", sentAt: T }, [req, { direction: "internal", kind: "edit-request", occurredAt: "2026-11-16T01:00:00Z" }], T),
    ).toEqual([]);
  });
});

describe("줄 만들기", () => {
  it("계정은 브랜드 연락처 > 부스 링크 > 프로필 순, 신뢰도와 함께", () => {
    const a = buildRow(src({ view: { handle: "@mine" }, handles: [{ value: "https://instagram.com/booth", confidence: "official" }] }), T);
    expect([a.handle, a.handleConfidence]).toEqual(["mine", "confirmed"]);
    const b = buildRow(src({ handles: [{ value: null, confidence: "official" }, { value: "@cand", confidence: "candidate" }] }), T);
    expect([b.handle, b.handleConfidence]).toEqual(["cand", "candidate"]);
    const c = buildRow(src({ view: { handle: "a@b.kr" } }), T);
    expect([c.handle, c.email]).toEqual([null, "a@b.kr"]);
  });
  it("부스 없는 출전도 줄이 된다(부스 번호는 선택)", () => {
    const r = buildRow(src(), T);
    expect(r).toMatchObject({ code: null, status: "not-sent", writable: true, daysSinceSent: null });
  });
});

describe("깔때기 숫자", () => {
  it("상태별 개수, 할 일, 계정 모름, 저장 못 하는 줄", () => {
    const rows = [
      buildRow(src({ view: { status: "sent", sentAt: "2026-11-01" }, handles: [{ value: "@a", confidence: "official" }] }), T),
      buildRow(src({ view: { status: "granted", sentAt: "2026-11-01" } }), T),
      buildRow(src({ view: null, writable: false }), T),
      buildRow(src({ view: { status: "replied", sentAt: T } }), T),
    ];
    const f = funnel(rows);
    expect(f.total).toBe(4);
    expect(f.byStatus).toMatchObject({ "not-sent": 1, sent: 1, granted: 1, replied: 1, read: 0 });
    expect(Object.values(f.byStatus).reduce((a, b) => a + b, 0)).toBe(4);
    expect(f.flags).toEqual({ overdue: 1, "reply-unprocessed": 1, "request-open": 0 });
    expect(f.noHandle).toBe(3);
    expect(f.readOnly).toBe(1);
  });
});

describe("거르기와 정렬", () => {
  const rows = [
    buildRow(src({ name: "가나", code: "B-2", view: { status: "sent", sentAt: "2026-11-01" }, handles: [{ value: "@gana", confidence: "high" }] }), T),
    buildRow(src({ name: "다라", code: "A-10", view: { status: "granted", sentAt: "2026-11-15" } }), T),
    buildRow(src({ name: "마바", code: null }), T),
    buildRow(src({ name: "사아", code: "A-2", view: { status: "sent", sentAt: "2026-11-16" } }), T),
  ];
  it("상태, 계정 유무, 신뢰도, 할 일, 이름", () => {
    expect(filterRows(rows, { statuses: ["sent"] }).map((r) => r.name)).toEqual(["가나", "사아"]);
    expect(filterRows(rows, { hasHandle: true }).map((r) => r.name)).toEqual(["가나"]);
    expect(filterRows(rows, { confidence: "none" })).toHaveLength(3);
    expect(filterRows(rows, { confidence: "high" }).map((r) => r.name)).toEqual(["가나"]);
    expect(filterRows(rows, { flag: "overdue" }).map((r) => r.name)).toEqual(["가나"]);
    expect(filterRows(rows, { q: "GANA" }).map((r) => r.name)).toEqual(["가나"]);
    expect(filterRows(rows, { q: "a-1" }).map((r) => r.name)).toEqual(["다라"]);
  });
  it("부스 번호순은 숫자로, 부스 없는 줄은 뒤로. 보낸 지 오래된 순", () => {
    expect(sortRows(rows, "code").map((r) => r.code)).toEqual(["A-2", "A-10", "B-2", null]);
    expect(sortRows(rows, "days").map((r) => r.name)).toEqual(["가나", "다라", "사아", "마바"]);
  });
});

describe("저장 결과 반영", () => {
  it("상태, 날짜, 할 일을 다시 계산한다", () => {
    const row = buildRow(src({ view: { status: "sent", sentAt: "2026-11-01" } }), T);
    expect(row.flags).toEqual(["overdue"]);
    const next = applyContactResult(
      row,
      { ...emptyView(), status: "granted", sentAt: "2026-11-01", allowedUse: ["tag"] },
      { direction: "inbound", kind: "permission", summary: "상태 바꿈: 보냄 → 허락", occurredAt: "2026-11-17T01:00:00Z" },
      T,
    );
    expect(next).toMatchObject({ status: "granted", flags: [], allowedUse: ["tag"], lastLog: { summary: "상태 바꿈: 보냄 → 허락" } });
  });
});

describe("인스타 계정 후보 순서(handleCandidates)", () => {
  it("브랜드 계정이 부스 계정보다 먼저예요", () => {
    const row = buildRow(
      src({ handles: handleCandidates({ profile: null, brandOfficial: "https://instagram.com/brand_ig", booth: "https://instagram.com/booth_ig" }) }),
      T,
    );
    expect(row.handle).toBe("brand_ig");
  });

  it("브랜드 프로필 links 칸이 공식 링크보다 먼저이고, 브랜드 쪽이 비면 부스로 내려가요", () => {
    const withProfile = handleCandidates({ profile: { url: "@from_profile", confidence: "high" }, brandOfficial: "@official", booth: "@booth" });
    expect(buildRow(src({ handles: withProfile }), T)).toMatchObject({ handle: "from_profile", handleConfidence: "high" });
    const onlyBooth = handleCandidates({ profile: null, brandOfficial: null, booth: "@booth" });
    expect(buildRow(src({ handles: onlyBooth }), T).handle).toBe("booth");
  });

  it("연락에 실제로 쓴 계정은 그보다도 먼저예요", () => {
    const h = handleCandidates({ profile: null, brandOfficial: "@official", booth: "@booth" });
    expect(buildRow(src({ view: { handle: "@used" }, handles: h }), T)).toMatchObject({ handle: "used", handleConfidence: "confirmed" });
  });
});
