import { describe, expect, it } from "vitest";
import { boardStatusMap, rowsFromStates } from "./board-load";
import { emptyView } from "./contact-actions";
import type { ContactSubject, SubjectState } from "./outreach-store";
import type { ExhibitorGraph, ProfileField } from "@/lib/types";

const T = "2026-11-28";

const graph = {
  exhibitors: [
    { id: "ex_none", canonicalName: "수단 없음" },
    { id: "ex_ig", canonicalName: "인스타 있음", instagramUrl: "https://instagram.com/has_ig" },
    { id: "ex_mail", canonicalName: "메일 있음" },
    { id: "ex_booth", canonicalName: "부스 인스타만" },
    { id: "ex_sent", canonicalName: "보낸 곳" },
  ],
  participants: ["none", "ig", "mail", "booth", "sent"].map((k) => ({
    id: `pt_${k}`, exhibitorId: `ex_${k}`, exhibitionId: "fair", displayName: k,
  })),
  assignments: [],
} as unknown as ExhibitorGraph;

const subjects: ContactSubject[] = ["none", "ig", "mail", "booth", "sent"].map((k) => ({
  participantId: `pt_${k}`, exhibitorId: `ex_${k}`, exhibitionId: "fair", boothId: k === "booth" ? "b1" : null,
}));

const state = (patch: Partial<ReturnType<typeof emptyView>> = {}): SubjectState => ({
  view: { ...emptyView(), ...patch }, logs: [], writable: true, saved: true, updatedBy: null, updatedAt: null,
});

const mailField = {
  id: "ex:ex_mail:links", exhibitorId: "ex_mail", participantId: null, field: "links",
  value: [{ kind: "other", url: "mailto:hi@brand.kr" }], sources: [], status: "collected",
} as unknown as ProfileField;

describe("브랜드 목록과 상세의 연락 상태(연락 보드와 같은 계산)", () => {
  it("안 보냄인데 인스타, 메일, 부스 인스타 어느 것도 없으면 연락 수단 없음", () => {
    const states = new Map<string, SubjectState>([["pt_sent", state({ status: "sent", sentAt: T })]]);
    const { rows } = rowsFromStates({
      subjects, states, graph, fields: [mailField], today: T,
      booths: [{ id: "b1", name: "부스", code: "A1", instagramUrl: "https://instagram.com/booth_ig" }],
    });
    expect(boardStatusMap(rows)).toEqual({
      pt_none: "no-channel",
      pt_ig: "not-sent",
      pt_mail: "not-sent",
      pt_booth: "not-sent",
      pt_sent: "sent",
    });
  });
});
