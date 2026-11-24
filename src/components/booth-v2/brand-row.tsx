import { label, system } from "@/lib/copy/v1";

/**
 * 부스 상세 브랜드 줄(UI 23 Q1 C, 2026-11-24 Ted 결정). 하트는 아래 바 왼쪽 하나뿐이고, 이 줄은 설명만 한다.
 * 부스에 하트를 남기면 서버가 그 부스의 브랜드에도 하트를 남긴다(PUT /api/me/notes/[boothId], lib/brands/follow.ts).
 * UI 19 A안 "이 브랜드 하트" 알약은 이 결정으로 없어졌다. 브랜드 하트를 직접 다루는 곳은 마이 브랜드 목록과 홈 줄이다.
 */
export function BrandRow({ name }: { /** 브랜드 이름. 서버가 못 읽었으면 부스 이름으로 물러선다(호출부). */ name: string }) {
  return (
    <section
      aria-label={label.brand}
      className="flex flex-col gap-v2-x0-5 rounded-v2-r3 border border-v2-stroke-neutral-weak bg-v2-bg-layer-default px-v2-x4 py-v2-x3-5"
    >
      <span className="text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">{label.brand}</span>
      <span className="break-words text-v2-t5 font-v2-bold text-v2-fg-neutral">{name}</span>
      <span className="text-v2-t3 font-v2-regular text-v2-fg-neutral-muted">{system.brandRowFollowsBoothHeart}</span>
    </section>
  );
}
