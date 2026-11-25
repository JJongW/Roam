"use client";

import { useAuthStore } from "@/lib/stores/auth";
import { label, system } from "@/lib/copy/v1";

/**
 * 부스 상세 브랜드 칸(UI 24 Q1 A, 2026-11-25 Ted 결정. Figma 3309:22952 설명 있음, 3309:23034 설명 없음).
 * 옛 "브랜드 소개" 상자와 브랜드 줄(UI 23 Q1 C)을 한 칸으로 합쳤다. 위에서 아래로:
 * 머리 "브랜드" → 브랜드 이름 → 소개 → 맨 아래 작게 알림 문구.
 *
 * - 소개는 상세 소개와 같은 출처다(브랜드 공식 소개 > 부스 저작 요약 > 부스 원문, lib/brands/intro.ts).
 *   브랜드가 직접 쓴 원문은 고치지 않는다(브랜드 규칙 §1, §5 예외).
 * - 소개가 없으면 "브랜드 소개가 아직 없어요" 한 줄(흔한 화면이다: 문구 박람회는 소개가 통째로 빈다, UI 24 사실 노트).
 * - 하트는 아래 바 왼쪽 하나뿐이고(UI 23 Q1 C, 11-24) 이 칸은 누를 곳이 없다. 부스에 하트를 남기면 서버가
 *   그 부스의 브랜드에도 하트를 남긴다(PUT /api/me/notes/[boothId], lib/brands/follow.ts).
 * - 알림 문구는 로그인 여부로 나눈다(2026-11-24 Ted). 브랜드 알림은 로그인한 분만 받으므로(11-17) 로그인 전에는
 *   알림을 약속하지 않고 로그인하면 받는다고만 말한다. 로그인 여부는 아래 바(booth-actions)와 같이 auth 스토어에서 읽는다.
 */
export function BrandRow({
  name,
  intro,
}: {
  /** 브랜드 이름. 서버가 못 읽었으면 부스 이름으로 물러선다(호출부). */
  name: string;
  /** 브랜드 소개. 없으면 빈 상태 한 줄. */
  intro?: string;
}) {
  const signedIn = useAuthStore((s) => !!s.user);
  return (
    <section
      aria-label={label.brand}
      className="flex flex-col gap-v2-x1 rounded-v2-r3 border border-v2-stroke-neutral-weak bg-v2-bg-layer-default py-v2-x3-5 pl-v2-x4 pr-v2-x3"
    >
      <span className="text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">{label.brand}</span>
      <span className="break-words text-v2-t5 font-v2-bold text-v2-fg-neutral">{name}</span>
      {intro ? (
        <p className="whitespace-pre-line break-words text-v2-t5 font-v2-regular leading-[var(--roam-v2-line-height-t6-5)] tracking-v2-body text-v2-fg-neutral">
          {intro}
        </p>
      ) : (
        <p className="text-v2-t5 font-v2-regular leading-[var(--roam-v2-line-height-t6-5)] tracking-v2-body text-v2-fg-neutral-muted">
          {system.brandIntroEmpty}
        </p>
      )}
      <span className="text-v2-t3 font-v2-regular text-v2-fg-neutral-muted">
        {signedIn ? system.brandRowFollowsBoothHeart : system.brandRowLoggedOut}
      </span>
    </section>
  );
}
