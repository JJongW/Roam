"use client";

export interface FunnelStage {
  stage: string;
  count: number;
  rate: number;
}

export function ConversionFunnel({ funnel }: { funnel: FunnelStage[] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <ul className="space-y-2.5">
      {funnel.map((f, i) => (
        <li key={f.stage}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold">{f.stage}</span>
            <span className="tabular text-muted-foreground">
              {f.count} <span className="text-xs">({f.rate}%)</span>
            </span>
          </div>
          <div className="h-8 w-full overflow-hidden rounded-lg bg-secondary">
            <div
              className="flex h-full items-center rounded-lg bg-primary transition-all"
              style={{ width: `${Math.max(6, (f.count / max) * 100)}%`, opacity: 1 - i * 0.16 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
