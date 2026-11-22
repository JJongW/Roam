"use client";

import { Check, Loader2 } from "lucide-react";
import type { ExhibitionPlan } from "@/lib/intake/exhibition-file";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";

const TIP_LABEL: Record<string, string> = {
  transportation: "교통",
  parking: "주차",
  ticket: "입장권",
  guide: "안내",
};

/** 행사 행 파일(exhibition.v1) 미리보기와 적용 결과. 화면 문구는 해요체(Roam-design 00_brand-rules.md §5). */
export function ExhibitionIntakePreview({
  plan,
  applied,
  busy,
  onApply,
}: {
  plan: ExhibitionPlan;
  applied: { id: string; slug: string } | null;
  busy: boolean;
  onApply: () => void;
}) {
  const ex = plan.exhibition;
  const exists = plan.status === "exists";
  const tips = Object.entries(ex.tips).filter(([, v]) => v);

  return (
    <>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">행사 행</span>
          <Chip>{exists ? `이미 있어요(${plan.existingId})` : "새로 만들어요"}</Chip>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Row label="주소 이름(slug)" value={<span className="font-mono">{ex.slug}</span>} />
          <Row label="이름" value={ex.name} />
          <Row label="장소" value={ex.venue} />
          <Row label="날짜" value={`${ex.startDate} ~ ${ex.endDate}`} />
          <Row label="설명" value={ex.description || "없음"} />
          <Row label="지도 크기" value={`${ex.mapWidth} x ${ex.mapHeight}`} />
          {tips.length === 0 ? (
            <Row label="안내 문구" value="없음" />
          ) : (
            tips.map(([k, v]) => <Row key={k} label={`안내 문구, ${TIP_LABEL[k] ?? k}`} value={v} />)
          )}
        </dl>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        {exists ? (
          <p className="text-sm text-muted-foreground">
            같은 주소 이름의 행사가 이미 있어 만들지 않아요. 덮어쓰기는 하지 않아요. 고칠 게 있으면 행사 화면에서
            고쳐 주세요.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">적용하면 이 행사 행 하나를 만들어요. 부스와 브랜드는 만들지 않아요.</p>
        )}
        <div>
          <Button onClick={onApply} disabled={busy || exists || !!applied}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            적용
          </Button>
        </div>
      </Card>

      {applied && (
        <Card className="flex flex-col gap-1 p-5">
          <p className="font-bold">
            만들었어요. {applied.slug}({applied.id})
          </p>
          <p className="text-sm text-muted-foreground">이제 이 행사의 브랜드 파일이나 부스 파일을 올릴 수 있어요.</p>
        </Card>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words whitespace-pre-line">{value}</dd>
    </>
  );
}
