import type { Metadata } from "next";
import Link from "next/link";

/**
 * 개인정보처리방침 — Google OAuth Verification 제출용 공개 페이지.
 *
 * 이 페이지는 **로그인 없이** 열려야 한다(`src/proxy.ts`의 PUBLIC_PATHS). Google 심사관은
 * 계정 없이 이 URL을 직접 열어보며, 로그인 벽에 막히면 심사가 거기서 반려된다.
 *
 * 내용은 실제 구현과 일치해야 한다 — 심사는 이 문서와 OAuth consent screen의 스코프를
 * 대조한다. 현재 앱이 요청하는 스코프는 기본 openid·email·profile 뿐이고
 * (`login-form.tsx`의 signInWithOAuth에 scopes 지정 없음), Calendar·Drive 등 다른
 * Google 서비스는 호출하지 않는다. 나중에 스코프를 추가하면 §3·§4를 반드시 같이 고친다.
 *
 * 한국어를 먼저 두고 영어 전문을 아래 붙인다 — 심사관이 한국어를 못 읽는 경우를 위해서다.
 */

const EFFECTIVE_DATE = "2026년 8월 10일";
const EFFECTIVE_DATE_EN = "August 10, 2026";
const CONTACT_EMAIL = "roam.ai.kr@gmail.com";
const GOOGLE_POLICY_URL =
  "https://developers.google.com/terms/api-services-user-data-policy";
const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

export const metadata: Metadata = {
  // absolute — 루트 레이아웃의 "%s · Roam" 템플릿을 우회한다.
  title: { absolute: "Privacy Policy | Roam" },
  description: "Privacy Policy for Roam.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Privacy Policy | Roam",
    description: "Privacy Policy for Roam.",
    url: "/privacy",
    type: "article",
  },
};

function Section({
  id,
  no,
  title,
  children,
}: {
  id?: string;
  no: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mb-3 text-lg font-bold tracking-tight sm:text-xl">
        <span className="mr-2 text-muted-foreground tabular-nums">{no}.</span>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-muted/50">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b border-border px-3 py-2.5 font-semibold text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td
                  key={j}
                  className="border-b border-border px-3 py-2.5 last:border-r-0 [tr:last-child_&]:border-b-0"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background">
      <main id="main" className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <header className="mb-10 border-b border-border pb-8">
          <Link
            href="/"
            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            ← Roam
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            개인정보처리방침
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            시행일 · 최종 수정일: {EFFECTIVE_DATE}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            <a
              href="#english"
              className="font-medium text-primary underline underline-offset-2"
            >
              English version below ↓
            </a>
          </p>
        </header>

        {/* ================= 한국어 ================= */}
        <div className="space-y-10">
          <Section no="1" title="서비스 소개">
            <p>
              Roam(이하 &ldquo;서비스&rdquo;)은 전시·박람회 방문객을 위한 모바일
              관람 안내 서비스입니다. 이용자가 관심 있는 부스를 발견하고, 전시장
              지도에서 위치를 확인하고, 자신의 관람 기록을 남길 수 있도록
              돕습니다.
            </p>
            <p>
              서비스는 Google 계정을 이용한 로그인(Google OAuth)을 지원합니다.
              본 방침은 서비스가 이용자의 개인정보를 어떻게
              수집·이용·보관·파기하는지 설명합니다.
            </p>
          </Section>

          <Section no="2" title="수집하는 정보">
            <p className="font-semibold text-foreground">
              가. Google 계정으로 로그인할 때 받는 정보
            </p>
            <p>
              서비스는 Google OAuth의 기본 범위(<code>openid</code>,{" "}
              <code>email</code>, <code>profile</code>)만 요청하며, 아래 항목을
              전달받습니다.
            </p>
            <Table
              head={["항목", "용도", "저장 여부"]}
              rows={[
                ["이메일 주소", "계정 식별, 중요 안내", "저장"],
                [
                  "프로필 이름",
                  "최초 가입 시 표시 닉네임을 만드는 데만 사용",
                  "닉네임만 저장(원본 이름은 저장하지 않음)",
                ],
                [
                  "프로필 이미지 URL",
                  "프로필 표시",
                  "URL만 저장(이미지 파일은 저장하지 않음)",
                ],
                [
                  "Google 계정 고유 식별자",
                  "재로그인 시 동일 계정 확인",
                  "저장",
                ],
              ]}
            />

            <p className="pt-2 font-semibold text-foreground">
              나. 서비스를 이용하면서 생성되는 정보
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>닉네임</li>
              <li>부스에 남긴 반응·메모·사진, 북마크</li>
              <li>리뷰, 커뮤니티 게시글 및 첨부 이미지</li>
              <li>
                관심 분야 선택값 및 이용 기록에서 파생된 취향 정보(추천 개인화에
                사용)
              </li>
              <li>서비스 내 검색어</li>
            </ul>

            <p className="pt-2 font-semibold text-foreground">
              다. 자동으로 수집되는 정보
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>로그인 상태 유지를 위한 세션 쿠키</li>
              <li>
                서비스 개선을 위한 이용 기록(접속 시각, 조회한 화면, 대략적인
                기기·브라우저 정보)
              </li>
            </ul>
          </Section>

          <Section no="3" title="수집하지 않는 정보">
            <p>다음 정보는 요청하지도, 접근하지도, 저장하지도 않습니다.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-semibold text-foreground">
                  Google Calendar, Gmail, Drive, 주소록 등 다른 Google 서비스의
                  데이터
                </span>{" "}
                — 서비스는 해당 권한을 요청하지 않으며, 관련 API를 호출하지
                않습니다.
              </li>
              <li>
                Google 계정 비밀번호 — 인증은 전적으로 Google에서 이루어지며,
                서비스는 비밀번호를 받지 않습니다.
              </li>
              <li>
                Google 액세스 토큰·리프레시 토큰 — 로그인 직후 신원 확인에만
                사용하고 즉시 폐기하며, 서버에 보관하지 않습니다.
              </li>
              <li>결제 정보, 주민등록번호 등 고유식별정보</li>
              <li>
                정밀 위치정보(GPS) — 전시장 지도는 도면 좌표만 사용합니다.
              </li>
            </ul>
          </Section>

          <Section no="4" title="정보를 이용하는 목적">
            <ul className="list-disc space-y-1 pl-5">
              <li>회원 식별 및 로그인 상태 유지</li>
              <li>관심 있을 만한 부스 추천 및 개인화</li>
              <li>이용자가 남긴 반응·메모·사진의 저장과 재열람</li>
              <li>관람 기록 요약 및 회고 제공</li>
              <li>서비스 품질 개선 및 오류 대응</li>
              <li>법령상 의무 이행</li>
            </ul>
            <p>
              위 목적 외의 용도로는 이용하지 않으며, 목적이 변경될 경우 사전에
              동의를 받습니다.
            </p>
          </Section>

          <Section no="5" title="데이터 저장">
            <p className="font-semibold text-foreground">저장되는 데이터</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>계정 정보(이메일, 닉네임, 프로필 이미지 URL, 계정 식별자)</li>
              <li>부스 반응·메모·북마크·리뷰·커뮤니티 게시글</li>
              <li>업로드한 이미지</li>
              <li>취향 정보 및 이용 기록</li>
            </ul>
            <p className="pt-2 font-semibold text-foreground">
              저장되지 않는 데이터
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Google 액세스 토큰 및 리프레시 토큰</li>
              <li>Google 계정 비밀번호</li>
              <li>다른 Google 서비스의 데이터</li>
              <li>프로필 이미지 파일 원본(URL만 저장)</li>
            </ul>
          </Section>

          <Section no="6" title="제3자 제공 및 처리위탁">
            <p className="font-semibold text-foreground">
              서비스는 이용자의 개인정보를 판매하지 않으며, 광고 목적으로
              제3자에게 제공하지 않습니다.
            </p>
            <p>
              다만 서비스 운영에 필요한 범위에서 아래 사업자에게 처리를
              위탁합니다. 각 사업자는 위탁받은 목적 범위 내에서만 정보를
              처리합니다.
            </p>
            <Table
              head={["수탁사", "위탁 업무", "처리 항목"]}
              rows={[
                [
                  "Supabase",
                  "데이터베이스 및 인증 인프라",
                  "계정 정보, 이용 기록",
                ],
                ["Vercel", "서비스 호스팅 및 전송", "접속 로그"],
                [
                  "Cloudinary",
                  "이미지 저장 및 전송",
                  "이용자가 업로드한 이미지",
                ],
                [
                  "Google (Gemini API)",
                  "부스·커뮤니티 요약문 생성",
                  "전시·부스 정보 및 관련 텍스트",
                ],
                [
                  "Google (Firebase Cloud Messaging)",
                  "푸시 알림 발송(이용자가 동의한 경우)",
                  "기기 푸시 토큰",
                ],
              ]}
            />
            <p>
              법령에 근거한 수사기관의 적법한 요청이 있는 경우에는 관련 절차에
              따라 제공할 수 있습니다.
            </p>
            <p>
              위 사업자의 서버는 국외에 위치할 수 있으며, 이 경우 서비스 제공을
              위해 필요한 범위에서 개인정보가 국외로 이전됩니다.
            </p>
          </Section>

          <Section no="7" title="Google API Services User Data Policy 준수">
            <p>
              서비스가 Google API로부터 받은 정보의 이용 및 다른 앱으로의 전송은{" "}
              <Ext href={GOOGLE_POLICY_URL}>
                Google API Services User Data Policy
              </Ext>
              를 따르며, 여기에는 Limited Use 요건이 포함됩니다.
            </p>
            <p>구체적으로, 서비스는 Google 사용자 데이터를</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>본 방침에 명시한 기능 제공 목적으로만 사용하고,</li>
              <li>광고 목적으로 사용하거나 광고 사업자에게 전송하지 않으며,</li>
              <li>판매하지 않고,</li>
              <li>
                보안 목적, 법령 준수, 또는 이용자의 명시적 동의가 있는 경우를
                제외하고 사람이 직접 열람하지 않습니다.
              </li>
            </ul>
          </Section>

          <Section no="8" title="보관 기간 및 파기">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                개인정보는 회원 탈퇴 시까지 보관하며, 탈퇴 요청 시{" "}
                <span className="font-semibold text-foreground">
                  30일 이내에 계정 정보와 이용자가 생성한 데이터를 삭제
                </span>
                합니다.
              </li>
              <li>
                이용 기록 등 통계 목적의 정보는 개인을 식별할 수 없도록 처리한
                뒤에만 보관합니다.
              </li>
              <li>
                법령에서 일정 기간 보존을 요구하는 정보는 해당 기간 동안 별도로
                분리 보관한 후 파기합니다.
              </li>
            </ul>
            <p>계정 삭제는 {CONTACT_EMAIL} 으로 요청하실 수 있습니다.</p>
          </Section>

          <Section no="9" title="보안">
            <ul className="list-disc space-y-1 pl-5">
              <li>모든 통신은 HTTPS(TLS)로 암호화됩니다.</li>
              <li>
                저장되는 데이터는 저장 시 암호화(encryption at rest)가 적용된
                인프라에 보관됩니다.
              </li>
              <li>
                인증 정보는 HttpOnly 세션 쿠키로 관리하며, 서버 접근 권한은
                운영에 필요한 최소 범위로 제한합니다.
              </li>
              <li>
                Google 액세스·리프레시 토큰을 보관하지 않으므로, 유출 시
                이용자의 Google 계정이 노출될 위험을 구조적으로 차단합니다.
              </li>
            </ul>
          </Section>

          <Section no="10" title="이용자의 권리">
            <p>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>개인정보 열람 요구</li>
              <li>오류가 있는 경우 정정 요구</li>
              <li>삭제 요구</li>
              <li>처리 정지 요구 및 동의 철회</li>
            </ul>
            <p>
              권리 행사는 {CONTACT_EMAIL} 으로 요청하실 수 있으며, 지체 없이
              조치합니다.
            </p>
            <p>
              Google 계정과의 연결은{" "}
              <Ext href={GOOGLE_PERMISSIONS_URL}>Google 계정 권한 설정</Ext>에서
              직접 해제하실 수 있습니다.
            </p>
          </Section>

          <Section no="11" title="아동의 개인정보">
            <p>
              서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 만 14세 미만
              아동의 개인정보를 고의로 수집하지 않습니다. 관련 사실을 인지한
              경우 지체 없이 해당 정보를 삭제합니다.
            </p>
          </Section>

          <Section no="12" title="방침 변경 안내">
            <p>
              본 방침이 변경되는 경우 변경 내용과 시행일을 이 페이지에
              게시합니다. 이용자의 권리에 중대한 영향을 미치는 변경은
              시행일로부터 최소 7일 전 (이용자에게 불리한 변경인 경우 30일 전)에
              서비스 내 공지 또는 이메일로 안내합니다.
            </p>
          </Section>

          <Section no="13" title="문의">
            <p>
              개인정보 처리에 관한 문의·불만·피해 구제는 아래로 연락해 주시기
              바랍니다.
            </p>
            <p className="font-semibold text-foreground">
              이메일:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>
        </div>

        {/* ================= English ================= */}
        <div
          id="english"
          className="mt-16 space-y-10 border-t border-border pt-12"
        >
          <header>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Privacy Policy
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Effective and last updated: {EFFECTIVE_DATE_EN}
            </p>
          </header>

          <Section no="1" title="About the Service">
            <p>
              Roam (the &ldquo;Service&rdquo;) is a mobile guide for visitors to
              exhibitions and trade fairs. It helps visitors discover booths,
              locate them on a venue floor plan, and keep a personal record of
              what they saw.
            </p>
            <p>
              The Service supports signing in with a Google Account via Google
              OAuth. This policy explains what information the Service collects,
              how it is used, where it is stored, and how it is deleted.
            </p>
          </Section>

          <Section no="2" title="Information We Collect">
            <p className="font-semibold text-foreground">
              a. Information received when you sign in with Google
            </p>
            <p>
              The Service requests only the default OAuth scopes (
              <code>openid</code>, <code>email</code>, <code>profile</code>) and
              receives the following.
            </p>
            <Table
              head={["Item", "Purpose", "Stored"]}
              rows={[
                [
                  "Email address",
                  "Account identification, service notices",
                  "Yes",
                ],
                [
                  "Profile name",
                  "Used only to generate a display nickname at first sign-up",
                  "Nickname only (the original name is not stored)",
                ],
                [
                  "Profile image URL",
                  "Profile display",
                  "URL only (no image file is stored)",
                ],
                [
                  "Google account identifier",
                  "Matching you to the same account on return visits",
                  "Yes",
                ],
              ]}
            />

            <p className="pt-2 font-semibold text-foreground">
              b. Information generated through your use of the Service
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Nickname</li>
              <li>Booth reactions, personal notes, photos, and bookmarks</li>
              <li>Reviews, community posts, and attached images</li>
              <li>
                Selected interests and preference data derived from your
                activity (used to personalize recommendations)
              </li>
              <li>Search queries made within the Service</li>
            </ul>

            <p className="pt-2 font-semibold text-foreground">
              c. Information collected automatically
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>A session cookie that keeps you signed in</li>
              <li>
                Usage records for service improvement (access time, screens
                viewed, coarse device and browser information)
              </li>
            </ul>
          </Section>

          <Section no="3" title="Information We Do Not Collect">
            <p>
              The Service does not request, access, or store any of the
              following.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-semibold text-foreground">
                  Data from other Google services such as Google Calendar,
                  Gmail, Drive, or Contacts
                </span>{" "}
                — the Service does not request those scopes and does not call
                those APIs.
              </li>
              <li>
                Your Google Account password — authentication happens entirely
                on Google&rsquo;s side and the Service never receives it.
              </li>
              <li>
                Google access tokens or refresh tokens — they are used only to
                verify your identity at the moment of sign-in, then immediately
                discarded, and are never persisted on our servers.
              </li>
              <li>
                Payment information or government-issued identification numbers
              </li>
              <li>
                Precise location (GPS) — the venue map uses floor-plan
                coordinates only.
              </li>
            </ul>
          </Section>

          <Section no="4" title="How We Use Information">
            <ul className="list-disc space-y-1 pl-5">
              <li>Identifying you and keeping you signed in</li>
              <li>Recommending and personalizing booths you may care about</li>
              <li>
                Storing and re-displaying your reactions, notes, and photos
              </li>
              <li>Summarizing your visit and supporting reflection</li>
              <li>Improving service quality and diagnosing errors</li>
              <li>Complying with legal obligations</li>
            </ul>
            <p>
              We do not use your information for any other purpose. If the
              purpose changes, we will obtain your consent in advance.
            </p>
          </Section>

          <Section no="5" title="Data Storage">
            <p className="font-semibold text-foreground">What is stored</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Account information (email, nickname, profile image URL, account
                identifier)
              </li>
              <li>
                Booth reactions, notes, bookmarks, reviews, and community posts
              </li>
              <li>Images you upload</li>
              <li>Preference data and usage records</li>
            </ul>
            <p className="pt-2 font-semibold text-foreground">
              What is not stored
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Google access tokens and refresh tokens</li>
              <li>Google Account passwords</li>
              <li>Data from other Google services</li>
              <li>The profile image file itself (only its URL)</li>
            </ul>
          </Section>

          <Section no="6" title="Sharing and Processors">
            <p className="font-semibold text-foreground">
              We do not sell your personal information, and we do not share it
              with third parties for advertising purposes.
            </p>
            <p>
              We engage the following processors to operate the Service. Each
              processes information only for the purpose we entrust to it.
            </p>
            <Table
              head={["Processor", "Purpose", "Data processed"]}
              rows={[
                [
                  "Supabase",
                  "Database and authentication infrastructure",
                  "Account information, usage records",
                ],
                ["Vercel", "Hosting and delivery", "Access logs"],
                [
                  "Cloudinary",
                  "Image storage and delivery",
                  "Images you upload",
                ],
                [
                  "Google (Gemini API)",
                  "Generating booth and community summaries",
                  "Exhibition and booth information and related text",
                ],
                [
                  "Google (Firebase Cloud Messaging)",
                  "Sending push notifications where you have opted in",
                  "Device push token",
                ],
              ]}
            />
            <p>
              We may disclose information in response to a lawful request from
              authorities, following the applicable legal process.
            </p>
            <p>
              These providers may operate servers outside your country, in which
              case personal information is transferred internationally to the
              extent necessary to provide the Service.
            </p>
          </Section>

          <Section
            no="7"
            title="Compliance with Google API Services User Data Policy"
          >
            <p>
              Roam&rsquo;s use and transfer of information received from Google
              APIs to any other app will adhere to the{" "}
              <Ext href={GOOGLE_POLICY_URL}>
                Google API Services User Data Policy
              </Ext>
              , including the Limited Use requirements.
            </p>
            <p>Specifically, we do not:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                use Google user data for anything other than providing the
                features described in this policy;
              </li>
              <li>
                use it for advertising or transfer it to advertising platforms;
              </li>
              <li>sell it;</li>
              <li>
                allow humans to read it, except for security purposes, to comply
                with applicable law, or with your explicit consent.
              </li>
            </ul>
          </Section>

          <Section no="8" title="Retention and Deletion">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                We retain personal information until you delete your account. On
                request, we{" "}
                <span className="font-semibold text-foreground">
                  delete your account information and the data you created
                  within 30 days
                </span>
                .
              </li>
              <li>
                Usage records kept for statistical purposes are retained only
                after being de-identified.
              </li>
              <li>
                Where law requires retention for a fixed period, we store that
                information separately for the required period and then destroy
                it.
              </li>
            </ul>
            <p>To delete your account, contact us at {CONTACT_EMAIL}.</p>
          </Section>

          <Section no="9" title="Security">
            <ul className="list-disc space-y-1 pl-5">
              <li>All traffic is encrypted with HTTPS (TLS).</li>
              <li>
                Stored data resides on infrastructure with encryption at rest.
              </li>
              <li>
                Authentication uses HttpOnly session cookies, and server access
                is limited to the minimum required for operations.
              </li>
              <li>
                Because we never persist Google access or refresh tokens, a
                breach of our systems cannot expose your Google Account.
              </li>
            </ul>
          </Section>

          <Section no="10" title="Your Rights">
            <p>You may exercise the following rights at any time.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Request access to your personal information</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion</li>
              <li>Request that processing stop, or withdraw consent</li>
            </ul>
            <p>
              Send requests to {CONTACT_EMAIL} and we will act without undue
              delay.
            </p>
            <p>
              You can also revoke the Service&rsquo;s access to your Google
              Account directly at{" "}
              <Ext href={GOOGLE_PERMISSIONS_URL}>
                Google Account permissions
              </Ext>
              .
            </p>
          </Section>

          <Section no="11" title="Children&rsquo;s Privacy">
            <p>
              The Service is not directed to children under 14, and we do not
              knowingly collect their personal information. If we learn that we
              have, we delete it without delay.
            </p>
          </Section>

          <Section no="12" title="Changes to This Policy">
            <p>
              If this policy changes, we will post the change and its effective
              date on this page. For changes that materially affect your rights,
              we will give notice in the Service or by email at least 7 days
              before the effective date, or at least 30 days in advance if the
              change is adverse to you.
            </p>
          </Section>

          <Section no="13" title="Contact">
            <p>
              For questions, complaints, or remedies regarding the handling of
              personal information, please contact us.
            </p>
            <p className="font-semibold text-foreground">
              Email:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>
        </div>

        <footer className="mt-16 border-t border-border pt-8">
          <p className="text-base font-bold tracking-tight">Roam</p>
          <p className="mt-1 text-sm text-muted-foreground">© 2026 Roam</p>
        </footer>
      </main>
    </div>
  );
}
