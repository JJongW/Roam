import { describe, expect, it } from "vitest";
import { applyNoteInput, EMPTY_NOTE, heartOf, type NoteState } from "./apply";

const T0 = "2026-11-10T10:00:00.000Z";
const T1 = "2026-11-17T10:00:00.000Z";

function state(p: Partial<NoteState>): NoteState {
  return { ...EMPTY_NOTE, ...p };
}

describe("다녀왔어요와 평가는 따로 저장한다 (2026-11-17)", () => {
  it("평가 없이 다녀왔어요만 켤 수 있고, 행이 지워지지 않는다", () => {
    const r = applyNoteInput(null, { visited: true }, T0);
    expect(r.next.visitedAt).toBe(T0);
    expect(r.next.verdict).toBeNull();
    expect(r.empty).toBe(false);
  });

  it("평가를 지워도 다녀왔어요는 남는다", () => {
    const prev = state({ verdict: "good", verdictAt: T0, visitedAt: T0 });
    const r = applyNoteInput(prev, { verdict: null }, T1);
    expect(r.next.verdict).toBeNull();
    expect(r.next.verdictAt).toBeNull();
    expect(r.next.visitedAt).toBe(T0);
    expect(r.empty).toBe(false);
  });

  it("다녀왔어요를 끄면 평가도 같이 지운다", () => {
    const prev = state({ verdict: "ok", verdictAt: T0, visitedAt: T0 });
    const r = applyNoteInput(prev, { visited: false }, T1);
    expect(r.next.visitedAt).toBeNull();
    expect(r.next.verdict).toBeNull();
    expect(r.next.verdictAt).toBeNull();
    expect(r.empty).toBe(true);
  });

  it("같은 요청에 끄기와 평가가 오면 끄기가 이긴다", () => {
    const r = applyNoteInput(state({ visitedAt: T0 }), { visited: false, verdict: "good" }, T1);
    expect(r.next.verdict).toBeNull();
    expect(r.next.visitedAt).toBeNull();
  });

  it("평가를 남기면 다녀왔어요도 켜진다 — 옛 클라이언트 호환", () => {
    const r = applyNoteInput(null, { verdict: "good" }, T1);
    expect(r.next.visitedAt).toBe(T1);
    expect(r.next.verdictAt).toBe(T1);
  });

  it("평가를 고쳐도 처음 다녀온 시각을 덮지 않는다", () => {
    const prev = state({ visitedAt: T0 });
    const r = applyNoteInput(prev, { verdict: "bad" }, T1);
    expect(r.next.visitedAt).toBe(T0);
    expect(r.next.verdictAt).toBe(T1);
  });

  it("메모만 고치는 요청은 방문 묶음을 건드리지 않는다", () => {
    const r = applyNoteInput(state({ visitedAt: T0 }), { memo: "다시 보기" }, T1);
    expect(r.touchesVisit).toBe(false);
    expect(r.touchesHeart).toBe(false);
    expect(r.next.visitedAt).toBe(T0);
  });
});

describe("하트 하나 (2026-11-07), 옛 interest와 함께", () => {
  it("heart: true면 시각을 남기고 옛 interest를 must로 채운다", () => {
    const r = applyNoteInput(null, { heart: true }, T0);
    expect(r.next.heartedAt).toBe(T0);
    expect(r.next.interest).toBe("must");
    expect(heartOf(r.next)).toBe(true);
  });

  it("이미 curious면 interest를 바꾸지 않고 하트 시각도 지킨다", () => {
    const prev = state({ interest: "curious", heartedAt: T0 });
    const r = applyNoteInput(prev, { heart: true }, T1);
    expect(r.next.interest).toBe("curious");
    expect(r.next.heartedAt).toBe(T0);
  });

  it("heart: false면 하트와 must를 지운다. pass는 그대로 둔다", () => {
    expect(applyNoteInput(state({ interest: "must", heartedAt: T0 }), { heart: false }, T1).next)
      .toMatchObject({ interest: null, heartedAt: null });
    expect(applyNoteInput(state({ interest: "pass" }), { heart: false }, T1).next.interest).toBe("pass");
  });

  it("옛 클라이언트의 must, curious는 하트, pass는 하트 없음", () => {
    expect(applyNoteInput(null, { interest: "must" }, T0).next.heartedAt).toBe(T0);
    expect(applyNoteInput(null, { interest: "curious" }, T0).next.heartedAt).toBe(T0);
    const pass = applyNoteInput(state({ interest: "must", heartedAt: T0 }), { interest: "pass" }, T1);
    expect(pass.next.heartedAt).toBeNull();
    expect(heartOf(pass.next)).toBe(false);
  });

  it("heart와 interest가 같이 오면 heart가 이긴다", () => {
    const r = applyNoteInput(null, { heart: false, interest: "must" }, T0);
    expect(heartOf(r.next)).toBe(false);
  });

  it("백필 전 행(hearted_at 없음)도 옛 interest로 하트로 읽힌다", () => {
    expect(heartOf({ interest: "must" })).toBe(true);
    expect(heartOf({ interest: "pass" })).toBe(false);
    expect(heartOf({})).toBe(false);
  });

  it("하트만 있는 노트는 지워지지 않는다", () => {
    expect(applyNoteInput(null, { heart: true }, T0).empty).toBe(false);
    expect(applyNoteInput(state({ heartedAt: T0, interest: "must" }), { heart: false }, T1).empty).toBe(true);
  });
});
