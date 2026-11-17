import { describe, expect, it } from "vitest";
import { importSources, importSummary, parseConfidence, parseCsv, planHandleImport, readImportLines } from "./handle-import";

describe("parseCsv", () => {
  it("따옴표 안 쉼표와 줄바꿈, 겹따옴표, BOM", () => {
    const rows = parseCsv('﻿name_ko,instagram,note\r\n"가, 나",@ga,"줄\n바꿈 ""인용"""\r\n다,,\n');
    expect(rows).toEqual([
      { name_ko: "가, 나", instagram: "@ga", note: '줄\n바꿈 "인용"' },
      { name_ko: "다", instagram: "", note: "" },
    ]);
  });
});

describe("계정 가져오기 계획", () => {
  const csv = `site_id,name_ko,name_en,instagram,confidence,evidence_url
1,주말토리,Joomaltory,joomaltory,확실,https://www.instagram.com/joomaltory/
2,어피티 철학관,UPPITY,uppity.official,높음,
3,감도,GAMDO.,gamdo__off,후보,
4,없는곳,,nobody,확실,
5,빈계정,,,,
6,동명,,dong,확실,
7,영문만,ENGONLY,eng,확실,
8,주말 토리,,joomaltory2,확실,`;
  const targets = [
    { exhibitorId: "e1", names: ["주말토리"], currentHandle: null },
    { exhibitorId: "e2", names: ["어피티철학관"], currentHandle: "https://www.instagram.com/uppity.official/" },
    { exhibitorId: "e3", names: ["감도"], currentHandle: "@gamdo__official" },
    { exhibitorId: "e5", names: ["빈계정"], currentHandle: null },
    { exhibitorId: "e6", names: ["동명"], currentHandle: null },
    { exhibitorId: "e7", names: ["동명"], currentHandle: null },
    { exhibitorId: "e8", names: ["engonly"], currentHandle: null },
  ];
  const plan = planHandleImport(readImportLines(parseCsv(csv)), targets);
  it("빈 칸만 채우고, 같으면 건너뛰고, 다르면 충돌로 둔다", () => {
    expect(plan.map((p) => [p.name, p.decision])).toEqual([
      ["주말토리", "fill"],
      ["어피티 철학관", "same"],
      ["감도", "conflict"],
      ["없는곳", "unmatched"],
      ["빈계정", "no-handle"],
      ["동명", "ambiguous"],
      ["영문만", "fill"],
      // 띄어쓰기만 다른 이름은 같은 브랜드, 앞줄이 이미 넣었고 계정이 달라 충돌
      ["주말 토리", "conflict"],
    ]);
    expect(importSummary(plan)).toEqual({ fill: 2, same: 1, conflict: 2, "no-handle": 1, unmatched: 1, ambiguous: 1 });
  });
  it("신뢰도와 근거를 출처로 남긴다", () => {
    expect(plan[0]).toMatchObject({ handle: "joomaltory", confidence: "confirmed", line: 2 });
    expect(importSources(plan[0], "f.csv")).toEqual(["https://www.instagram.com/joomaltory/", "csv:f.csv#2", "handle-confidence:confirmed"]);
    expect(plan[2].confidence).toBe("candidate");
  });
  it("문구전 permissions.csv 모양(team, instagramStatus)도 읽는다", () => {
    const lines = readImportLines(parseCsv("team,artist,instagram,instagramStatus\n별빛다움,별빛을담은밤,@starlight_daum,confirmed\n마녀,,@w,needs-check"));
    expect(lines.map((l) => [l.name, l.aliases, l.handle, l.confidence])).toEqual([
      ["별빛다움", ["별빛을담은밤"], "starlight_daum", "confirmed"],
      ["마녀", [], "w", "candidate"],
    ]);
    expect(parseConfidence("모름")).toBeNull();
  });
});
