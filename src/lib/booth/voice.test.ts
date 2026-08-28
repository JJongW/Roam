import { describe, expect, it } from "vitest";
import { isSomeoneElsesVoice } from "@/lib/booth/voice";

describe("isSomeoneElsesVoice", () => {
  it("작가가 존댓말로 자기를 소개한 글을 가려낸다", () => {
    // SIF links-sif-2026.json intro에 실제로 들어 있는 문장들.
    expect(
      isSomeoneElsesVoice("현실과 환상의 경계에 있는 소녀들의 이야기를 기록합니다"),
    ).toBe(true);
    expect(isSomeoneElsesVoice("안녕하세요! 순간을 기록하는 423희희입니다")).toBe(
      true,
    );
    expect(
      isSomeoneElsesVoice("한국 전통문화를 재해석한 디지털 페인팅 작업을 합니다"),
    ).toBe(true);
  });

  it("판매·홍보 문구를 가려낸다 — 로미는 영업하지 않는다", () => {
    expect(isSomeoneElsesVoice("일러스트북 <갈라테이아> 교보문고 판매중")).toBe(
      true,
    );
    expect(isSomeoneElsesVoice("맹수만 판매합니다")).toBe(true);
    expect(isSomeoneElsesVoice("썸띵비러브드(DM❌) | 다꾸용 다이어리")).toBe(true);
  });

  it("화자가 드러나지 않는 명사구는 통과시킨다 — 로미가 인용해도 목소리가 안 깨진다", () => {
    expect(isSomeoneElsesVoice("다꾸러가 만드는 다꾸용 다이어리")).toBe(false);
    expect(isSomeoneElsesVoice("독립 에세이 출판사")).toBe(false);
    expect(isSomeoneElsesVoice("고양이 그림과 리소 인쇄 굿즈")).toBe(false);
  });

  it("운영자가 쓴 공식 소개는 통과시킨다", () => {
    expect(isSomeoneElsesVoice("손으로 엮은 책만 만드는 작은 출판사")).toBe(false);
  });

  it("빈 값은 남의 목소리가 아니다", () => {
    expect(isSomeoneElsesVoice(undefined)).toBe(false);
    expect(isSomeoneElsesVoice(null)).toBe(false);
    expect(isSomeoneElsesVoice("   ")).toBe(false);
  });
});
