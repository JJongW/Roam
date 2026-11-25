import { BackButton } from "@/components/v2/back-button";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { getI18n } from "@/lib/i18n/server";

/**
 * 지도에 놓인 부스가 없는 박람회에 주소로 바로 들어왔을 때(2026-11-20 Ted 결정,
 * lib/exhibition/openable.ts). 목록에선 눌리지 않지만 공유 링크나 옛 주소로는 올 수 있다.
 * 빈 지도나 참가 브랜드 목록 대신 이 한 장만 보인다. 모양은 지도 화면의 "배치도 없음"과 같다.
 */
export async function FairNotOpen() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-v2-bg-layer-basement font-v2-ui">
      <div className="px-v2-x1-5 pt-safe">
        <BackButton fallbackHref="/" />
      </div>
      <div
        data-testid="fair-not-open"
        className="flex flex-1 flex-col items-center justify-center gap-v2-x3 px-v2-x6 text-center"
      >
        <RomiAvatar size="lg" />
        <p className="text-v2-t6 font-v2-bold text-v2-fg-neutral">{t("apiError.notOpenTitle")}</p>
        <p className="text-v2-t4 text-v2-fg-neutral-muted">{t("apiError.notOpenDesc")}</p>
      </div>
    </div>
  );
}
