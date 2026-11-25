"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  Heart,
  LogOut,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { BottomSheet } from "@/components/map-v2/bottom-sheet";
import { queueSnackbar } from "@/components/v2/snackbar";
import { useAuthStore } from "@/lib/stores/auth";
import { isVisited, useVisitStore } from "@/lib/stores/visit";
import { useBrandHeartStore, loadBrandHearts } from "@/lib/stores/brand-hearts";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useBoothMeta } from "@/lib/me/use-booth-meta";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import { providerName } from "@/lib/me/view";
import { GroupLabel, InfoRow, MePage, PageTitle } from "./me-ui";

/**
 * 15-01 설정. 웹에 있는 것만 둔다.
 * - 빼 둔 것: 알림(13-09, 웹은 푸시를 보내지 않는다), 지도 보기와 홀 이름 보기, 위치 권한(iOS 기기 설정),
 *   기록 내보내기(웹에 내보내기가 없다), 버전(앱 버전).
 * - 로그인 전에는 프로필, 하트 남긴 브랜드(계정 목록), 계정 묶음을 두지 않는다.
 */
export function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hydrated = useHydrated();
  const records = useVisitStore((s) => s.records);
  const brandHearts = useBrandHeartStore((s) => s.hearts);
  const [askLogout, setAskLogout] = useState(false);
  const closeLogout = useCallback(() => setAskLogout(false), []);

  useEffect(() => {
    loadBrandHearts();
    track("screen_view", { screen: SCREEN.settings, props: { signed_in: !!user } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "박람회 2곳": 다녀온 부스가 든 박람회 수. 부스의 박람회를 알아야 해서 이름을 불러온다(다녀온 기록 6-10과 같은 길).
  const visitedIds = useMemo(
    () => (hydrated ? Object.keys(records).filter((id) => isVisited(records[id])) : []),
    [records, hydrated],
  );
  const meta = useBoothMeta(visitedIds);
  const visitedFairs = new Set(
    visitedIds.map((id) => meta[id]?.exhibitionId).filter(Boolean),
  ).size;
  const brandCount = Object.keys(brandHearts).length;
  const provider = providerName(user?.provider);

  return (
    <MePage back="/me">
      <PageTitle title={label.settings} />
      {user && (
        <InfoRow
          icon={UserRound}
          title={user.nickname}
          sub={provider ? system.loggedInWith(provider) : undefined}
          value={label.profile}
          href="/me/profile"
        />
      )}

      <GroupLabel>{label.myRecords}</GroupLabel>
      {user && (
        <InfoRow
          icon={Heart}
          title={label.heartedBrands}
          value={brandCount > 0 ? label.placesStat(brandCount) : undefined}
          href="/me/brands"
        />
      )}
      <InfoRow
        icon={Check}
        title={label.visited}
        value={visitedFairs > 0 ? label.fairsStat(visitedFairs) : undefined}
        href="/visited"
      />

      <GroupLabel>{label.info}</GroupLabel>
      <InfoRow icon={ShieldCheck} title={label.privacy} href="/privacy" />
      <InfoRow icon={BookOpen} title={label.terms} href="/terms" />

      {user && (
        <>
          <GroupLabel>{label.account}</GroupLabel>
          <InfoRow icon={LogOut} title={label.logout} onClick={() => setAskLogout(true)} />
          <InfoRow icon={Trash2} title={label.deleteAccount} href="/me/delete" />
        </>
      )}

      {askLogout && (
        // 15-09 로그아웃 시트
        <BottomSheet ariaLabel={system.logoutTitle} onClose={closeLogout}>
          <div className="flex flex-col gap-v2-x1">
            <p className="text-v2-t7 font-v2-bold tracking-v2-card-title">{system.logoutTitle}</p>
            <p className="text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">{system.logoutBody}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              track("logout", { screen: SCREEN.logout });
              await logout();
              // 15-10: 로그인 전 모양 마이페이지에서 v2 스낵바로 알린다(옛 sonner 토스트는 위 가운데에 다른 모양으로 떴다).
              queueSnackbar(system.logoutDone);
              router.replace("/me");
            }}
            className="flex h-v2-x13 items-center justify-center rounded-v2-r3 bg-v2-bg-neutral-solid text-v2-t5 font-v2-bold text-v2-fg-on-neutral-solid active:bg-v2-bg-neutral-solid-pressed"
          >
            {label.logout}
          </button>
          <button
            type="button"
            onClick={closeLogout}
            className="flex h-v2-x12 items-center justify-center text-v2-t4 font-v2-bold text-v2-fg-neutral"
          >
            {label.cancel}
          </button>
        </BottomSheet>
      )}
    </MePage>
  );
}
