"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Compass } from "lucide-react";
import { clsx } from "clsx";
import type { MapHandle } from "@/components/map/exhibition-map";
import { isRotated } from "@/components/map/map-camera";
import { label } from "@/lib/copy/v1";

/**
 * 나침반 단추(2026-11-23 Ted "회전 되게 해줘. 모든 지도맵 처럼 동일하게", Roam-design
 * `docs/decisions/2026-11-23_지도-돌리기.md`). 지도를 돌린 동안만 지도 위 단추 자리(홀 버튼 옆)에 나타나고,
 * 누르면 배치도 방향(처음 방향)으로 돌아온다. 돌리지 않았을 때는 숨긴다.
 *
 * 모양은 Figma에 아직 없다(미정). 결정 문서대로 지도 위 둥근 단추(홀 버튼 2994:840)와 같은 틀에 Lucide
 * `Compass`를 쓴다. 아이콘 바늘은 지도의 위쪽(배치도 방향)을 가리키게 같이 돈다. Lucide 바늘은 오른쪽 위
 * 45도로 그려져 있어 그만큼 빼고 돌린다.
 *
 * 지도가 도는 동안 이 화면을 다시 그리지 않으려고, 각도는 엔진 구독(`onRotation`)으로 받아 아이콘 style에 바로
 * 적는다. React 상태는 보이고 숨는 순간에만 바뀐다.
 */
export function MapCompass({
  mapRef,
  onPress,
  className,
}: {
  mapRef: RefObject<MapHandle | null>;
  onPress?: () => void;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  const icon = useRef<SVGSVGElement>(null);
  const deg = useRef(0);

  useEffect(() => {
    const handle = mapRef.current;
    if (!handle) return;
    return handle.onRotation((d) => {
      deg.current = d;
      if (icon.current) icon.current.style.transform = needle(d);
      setShown(isRotated(d));
    });
  }, [mapRef]);

  if (!shown) return null;
  return (
    <div
      className={clsx(
        "rounded-v2-pill bg-v2-bg-layer-floating p-v2-x1 shadow-v2-s3",
        className,
      )}
    >
      <button
        type="button"
        aria-label={label.mapOrientationReset}
        onClick={() => {
          onPress?.();
          mapRef.current?.resetRotation();
        }}
        className="flex size-v2-x9 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
      >
        <Compass
          // 보이는 순간 지금 각도를 바로 적는다(그 뒤로는 구독이 적는다).
          ref={(el) => {
            icon.current = el;
            if (el) el.style.transform = needle(deg.current);
          }}
          aria-hidden
          className="size-[var(--roam-v2-icon-size-md)]"
        />
      </button>
    </div>
  );
}

/** Lucide Compass 바늘(오른쪽 위 45도)을 지도의 위쪽으로. 지도가 시계 방향으로 d도 돌면 위쪽도 d도 돈다. */
function needle(d: number): string {
  return `rotate(${d - 45}deg)`;
}
