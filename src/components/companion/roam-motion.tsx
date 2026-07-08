import { cn } from "@/lib/utils";

/**
 * 움직이는 Roam — 걷는 R 글리프 영상 아바타(자동재생·무음·루프). 순간 노출 지점
 * (온보딩 첫인사·회고 헤더)에만 쓴다. 상시 노출(컴패니언 바)엔 정적 로고 유지.
 */
export function RoamMotion({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return (
    <video
      src={src}
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
      className={cn("size-full object-cover", className)}
    />
  );
}
