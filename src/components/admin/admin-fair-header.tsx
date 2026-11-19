import type { Exhibition } from "@/lib/types";
import { ExhibitionSwitcher } from "./exhibition-switcher";

/**
 * 박람회 하나를 보는 관리자 화면의 머리 줄. 제목 옆에 선택기를 두고, 제목 아래에 지금 어느
 * 박람회 기준인지 적는다. 전체 화면은 이걸 쓰지 않는다(선택기가 뜨면 거르는 것처럼 읽힌다).
 */
export function AdminFairHeader({
  title,
  exhibitions,
  exhibition,
  description,
  children,
}: {
  title: string;
  exhibitions: Exhibition[];
  exhibition: Exhibition | undefined;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {exhibition ? (
            <>
              <span className="font-semibold text-foreground">{exhibition.name}</span> 기준이에요
            </>
          ) : (
            "고른 행사가 없어요"
          )}
        </p>
        {children}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">
        <ExhibitionSwitcher exhibitions={exhibitions} selectedId={exhibition?.id} />
      </div>
    </header>
  );
}
