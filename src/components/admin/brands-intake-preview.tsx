"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { BrandsPlan } from "@/lib/intake/brands-plan";
import type { BrandsApplyResult } from "@/lib/intake/brands-apply";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FIELD_LABEL: Record<string, string> = { intro: "공식 소개", links: "링크", photos: "대표 사진" };

/** brands.v1 미리보기와 적용 결과. 화면 문구는 해요체(Roam-design 00_brand-rules.md §5). */
export function BrandsIntakePreview({
  plan,
  applied,
  busy,
  onApply,
}: {
  plan: BrandsPlan;
  applied: BrandsApplyResult | null;
  busy: boolean;
  onApply: () => void;
}) {
  const s = plan.summary;
  const nothing = plan.exhibitorPlan.exhibitors.length === 0 && plan.exhibitorPlan.participants.length === 0 && plan.fields.length === 0;
  const linked = plan.brands.filter((b) => "existing" in b.target);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="새 브랜드" value={s.newBrands} />
        <Stat label="기존 브랜드에 이어짐" value={s.linkedBrands} />
        <Stat label={plan.exhibitionId ? "만들 참가 사실" : "참가 사실(행사 없음)"} value={s.participantsToCreate} />
        <Stat label="채울 칸" value={s.fieldsToFill} />
        <Stat label="이름 같은 기존 브랜드" value={plan.nameMatches.length} tone={plan.nameMatches.length ? "warn" : undefined} />
      </div>
      <p className="text-sm text-muted-foreground">
        이미 있는 참가 사실 {s.participantsExisting}곳은 건너뛰어요. 파일 안에서 인스타나 사이트가 같아 하나로 묶인 항목은{" "}
        {s.mergedInFile}개예요. 이미 값이 있는 칸은 건드리지 않아요.
      </p>

      <List
        title={`오류 ${plan.errors.length}건, 이 브랜드는 건너뛰어요`}
        tone="bad"
        rows={plan.errors.map((e) => ({ key: e.key, text: e.key, detail: e.message }))}
      />
      <List
        title={`이름만 같은 기존 브랜드 ${plan.nameMatches.length}건, 합치지 않고 새로 만들어요`}
        tone="warn"
        note="부스가 들어오면 이 짝이 브랜드 연결 화면(/admin/brands/links)에 후보로 올라와요. 같은 브랜드가 맞으면 거기서 합쳐 주세요."
        rows={plan.nameMatches.map((m) => ({
          key: m.key,
          text: `${m.name} (${m.key})`,
          detail: `기존: ${m.existing.map((e) => e.name).join(", ")}`,
        }))}
      />
      <List title={`경고 ${plan.warnings.length}건`} tone="warn" rows={plan.warnings.map((w, i) => ({ key: String(i), text: w }))} />
      <List
        title={`기존 브랜드에 이어지는 ${linked.length}곳`}
        rows={linked.map((b) => ({
          key: b.key,
          text: `${b.name} → ${b.existingName ?? ""}`,
          detail: [
            b.matchedBy === "brandKey"
              ? "이 파일로 전에 만든 브랜드예요"
              : b.matchedBy === "explicit"
                ? "파일에 적은 브랜드 id로 이어요"
                : "인스타나 사이트가 같아요",
            b.fills.length ? `채울 칸: ${b.fills.map((f) => FIELD_LABEL[f] ?? f).join(", ")}` : null,
            b.kept.length ? `이미 있어 그대로: ${b.kept.map((f) => FIELD_LABEL[f] ?? f).join(", ")}` : null,
          ]
            .filter(Boolean)
            .join(". "),
        }))}
      />

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onApply} disabled={busy || nothing}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            적용
          </Button>
          <span className="text-sm text-muted-foreground">
            {nothing ? "새로 넣을 게 없어요" : "부스는 나중에 부스 인입 파일로 들어오면 이 브랜드에 이어져요"}
          </span>
        </div>
      </Card>

      {applied && (
        <Card className="flex flex-col gap-2 p-5">
          <p className="font-bold">
            적용했어요. 새 브랜드 {applied.createdBrands}, 참가 사실 {applied.createdParticipants}, 채운 칸 {applied.filledFields}
          </p>
          {(applied.staled > 0 || applied.enqueued.brands > 0) && (
            <p className="text-sm text-muted-foreground">
              새 출전이 이어진 기존 브랜드: 다시 볼 칸 {applied.staled}개, 초안 잡 {applied.enqueued.brands}곳
            </p>
          )}
          {applied.failures.length > 0 && (
            <ul className="space-y-1 text-sm text-destructive">
              {applied.failures.map((f, i) => (
                <li key={i}>
                  {f.key}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <Card className="p-4">
      <p className={tone === "warn" ? "text-2xl font-extrabold tabular text-warning" : "text-2xl font-extrabold tabular"}>{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}

function List({
  title,
  rows,
  tone,
  note,
}: {
  title: string;
  rows: { key: string; text: string; detail?: string }[];
  tone?: "warn" | "bad";
  note?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="flex items-center gap-2 font-bold">
        {tone && (
          <AlertTriangle className={tone === "bad" ? "size-4 shrink-0 text-destructive" : "size-4 shrink-0 text-warning"} />
        )}
        {title}
      </p>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
        {rows.map((r) => (
          <li key={r.key} className="border-b border-border pb-1 last:border-0">
            <span className="font-medium">{r.text}</span>
            {r.detail && <span className="block text-muted-foreground">{r.detail}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
