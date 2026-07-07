import { valueDef } from "@/lib/values";
import type { BoothValueTag } from "@/lib/types";

/** 부스의 관람 가치 태그를 색 칩으로. "왜 너에게 맞을 수 있는지"의 연결 가치. */
export function ValueChips({
  tags,
  max = 3,
}: {
  tags?: BoothValueTag[];
  max?: number;
}) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((t) => {
        const d = valueDef(t.slug);
        if (!d) return null;
        return (
          <span
            key={t.slug}
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: `${d.color}1a`, color: d.color }}
          >
            {d.label}
          </span>
        );
      })}
    </div>
  );
}
