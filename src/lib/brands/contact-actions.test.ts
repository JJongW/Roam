import { describe, expect, it } from "vitest";
import { emptyView, openRequest, planContactAction, splitPatch, type ContactView } from "./contact-actions";

const T = "2026-11-17";
const view = (o: Partial<ContactView> = {}): ContactView => ({ ...emptyView(), ...o });
const ok = (p: ReturnType<typeof planContactAction>) => {
  if (!p.ok) throw new Error(p.reason);
  return p;
};

describe("보냄으로 표시", () => {
  it("안 보낸 곳: 상태 보냄, 날짜 오늘, 계정과 채널을 미리 채운 값으로, 기록 한 줄", () => {
    const p = ok(planContactAction(view(), { type: "mark-sent" }, { today: T, handle: "https://instagram.com/abc/" }));
    expect(p.patch).toEqual({ status: "sent", sentAt: T, handle: "@abc", channel: "instagram", checklist: { "dm-sent": true } });
    expect(p.log).toEqual({ direction: "outbound", kind: "message", channel: "instagram", summary: "보냄으로 표시" });
  });
  it("메일이면 채널이 메일", () => {
    const p = ok(planContactAction(view(), { type: "mark-sent" }, { today: T, handle: "a@b.kr" }));
    expect(p.patch).toMatchObject({ handle: "a@b.kr", channel: "email" });
  });
  it("이미 적힌 계정과 채널은 덮지 않는다", () => {
    const p = ok(planContactAction(view({ handle: "@mine", channel: "x" }), { type: "mark-sent" }, { today: T, handle: "@other" }));
    expect(p.patch.handle).toBeUndefined();
    expect(p.patch.channel).toBeUndefined();
  });
  it("이미 보낸 곳은 그대로 둔다, 답 없음은 다시 보냄으로 날짜를 새로", () => {
    expect(planContactAction(view({ status: "sent" }), { type: "mark-sent" }, { today: T }).ok).toBe(false);
    expect(planContactAction(view({ status: "granted" }), { type: "mark-sent" }, { today: T }).ok).toBe(false);
    const p = ok(planContactAction(view({ status: "no-reply", sentAt: "2026-11-01" }), { type: "mark-sent" }, { today: T }));
    expect(p.patch).toMatchObject({ status: "sent", sentAt: T });
    expect(p.log.summary).toBe("다시 보냄으로 표시");
  });
  it("연락 금지 브랜드는 보냄을 막는다", () => {
    expect(planContactAction(view({ doNotContact: true }), { type: "mark-sent" }, { today: T })).toEqual({
      ok: false,
      reason: "연락하지 않기로 한 브랜드예요",
    });
    expect(planContactAction(view({ doNotContact: true }), { type: "set-status", status: "sent" }, { today: T }).ok).toBe(false);
    // 받은 답 기록은 막지 않는다
    expect(planContactAction(view({ doNotContact: true, status: "sent" }), { type: "set-status", status: "declined" }, { today: T }).ok).toBe(true);
  });
});

describe("상태 바꾸기", () => {
  it("같은 상태는 그대로, 바꾸면 기록 문장이 전과 후를 말한다", () => {
    expect(planContactAction(view({ status: "read" }), { type: "set-status", status: "read" }, { today: T }).ok).toBe(false);
    const p = ok(planContactAction(view({ status: "sent", sentAt: "2026-11-01" }), { type: "set-status", status: "granted" }, { today: T }));
    expect(p.patch).toEqual({ status: "granted", checklist: { "reply-received": true } });
    expect(p.log).toMatchObject({ direction: "inbound", kind: "permission", summary: "상태 바꿈: 보냄 → 허락" });
  });
  it("읽음으로 바로 가면 보낸 날짜가 없을 때 오늘로", () => {
    expect(ok(planContactAction(view(), { type: "set-status", status: "read" }, { today: T })).patch).toMatchObject({ sentAt: T });
    expect(ok(planContactAction(view({ sentAt: "2026-11-02" }), { type: "set-status", status: "read" }, { today: T })).patch.sentAt).toBeUndefined();
  });
  it("답 없음, 아직 안 보냄은 내부 기록", () => {
    expect(ok(planContactAction(view({ status: "sent" }), { type: "set-status", status: "no-reply" }, { today: T })).log.direction).toBe("internal");
  });
});

describe("받은 연락과 요청", () => {
  it("답장 받음: 상태가 답장으로, 요지가 있으면 reply와 기록에", () => {
    const p = ok(planContactAction(view({ status: "sent" }), { type: "received", kind: "message", note: "사진 보내 주신대요" }, { today: T }));
    expect(p.patch).toEqual({ status: "replied", checklist: { "reply-received": true }, reply: "사진 보내 주신대요" });
    expect(p.log.summary).toBe("답장 받음: 사진 보내 주신대요");
  });
  it("이미 허락이면 상태를 되돌리지 않는다", () => {
    expect(ok(planContactAction(view({ status: "granted" }), { type: "received", kind: "message" }, { today: T })).patch.status).toBeUndefined();
  });
  it("요청은 처리함이 남을 때까지 열려 있다", () => {
    const logs = [
      { direction: "inbound" as const, kind: "takedown-request" as const, occurredAt: "2026-11-10T00:00:00Z" },
      { direction: "outbound" as const, kind: "message" as const, occurredAt: "2026-11-11T00:00:00Z" },
    ];
    expect(openRequest(logs)).toEqual({ kind: "takedown-request", occurredAt: "2026-11-10T00:00:00Z" });
    const p = ok(planContactAction(view(), { type: "resolve-request" }, { today: T, logs }));
    expect(p.log).toEqual({ direction: "internal", kind: "takedown-request", summary: "내려 달라는 요청 처리함" });
    expect(openRequest([...logs, { direction: "internal", kind: "takedown-request", occurredAt: "2026-11-12T00:00:00Z" }])).toBeNull();
    expect(planContactAction(view(), { type: "resolve-request" }, { today: T, logs: [] }).ok).toBe(false);
  });
});

describe("허락 범위, 체크, 계정", () => {
  it("허락 범위 토글", () => {
    const p = ok(planContactAction(view({ allowedUse: ["tag"] }), { type: "toggle-use", token: "account-photo", on: true }, { today: T }));
    expect(p.patch.allowedUse).toEqual(["tag", "account-photo"]);
    expect(p.log.summary).toBe("허락 범위 더함: 계정 사진 사용");
    expect(planContactAction(view({ allowedUse: ["tag"] }), { type: "toggle-use", token: "tag", on: true }, { today: T }).ok).toBe(false);
  });
  it("DM 보냄 체크는 안 보낸 곳의 상태와 날짜도 채운다", () => {
    const p = ok(planContactAction(view(), { type: "toggle-check", key: "dm-sent", on: true }, { today: T, handle: "@a" }));
    expect(p.patch).toMatchObject({ status: "sent", sentAt: T, handle: "@a", checklist: { "dm-sent": true } });
  });
  it("계정 확정은 모양을 고르고 채널을 정한다", () => {
    expect(ok(planContactAction(view(), { type: "confirm-handle", handle: "instagram.com/Abc" }, { today: T })).patch).toEqual({
      handle: "@abc",
      channel: "instagram",
    });
    expect(planContactAction(view(), { type: "confirm-handle", handle: "아무 말" }, { today: T }).ok).toBe(false);
  });
  it("연락 금지는 브랜드 쪽으로 나뉜다", () => {
    const p = ok(planContactAction(view(), { type: "set-do-not-contact", on: true }, { today: T }));
    expect(splitPatch(p.patch)).toEqual({ outreach: { doNotContact: true }, permission: {} });
    expect(splitPatch({ status: "sent", handle: "@a", channel: "instagram", sentAt: T })).toEqual({
      outreach: { handle: "@a", channel: "instagram" },
      permission: { status: "sent", sentAt: T },
    });
  });
});
