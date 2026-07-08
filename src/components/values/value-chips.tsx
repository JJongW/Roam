"use client";

import { valueDef } from "@/lib/values";
import { useT } from "@/lib/i18n/provider";
import type { BoothValueTag } from "@/lib/types";

/** 부스의 관람 가치 태그를 색 칩으로. "왜 너에게 맞을 수 있는지"의 연결 가치. */
export function ValueChips({
  tags,
  max = 3,
}: {
  tags?: BoothValueTag[];
  max?: number;
}) {
  const t = useT();
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((tag) => {
        const d = valueDef(tag.slug);
        if (!d) return null;
        return (
          <span
            key={tag.slug}
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: `${d.color}1a`, color: d.color }}
          >
            {t(`values.${tag.slug}`)}
          </span>
        );
      })}
    </div>
  );
}
