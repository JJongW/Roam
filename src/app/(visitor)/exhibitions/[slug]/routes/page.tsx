import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock, MapPin, Route as RouteIcon, ChevronRight } from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { formatMinutes } from "@/lib/utils";
import { AppBar } from "@/components/common/app-bar";
import { EmptyState } from "@/components/common/states";

export const metadata = { title: "공유된 동선" };

type Props = { params: Promise<{ slug: string }> };

export default async function PublicRoutesPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const routes = await repo.listPublicRoutes(detail.exhibition.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar title="다른 사람 동선" />
      <main className="flex-1 px-4 py-4">
        {routes.length === 0 ? (
          <div className="flex min-h-[60dvh] items-center justify-center">
            <EmptyState
              icon={RouteIcon}
              title="아직 공유된 동선이 없어요"
              description="가장 먼저 내 동선을 공유해 보세요!"
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {routes.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/r/${r.shareId}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] active:scale-[0.99]"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl bg-secondary">
                    <RouteIcon className="size-5 text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.ownerNickname}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" /> {r.boothIds.length}곳
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />{" "}
                        {formatMinutes(r.estimatedMinutes)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
