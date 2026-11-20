import Link from "next/link";
import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { fairSubtitle, type FairEntry } from "@/lib/exhibition/fair-groups";
import { homeCopy } from "@/lib/copy/home";

/**
 * UI/박람회 줄(Figma 20-00, 3230:21890). 홈(20-01)과 박람회 전체(20-02)가 같이 쓴다.
 * - 열 수 있으면 줄 전체가 지도로 가는 링크다(지도 먼저, 브랜드 규칙 §4).
 * - 지도가 아직 없으면(`openable:false`) 사진 칸과 글이 흐려지고 화살표 자리에 "진행 예정".
 *   누르는 것이 아니어서 링크가 아니고, 읽는 이에겐 "{행사명}, 진행 예정"으로 읽힌다(11-20 Ted).
 * - 하트 남긴 브랜드가 나오는 박람회면 셋째 줄에 브랜드 이름(2-05).
 */
export function FairRow({
  entry,
  today,
  heartLine,
  onOpen,
}: {
  entry: FairEntry;
  today: string;
  heartLine?: string;
  /** 누르는 순간 기록(끝난 박람회 입구 11-01 등). 서버 컴포넌트에선 넘기지 않는다. */
  onOpen?: () => void;
}) {
  const { fair, openable } = entry;
  const sub = fairSubtitle(entry, today);
  const body: ReactNode = (
    <>
      <span
        className={clsx(
          "relative size-v2-x14 shrink-0 overflow-hidden rounded-v2-r3",
          openable ? "bg-v2-bg-neutral-weak" : "bg-v2-bg-disabled",
        )}
      >
        {fair.coverImageUrl && openable && (
          // eslint-disable-next-line @next/next/no-img-element -- 표지는 외부 주소가 제각각이라 next/image 도메인 목록에 다 넣을 수 없다
          <img
            src={fair.coverImageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5 font-v2-medium">
        <span
          className={clsx(
            "truncate text-v2-t5",
            openable ? "text-v2-fg-neutral" : "text-v2-fg-disabled",
          )}
        >
          {fair.name}
        </span>
        <span
          className={clsx(
            "truncate text-v2-t3",
            openable ? "text-v2-fg-neutral-muted" : "text-v2-fg-disabled",
          )}
        >
          {sub}
        </span>
        {heartLine && openable && (
          <span className="truncate text-v2-t3 text-v2-fg-brand">{heartLine}</span>
        )}
      </span>
      {openable ? (
        <ChevronRight
          aria-hidden
          className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral-muted"
        />
      ) : (
        <span className="shrink-0 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
          {homeCopy.notOpen}
        </span>
      )}
    </>
  );
  const row = "flex w-full items-center gap-v2-x3 px-v2-x4 py-v2-x2";
  if (!openable)
    return (
      <div role="group" aria-label={homeCopy.notOpenA11y(fair.name)} className={row}>
        {body}
      </div>
    );
  return (
    <Link
      href={`/exhibitions/${fair.slug}/map`}
      onClick={onOpen}
      className={clsx(row, "active:bg-v2-bg-transparent-pressed")}
    >
      {body}
    </Link>
  );
}

/** UI/묶음 제목 줄과 그 아래 박람회 줄들. 비면 그리지 않는다. */
export function FairSection({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <section className="flex flex-col gap-v2-x1">
      <h2 className="px-v2-x4 pb-v2-x1 text-v2-t4 font-v2-bold text-v2-fg-neutral">
        {title}
      </h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}
