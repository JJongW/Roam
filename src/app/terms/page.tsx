import type { Metadata } from "next";
import Link from "next/link";
import { Section, LegalFooter } from "@/components/legal/prose";

/**
 * 서비스 약관 — Google OAuth Verification 제출용 공개 페이지.
 *
 * 개인정보처리방침(`/privacy`)과 같은 규칙을 따른다: **로그인 없이** 열려야 하고
 * (`src/proxy.ts`의 PUBLIC_PATHS), 한국어 뒤에 영어 전문을 붙인다. 예전엔 약관이
 * 외부(Notion)에 있었는데, 워크스페이스 앱 URL이라 로그아웃 상태에선 열리지 않을 수
 * 있었고 자체 도메인 밖이라 심사에서 확인이 어려웠다.
 *
 * 내용은 실제 서비스와 일치해야 한다 — 유료 결제·연령 제한·중개 거래 같은, 지금
 * 하지 않는 일을 적지 않는다.
 */

const EFFECTIVE_DATE = "2026년 8월 10일";
const EFFECTIVE_DATE_EN = "August 10, 2026";
const CONTACT_EMAIL = "roam.ai.kr@gmail.com";

export const metadata: Metadata = {
  // absolute — 루트 레이아웃의 "%s · Roam" 템플릿을 우회한다.
  title: { absolute: "Terms of Service | Roam" },
  description: "Terms of Service for Roam.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Terms of Service | Roam",
    description: "Terms of Service for Roam.",
    url: "/terms",
    type: "article",
  },
};

export default function TermsPage() {
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
            서비스 이용약관
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
          <Section no="1" title="약관의 목적">
            <p>
              본 약관은 Roam(이하 &ldquo;서비스&rdquo;)을 이용하는 데 필요한
              조건과 절차, 이용자와 서비스 운영자의 권리·의무를 정합니다.
            </p>
          </Section>

          <Section no="2" title="서비스 내용">
            <p>
              서비스는 전시·박람회 방문객을 위한 모바일 관람 안내 서비스입니다.
              구체적으로 다음을 제공합니다.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>전시 및 부스 정보 열람</li>
              <li>이용자의 관심사에 맞춘 부스 추천</li>
              <li>전시장 도면 기반 위치 안내</li>
              <li>부스에 대한 반응·메모·사진 기록</li>
              <li>리뷰 및 커뮤니티 게시</li>
              <li>관람 기록 요약</li>
            </ul>
            <p>
              서비스 이용은 무료입니다. 유료 기능을 도입할 경우 사전에 안내하고
              별도의 동의를 받습니다.
            </p>
          </Section>

          <Section no="3" title="약관의 효력과 변경">
            <p>
              본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다. 운영자는
              필요한 경우 약관을 변경할 수 있으며, 변경 시 변경 내용과 시행일을
              이 페이지에 게시합니다.
            </p>
            <p>
              이용자에게 불리한 변경은 시행일로부터 최소 30일 전에, 그 밖의
              변경은 최소 7일 전에 서비스 내 공지 또는 이메일로 안내합니다.
              변경에 동의하지 않는 이용자는 이용을 중단하고 계정 삭제를 요청할 수
              있습니다.
            </p>
          </Section>

          <Section no="4" title="계정">
            <p>
              서비스 이용에는 계정이 필요합니다. 계정은 닉네임 또는 Google
              계정으로 만들 수 있습니다.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                닉네임은 공개 식별자로 사용되며, 다른 이용자가 볼 수 있습니다.
              </li>
              <li>
                타인의 명의나 정보를 도용해 계정을 만들 수 없습니다.
              </li>
              <li>
                계정은 본인만 사용해야 하며, 제3자에게 양도하거나 대여할 수
                없습니다.
              </li>
              <li>
                이용자는 언제든지 {CONTACT_EMAIL} 으로 계정 삭제를 요청할 수
                있습니다.
              </li>
            </ul>
            <p>
              개인정보의 처리에 관한 사항은{" "}
              <Link
                href="/privacy"
                className="font-medium text-primary underline underline-offset-2"
              >
                개인정보처리방침
              </Link>
              을 따릅니다.
            </p>
          </Section>

          <Section no="5" title="이용자의 의무">
            <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>법령이나 공서양속에 반하는 내용을 게시하는 행위</li>
              <li>
                타인을 비방·모욕하거나 명예를 훼손하는 내용을 게시하는 행위
              </li>
              <li>타인의 저작권 등 권리를 침해하는 내용을 게시하는 행위</li>
              <li>허위 정보를 게시하거나 타인을 사칭하는 행위</li>
              <li>
                자동화된 수단으로 서비스에 과도한 부하를 주거나 데이터를 대량
                수집하는 행위
              </li>
              <li>서비스의 정상적인 운영을 방해하는 행위</li>
            </ul>
          </Section>

          <Section no="6" title="이용자가 올린 콘텐츠">
            <p>
              이용자가 작성한 메모·사진·리뷰·커뮤니티 게시글(이하
              &ldquo;게시물&rdquo;)의 저작권은 이용자에게 있습니다.
            </p>
            <p>
              운영자는 서비스 제공·개선 및 서비스 내 노출에 필요한 범위에서만
              게시물을 이용합니다. 이 범위를 벗어난 이용(예: 외부 광고 활용)에는
              별도의 동의를 받습니다.
            </p>
            <p>
              게시물의 내용에 대한 책임은 작성자에게 있습니다. 운영자는 §5에
              반하거나 신고를 통해 문제가 확인된 게시물을 사전 통지 없이 숨기거나
              삭제할 수 있습니다.
            </p>
            <p>
              이용자가 게시물을 삭제하거나 계정을 삭제하면 해당 게시물은 서비스에
              노출되지 않습니다.
            </p>
          </Section>

          <Section no="7" title="전시 정보의 정확성">
            <p>
              서비스가 제공하는 전시·부스 정보는 주최 측이 공개한 자료와 운영자가
              정리한 내용을 바탕으로 합니다. 현장 사정에 따라 부스 위치·운영
              시간·행사 내용이 달라질 수 있으며, 운영자는 정보가 항상 최신이거나
              오류가 없음을 보증하지 않습니다.
            </p>
            <p>
              추천은 이용자의 관심사를 바탕으로 한 참고 정보이며, 특정 부스의
              품질이나 만족을 보증하지 않습니다.
            </p>
          </Section>

          <Section no="8" title="서비스의 중단">
            <p>
              운영자는 설비 점검·교체, 시스템 장애, 통신 두절 등의 사유로 서비스
              제공을 일시적으로 중단할 수 있습니다. 예정된 중단은 사전에
              안내하며, 불가피한 사유로 사전 안내가 어려운 경우 사후에
              안내합니다.
            </p>
            <p>
              운영자는 서비스의 전부 또는 일부를 종료할 수 있으며, 이 경우 최소
              30일 전에 안내합니다.
            </p>
          </Section>

          <Section no="9" title="책임의 제한">
            <p>
              운영자는 천재지변, 이용자의 귀책사유, 제3자 서비스의 장애 등
              운영자의 통제 범위를 벗어난 사유로 발생한 손해에 대해 책임을 지지
              않습니다.
            </p>
            <p>
              무료로 제공되는 서비스의 이용과 관련하여 발생한 손해에 대해서는
              운영자의 고의 또는 중대한 과실이 있는 경우를 제외하고 책임을 지지
              않습니다.
            </p>
            <p>
              이용자 간 또는 이용자와 제3자(전시 주최 측·출품사 등) 사이에 발생한
              분쟁에 대해 운영자는 개입할 의무가 없으며, 그로 인한 손해에 책임을
              지지 않습니다.
            </p>
          </Section>

          <Section no="10" title="이용 제한">
            <p>
              운영자는 이용자가 §5의 의무를 위반한 경우 사전 통지 후 이용을
              제한하거나 계정을 정지할 수 있습니다. 다만 긴급하거나 중대한 위반의
              경우 즉시 조치한 뒤 사후에 통지합니다.
            </p>
            <p>
              이용자는 조치에 이의가 있는 경우 {CONTACT_EMAIL} 으로 소명할 수
              있으며, 운영자는 타당하다고 인정되면 즉시 조치를 해제합니다.
            </p>
          </Section>

          <Section no="11" title="준거법 및 분쟁 해결">
            <p>
              본 약관은 대한민국 법률에 따라 해석됩니다. 서비스 이용과 관련하여
              분쟁이 발생한 경우 운영자와 이용자는 성실히 협의하여 해결하며,
              협의가 이루어지지 않는 경우 민사소송법에 따른 관할 법원에 소를
              제기할 수 있습니다.
            </p>
          </Section>

          <Section no="12" title="문의">
            <p>본 약관에 관한 문의는 아래로 연락해 주시기 바랍니다.</p>
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
              Terms of Service
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Effective and last updated: {EFFECTIVE_DATE_EN}
            </p>
          </header>

          <Section no="1" title="Purpose">
            <p>
              These Terms set out the conditions for using Roam (the
              &ldquo;Service&rdquo;) and the rights and obligations of users and
              the operator.
            </p>
          </Section>

          <Section no="2" title="What the Service Provides">
            <p>
              The Service is a mobile guide for visitors to exhibitions and
              trade fairs. It provides:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Exhibition and booth information</li>
              <li>Booth recommendations based on your interests</li>
              <li>Location guidance on the venue floor plan</li>
              <li>Personal reactions, notes, and photos for booths</li>
              <li>Reviews and community posts</li>
              <li>A summary of your visit</li>
            </ul>
            <p>
              The Service is free to use. If paid features are introduced, we
              will announce them in advance and obtain separate consent.
            </p>
          </Section>

          <Section no="3" title="Changes to These Terms">
            <p>
              These Terms take effect when posted in the Service. We may amend
              them, and will post the change and its effective date on this
              page.
            </p>
            <p>
              For changes adverse to users we give at least 30 days&rsquo;
              notice before the effective date; for other changes, at least 7
              days, by in-Service notice or email. If you do not agree to a
              change, you may stop using the Service and request account
              deletion.
            </p>
          </Section>

          <Section no="4" title="Accounts">
            <p>
              An account is required. You can create one with a nickname or with
              a Google Account.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Your nickname is a public identifier visible to other users.
              </li>
              <li>
                You may not create an account using someone else&rsquo;s
                identity or information.
              </li>
              <li>
                Accounts are personal and may not be transferred or lent to
                anyone else.
              </li>
              <li>
                You may request account deletion at any time at {CONTACT_EMAIL}.
              </li>
            </ul>
            <p>
              Handling of personal information is governed by our{" "}
              <Link
                href="/privacy"
                className="font-medium text-primary underline underline-offset-2"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </Section>

          <Section no="5" title="Your Obligations">
            <p>You must not:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>post content that violates law or public morals;</li>
              <li>defame, insult, or harm the reputation of others;</li>
              <li>
                post content that infringes copyright or other rights of others;
              </li>
              <li>post false information or impersonate others;</li>
              <li>
                place excessive load on the Service or scrape data in bulk by
                automated means;
              </li>
              <li>interfere with the normal operation of the Service.</li>
            </ul>
          </Section>

          <Section no="6" title="Content You Post">
            <p>
              You retain copyright in the notes, photos, reviews, and community
              posts you create (&ldquo;Content&rdquo;).
            </p>
            <p>
              We use your Content only as needed to operate, improve, and
              display the Service. Any use beyond that scope — for example
              external advertising — requires your separate consent.
            </p>
            <p>
              You are responsible for your Content. We may hide or remove
              Content that violates Section 5 or that is confirmed problematic
              through a report, without prior notice.
            </p>
            <p>
              If you delete Content or your account, that Content is no longer
              displayed in the Service.
            </p>
          </Section>

          <Section no="7" title="Accuracy of Exhibition Information">
            <p>
              Exhibition and booth information comes from materials published by
              organizers and compiled by us. Booth locations, hours, and program
              details may change on site, and we do not warrant that the
              information is always current or free of errors.
            </p>
            <p>
              Recommendations are informational suggestions based on your
              interests and are not a warranty of any booth&rsquo;s quality or
              of your satisfaction.
            </p>
          </Section>

          <Section no="8" title="Service Interruptions">
            <p>
              We may temporarily suspend the Service for maintenance, equipment
              replacement, system failures, or network outages. We announce
              planned suspensions in advance, and unavoidable ones as soon as
              practicable afterward.
            </p>
            <p>
              We may discontinue all or part of the Service with at least 30
              days&rsquo; notice.
            </p>
          </Section>

          <Section no="9" title="Limitation of Liability">
            <p>
              We are not liable for damages arising from causes beyond our
              control, including force majeure, your own fault, or failures of
              third-party services.
            </p>
            <p>
              For a Service provided free of charge, we are not liable for
              damages arising from its use except in cases of our willful
              misconduct or gross negligence.
            </p>
            <p>
              We have no obligation to intervene in disputes between users, or
              between a user and a third party such as an exhibition organizer
              or exhibitor, and are not liable for resulting damages.
            </p>
          </Section>

          <Section no="10" title="Restrictions on Use">
            <p>
              If you breach Section 5, we may restrict your use or suspend your
              account after prior notice. For urgent or serious breaches we may
              act immediately and notify you afterward.
            </p>
            <p>
              You may contest such action at {CONTACT_EMAIL}, and we will lift it
              promptly if your explanation is well founded.
            </p>
          </Section>

          <Section no="11" title="Governing Law and Disputes">
            <p>
              These Terms are governed by the laws of the Republic of Korea. If
              a dispute arises, we and you will seek to resolve it in good
              faith; failing that, either party may bring an action before the
              court having jurisdiction under the Korean Civil Procedure Act.
            </p>
          </Section>

          <Section no="12" title="Contact">
            <p>For questions about these Terms, please contact us.</p>
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

        <LegalFooter />
      </main>
    </div>
  );
}
