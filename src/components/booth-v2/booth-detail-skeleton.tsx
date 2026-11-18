import { system } from "@/lib/copy/v1";

/**
 * UI 4-02를 불러오는 동안의 뼈대. 실제 상세와 같은 자리, 같은 크기다 — 사진 줄(3:4 두 장 반),
 * 이름 줄, 위치 줄, 배지, 소개 상자, 정보 줄 둘, 아래 바. 다 불러오면 같은 자리에 글이 앉는다.
 */
export function BoothDetailSkeleton() {
  const bone = "rounded-v2-r1-5 bg-v2-bg-neutral-weak motion-safe:animate-pulse";
  return (
    <div aria-busy aria-label={system.boothLoading} className="min-h-dvh bg-v2-bg-layer-default font-v2-ui">
      <div className="mx-auto flex w-full flex-col">
        <div className="flex items-center px-v2-x1-5 pt-safe">
          <span className="size-v2-x11" />
        </div>
        <div className="flex gap-v2-x2 overflow-hidden px-v2-x4 pt-v2-x2">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`aspect-3/4 w-2/5 shrink-0 rounded-v2-r3 ${bone}`} />
          ))}
        </div>
        <div className="flex flex-col gap-v2-x3 px-v2-x4 pt-v2-x5">
          <div className="flex flex-col gap-v2-x1">
            <span className={`h-v2-x7 w-3/5 ${bone}`} />
            <span className={`h-v2-x4 w-1/4 ${bone}`} />
          </div>
          <span className={`h-v2-x6 w-1/5 ${bone}`} />
        </div>
        <div className="px-v2-x4 pt-v2-x6">
          <div className="flex flex-col gap-v2-x2 rounded-v2-r3 bg-v2-bg-neutral-weak p-v2-x4">
            <span className="h-v2-x4 w-1/4 rounded-v2-r1-5 bg-v2-bg-neutral-muted motion-safe:animate-pulse" />
            <span className="h-v2-x4 w-full rounded-v2-r1-5 bg-v2-bg-neutral-muted motion-safe:animate-pulse" />
            <span className="h-v2-x4 w-4/5 rounded-v2-r1-5 bg-v2-bg-neutral-muted motion-safe:animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col pt-v2-x4">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-v2-x3 px-v2-x4 py-v2-x3">
              <span className={`size-v2-x5 ${bone}`} />
              <span className="flex flex-1 flex-col gap-v2-x1">
                <span className={`h-v2-x4 w-1/4 ${bone}`} />
                <span className={`h-v2-x3 w-2/5 ${bone}`} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
