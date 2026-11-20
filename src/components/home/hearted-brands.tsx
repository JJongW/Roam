"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { api } from "@/lib/api/client";
import { fairSubtitle, type FairEntry } from "@/lib/exhibition/fair-groups";
import { homeCopy } from "@/lib/copy/home";
import { label } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { BrandHeartView } from "@/lib/brands/hearts";

/**
 * 하트 남긴 브랜드가 나오는 박람회(UI 2-05). 브랜드 하트 목록은 계정에만 있어(19 A, 11-17) 로그인한 분만.
 * 못 불러오면 조용히 없다(홈을 막지 않는다).
 */
export function useHeartedBrands(signedIn: boolean) {
  const [bySlug, setBySlug] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    api
      .get<{ data: BrandHeartView[] }>("/api/me/brand-hearts")
      .then((r) => {
        if (!alive) return;
        const out: Record<string, string[]> = {};
        for (const v of r.data)
          for (const u of v.upcoming) {
            const list = (out[u.exhibition.slug] ??= []);
            if (v.name && !list.includes(v.name)) list.push(v.name);
          }
        setBySlug(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signedIn]);
  return { bySlug };
}

export function HeartedBrandCard({
  entry,
  names,
  today,
}: {
  entry: FairEntry | null;
  names: string[];
  today: string;
}) {
  const ok = !!entry && entry.openable && today <= entry.fair.endDate;
  useEffect(() => {
    if (ok) track("screen_view", { screen: SCREEN.homeLoggedIn, props: { brand_count: names.length } });
  }, [ok, names.length]);
  if (!ok || !entry) return null;
  const { fair } = entry;
  return (
    <section className="flex flex-col gap-v2-x3">
      <h2 className="text-v2-t4 font-v2-bold text-v2-fg-neutral">{homeCopy.heartedFairsTitle}</h2>
      <div className="flex flex-col overflow-hidden rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating shadow-v2-s1">
        {fair.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- 표지는 외부 주소가 제각각이라 next/image 도메인 목록에 다 넣을 수 없다
          <img src={fair.coverImageUrl} alt="" className="aspect-video w-full bg-v2-bg-neutral-weak object-cover" />
        )}
        <div className="flex flex-col gap-v2-x3 p-v2-x4">
          <div className="flex flex-col gap-v2-x0-5 font-v2-medium">
            <p className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">{fair.name}</p>
            <p className="text-v2-t3 text-v2-fg-neutral-muted">{fairSubtitle(entry, today)}</p>
          </div>
          <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{homeCopy.heartedBrands}</p>
          <ul className="flex flex-wrap gap-v2-x1-5">
            {names.slice(0, 3).map((n) => (
              <li
                key={n}
                className="flex items-center gap-v2-x1 rounded-v2-pill bg-v2-bg-brand-weak px-v2-x2 py-v2-x1 text-v2-t3 font-v2-medium text-v2-fg-neutral"
              >
                <Heart aria-hidden className="size-[var(--roam-v2-icon-size-sm)] fill-v2-fg-brand text-v2-fg-brand" />
                {n}
              </li>
            ))}
          </ul>
          <Link
            href={`/exhibitions/${fair.slug}/map`}
            className="flex min-h-v2-x11 items-center justify-center rounded-v2-r2 bg-v2-bg-brand-solid text-v2-t4 font-v2-bold text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
          >
            {label.seeMap}
          </Link>
        </div>
      </div>
    </section>
  );
}
