"use client";

import { create } from "zustand";
import type { BoothListItem } from "@/lib/types";

/**
 * 지도에서 부스 상세로 갈 때 이미 가진 그 부스(지도 목록 응답)를 상세 로딩 화면에 건넨다
 * (iOS BoothPageScreen `preview`, Roam-ios #254). 로딩 화면은 이걸로 이름, 홀과 부스 번호, 분류 배지,
 * 브랜드 칸 머리와 이름을 실제 글자로 그리고 모르는 사진과 소개만 회색 자리로 둔다.
 *
 * 휘발성 클라이언트 상태라 zustand에 두고 저장하지 않는다(새로 고침하거나 링크로 바로 들어오면 없다 → 회색 자리만).
 * 왜 주소(쿼리)가 아닌가: 부스 이름과 소개 유무를 주소에 실으면 공유 링크가 지저분해지고 남이 고친 주소가
 * 다른 이름을 그리게 된다. 왜 sessionStorage가 아닌가: 한 번의 이동에만 쓰는 값이라 남길 이유가 없다.
 */
export interface BoothPreview {
  id: string;
  name: string;
  code?: string;
  /** 부스 카드와 같은 짧은 홀 칸("A홀"). */
  hallName?: string;
  /** 분류 배지(상세는 분류 하나만 보여 준다). */
  categoryName?: string;
  /** 지도 목록이 아는 사진 수. 0이면 사진 줄을 그리지 않는다. */
  photoCount: number;
  /** 부스 소개 원문이 있는지. 있으면 상세에 브랜드 칸이 생긴다(iOS loadingContent와 같은 기준). */
  hasDescription: boolean;
}

interface BoothPreviewState {
  preview: BoothPreview | null;
  /** 상세 로딩 화면이 실제로 보인 부스. 다 온 화면이 이걸 보고 제자리 페이드를 한다. */
  loadingShownFor: string | null;
  remember: (p: BoothPreview) => void;
  markLoadingShown: (id: string) => void;
  clearLoadingShown: () => void;
}

export const useBoothPreviewStore = create<BoothPreviewState>((set) => ({
  preview: null,
  loadingShownFor: null,
  remember: (preview) => set({ preview }),
  markLoadingShown: (loadingShownFor) => set({ loadingShownFor }),
  clearLoadingShown: () => set({ loadingShownFor: null }),
}));

/** 지도 목록의 부스 한 곳 → 로딩 화면에 건넬 미리 보기. */
export function boothPreviewOf(
  booth: Pick<BoothListItem, "id" | "name" | "code" | "images" | "description">,
  extra: { hallName?: string; categoryName?: string },
): BoothPreview {
  return {
    id: booth.id,
    name: booth.name,
    code: booth.code,
    hallName: extra.hallName,
    categoryName: extra.categoryName,
    photoCount: (booth.images ?? []).filter((s) => !!s?.trim()).length,
    hasDescription: !!booth.description?.trim(),
  };
}

/** 이 부스로 가는 중이면 미리 보기, 아니면 null. */
export function previewFor(id: string | undefined): BoothPreview | null {
  if (!id) return null;
  const p = useBoothPreviewStore.getState().preview;
  return p && p.id === id ? p : null;
}
