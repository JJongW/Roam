"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { MapPin } from "lucide-react";
import { BrandRow } from "@/components/booth-v2/brand-row";
import { InfoRow } from "@/components/booth-v2/booth-detail";
import { label, system } from "@/lib/copy/v1";
import { previewFor, useBoothPreviewStore, type BoothPreview } from "@/lib/stores/booth-preview";

const bone = "rounded-v2-r1-5 bg-v2-bg-neutral-weak motion-safe:animate-pulse";

/**
 * 상세 로딩 경계(`booths/[id]/loading.tsx`). 지도에서 왔으면 그 부스의 미리 보기로 틀을 그리고,
 * 로딩이 보였다고 적어 둬서 다 온 화면(`BoothDetailEnter`)이 제자리 페이드를 하게 한다.
 */
export function BoothDetailLoading() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;
  const preview = previewFor(id);
  useEffect(() => {
    if (id) useBoothPreviewStore.getState().markLoadingShown(id);
  }, [id]);
  return <BoothDetailSkeleton preview={preview ?? undefined} />;
}

/**
 * UI 4-02를 불러오는 동안의 틀. 실제 상세(`BoothDetailV2`)와 같은 자리, 같은 크기다.
 *
 * 지도에서 와서 그 부스를 이미 알면(`preview`, iOS BoothPageScreen `loadingContent`, Roam-ios #254)
 * 아는 것은 실제 글자로 그린다 — 이름, 홀과 부스 번호, 분류 배지, 브랜드 칸 머리와 이름, 위치 줄.
 * 모르는 것만 회색 자리로 둔다 — 사진 칸(지도가 아는 수만큼), 브랜드 소개 한 줄(상세 응답에만 온다).
 * 파는 것, 링크 줄은 상세에만 있어 그리지 않는다.
 *
 * 링크로 바로 들어와 아무것도 모르면 예전처럼 사진 줄, 이름과 위치, 배지, 소개 상자, 정보 줄 둘을 전부 회색 자리로 둔다.
 * 사진 줄은 실제와 같이 왼쪽 16에서 시작하고 넘치는 칸은 잘라 화면을 밀지 않는다.
 */
export function BoothDetailSkeleton({ preview }: { preview?: BoothPreview }) {
  return (
    <div
      aria-busy
      aria-label={system.boothLoading}
      className="min-h-dvh bg-v2-bg-layer-default font-v2-ui text-v2-fg-neutral"
    >
      <div className="mx-auto flex w-full flex-col">
        <div className="flex items-center px-v2-x1-5 pt-safe">
          <span className="size-v2-x11" />
        </div>
        {preview ? <KnownBody preview={preview} /> : <UnknownBody />}
      </div>
    </div>
  );
}

function PhotoSlots({ count }: { count: number }) {
  return (
    <div className="flex gap-v2-x2 overflow-hidden px-v2-x4 pt-v2-x2">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`aspect-3/4 w-2/5 shrink-0 rounded-v2-r3 ${bone}`} />
      ))}
    </div>
  );
}

function KnownBody({ preview }: { preview: BoothPreview }) {
  const where = label.hallNumber(preview.hallName, preview.code);
  return (
    <>
      {/* 실제 사진 줄은 2/5 폭 칸이라 셋째 칸에서 화면 끝을 넘는다. 그 너머는 잘려 보이지 않으니 셋까지만 그린다. */}
      {preview.photoCount > 0 && <PhotoSlots count={Math.min(preview.photoCount, 3)} />}
      <div className="flex flex-col gap-v2-x3 px-v2-x4 pt-v2-x5">
        <div className="flex flex-col gap-v2-x1">
          <p className="text-v2-t7 font-v2-bold tracking-v2-card-title">{preview.name}</p>
          {where && (
            <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{where}</p>
          )}
        </div>
        {preview.categoryName && (
          <div className="flex flex-wrap gap-v2-x1-5">
            <span className="flex min-h-v2-x6 items-center rounded-v2-r1-5 bg-v2-bg-neutral-weak px-v2-x2 py-v2-x1 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">
              {preview.categoryName}
            </span>
          </div>
        )}
      </div>
      {preview.hasDescription && (
        // 브랜드 이름은 상세 응답에만 와서 부스 이름으로 그린다(iOS도 지도 목록엔 브랜드 이름이 없어 같다).
        // 알림 문구는 브랜드가 이어졌는지 몰라 그리지 않는다.
        <div className="px-v2-x4 pt-v2-x4">
          <BrandRow name={preview.name} linked={false} introLoading />
        </div>
      )}
      {where && (
        <ul className="flex flex-col pb-v2-x2 pt-v2-x4">
          <InfoRow icon={MapPin} title={label.location} sub={where} />
        </ul>
      )}
    </>
  );
}

function UnknownBody() {
  return (
    <>
      <PhotoSlots count={3} />
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
    </>
  );
}
