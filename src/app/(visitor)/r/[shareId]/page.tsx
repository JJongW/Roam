import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock, MapPin, Sparkles, Footprints } from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { formatMinutes } from "@/lib/utils";
import { AppBar } from "@/components/common/app-bar";
import { BoothCard } from "@/components/booth/booth-card";
import { ExhibitionMap } from "@/components/map/exhibition-map";
import { FLOORPLANS } from "@/lib/floorplans";
import { Button } from "@/components/ui/button";
import type { Booth } from "@/lib/types";

export const metadata = { title: "공유된 동선" };

type Props = { params: Promise<{ shareId: string }> };

export default async function SharedRoutePage({ params }: Props) {
  const { shareId } = await params;
  const repo = await getRepository();
  const route = await repo.getRouteByShareId(shareId);
  if (!route || !route.isPublic) notFound();

  const exhibitions = await repo.listExhibitions({ limit: 500 });
  const exhibition = exhibitions.data.find((e) => e.id === route.exhibitionId);
  if (!exhibition) notFound();

  const detail = await repo.getExhibition(exhibition.slug);
  const booths = await repo.listBoothsByExhibitionId(route.exhibitionId);
  const owner = route.userId ? await repo.getUser(route.userId) : null;

  const boothById = new Map(booths.map((b) => [b.id, b]));
  const catById = new Map((detail?.categories ?? []).map((c) => [c.id, c]));
  const ordered = route.boothIds
    .map((id) => boothById.get(id))
    .filter((b): b is Booth => Boolean(b));

  return (
    <div className="flex min-h-dvh flex-col pb-28">
      <AppBar title={route.title ?? "공유된 동선"} />

      <div className="px-5 pb-1 pt-3">
        <h1 className="text-xl font-extrabold">
          {route.title ?? "공유된 동선"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {owner?.nickname ?? "익명"}님의 추천 코스 · {exhibition.name}
        </p>
      </div>

      <div className="relative h-[36dvh] border-y border-border">
        <ExhibitionMap
          width={exhibition.mapWidth}
          height={exhibition.mapHeight}
          booths={booths}
          categories={detail?.categories ?? []}
          halls={detail?.halls ?? []}
          floorplan={FLOORPLANS[exhibition.slug]}
          routeOrder={route.boothIds}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 py-4">
        <Stat icon={MapPin} value={`${ordered.length}곳`} label="추천 부스" />
        <Stat
          icon={Clock}
          value={formatMinutes(route.estimatedMinutes)}
          label="예상 소요"
        />
      </div>

      <ol className="space-y-2.5 px-4">
        {ordered.map((b, i) => (
          <li key={b.id}>
            {i > 0 && route.legs[i] && (
              <div className="mb-1 ml-7 flex items-center gap-1 text-xs text-muted-foreground">
                <Footprints className="size-3.5" />{" "}
                {formatMinutes(route.legs[i].minutes)} 이동
              </div>
            )}
            <BoothCard
              booth={b}
              order={i + 1}
              category={catById.get(b.categoryId)}
            />
          </li>
        ))}
      </ol>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md gap-2 border-t border-border bg-background/90 p-4 pb-safe backdrop-blur-xl">
        <Button asChild variant="secondary" size="lg" className="flex-1">
          <Link href={`/exhibitions/${exhibition.slug}/map`}>지도 보기</Link>
        </Button>
        <Button asChild size="lg" className="flex-1">
          <Link href={`/exhibitions/${exhibition.slug}/onboarding`}>
            <Sparkles className="size-5" /> 내 동선 만들기
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({
  icon: IconCmp,
  value,
  label,
}: {
  icon: typeof Clock;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card py-3">
      <IconCmp className="size-5 text-primary" aria-hidden />
      <span className="text-sm font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
