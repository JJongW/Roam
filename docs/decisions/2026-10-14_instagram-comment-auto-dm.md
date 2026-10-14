# 인스타 댓글 자동 DM — 댓글 단 사람에게 링크를 바로 보낸다

**날짜**: 2026-10-14
**관련 파일**: `src/lib/instagram/{rules,signature,handle,graph,store}.ts` ·
`src/app/api/instagram/webhook/route.ts` · `supabase/migrations/0058_instagram_comment_dm.sql`

## 배경

Roam 인스타 계정은 팔로워가 0이라 카드뉴스를 올려도 닿는 사람이 없다. 피드 노출은
반응(댓글·저장·공유)을 따라가는데, 반응을 끌어낼 장치가 없었다.

인스타에서 "댓글 달면 DM으로 보내드려요" 게시물 상위 50개를 조사했다(2026-10-14).

- **댓글 수가 좋아요와 비슷하거나 더 많았다** — 댓글÷좋아요 중앙값 1.21, 댓글 중앙값 863.
  보통 게시물은 댓글이 좋아요의 몇 %에 그친다. 댓글이 곧 "받기 버튼"이 되기 때문이다.
- **추첨 경품형(댓글 중앙값 373)보다 바로 받는 자료형(1,219)이 잘 됐다.** 기다려야 하는
  보상보다 지금 받는 쓸모가 반응을 더 끌어낸다. Roam은 전시 지도·부스 정보처럼 바로 줄
  수 있는 자료가 있다.
- 절반이 키워드 트리거("지도"라고 댓글 달기), 절반이 팔로우 조건을 붙였다.

## 결정

**매니챗 같은 외부 SaaS 대신 Roam 웹 앱에 웹훅 라우트를 직접 만든다.**

- 도메인(`roam.ai.kr`)·Vercel·Supabase가 이미 있다. 웹훅 하나 받는 데 새 인프라가 없다.
- 규칙이 카드뉴스 회차당 하나 수준이라 코드(`rules.ts`)로 충분하다. 관리 화면을 만들 만큼
  자주 바뀌지 않는다 — 바꾸면 배포한다.
- 댓글 데이터(누가·어느 게시물·어떤 규칙)가 **우리 DB에 남는다.** 회차별 성과를 직접 본다.

**대안(매니챗)의 장점도 분명하다.** Meta 앱 심사가 필요 없고(매니챗이 이미 심사를 통과한
앱이다), 오늘 바로 쓸 수 있으며, 팔로우 조건·시퀀스 같은 기능이 이미 있다. 직접 만드는
쪽은 아래 "Meta 제약"의 앱 심사가 실제로 필요하면 일반 사용자에게 닿기까지 시간이 걸린다.
심사가 막히면 매니챗으로 넘어가는 것도 열어 둔다 — 규칙 문구는 그대로 옮길 수 있다.

## 구조

```
POST/GET /api/instagram/webhook   (route.ts)
  GET  → 구독 확인(hub.verify_token == IG_WEBHOOK_VERIFY_TOKEN이면 hub.challenge 반환)
  POST → 서명 검증(X-Hub-Signature-256, IG_APP_SECRET HMAC-SHA256)   signature.ts
       → handleWebhook                                                handle.ts
           ① 내 계정이 단 댓글 거르기(우리 공개 답글이 다시 들어와도 무시)
           ② 키워드 매칭(공백·문장부호 제거, 소문자 부분 일치)          rules.ts
           ③ ig_comment_dm에 댓글 ID로 선점 — 이미 있으면 건너뜀       store.ts
           ④ Private Reply(DM) 발송 → sent / failed 기록               graph.ts
           ⑤ (선택) 공개 답글 — 실패해도 DM은 갔으니 sent 유지
```

**선점을 발송보다 먼저 한다.** Meta는 200을 늦게 받으면 같은 이벤트를 다시 보내는데,
발송 뒤에 기록하면 그 사이 재전송이 DM을 두 번 보낸다. 대신 발송이 실패하면 그 댓글은
`failed`로 남고 자동 재시도하지 않는다 — Private Reply는 댓글당 한 번뿐이라, 애매하면 안
보내는 쪽이 낫다.

## Meta 제약

출처: https://developers.facebook.com/docs/instagram-platform/private-replies/

- **Instagram API with Instagram Login**(`graph.instagram.com`)을 쓴다. 페이스북 페이지 연결이
  필요 없는 쪽이다.
- 권한: `instagram_business_basic` + `instagram_business_manage_comments`. 메시지 발송에
  `instagram_business_manage_messages`가 필요할 수 있다 — **설정할 때 확인한다.**
- 웹훅 필드: `comments`.
- Private Reply는 **댓글 작성 후 7일 안, 댓글당 1회**. 상대가 DM에 답하면 그로부터 24시간
  안에 후속 메시지를 보낼 수 있다.
- **개발 모드에선 앱 역할(관리자·개발자·테스터)이 있는 계정에만 동작한다.** 일반 사용자
  댓글에 반응하려면 앱 심사(고급 액세스)가 필요할 가능성이 높다 — **확인 필요.**

## 설정 순서(사람이 할 일)

1. Meta 개발자 계정 등록(developers.facebook.com).
2. 앱 생성.
3. 앱에 Instagram 제품 추가 → "Instagram 로그인을 사용한 API 설정"에서 Roam 인스타 계정 연결
   (프로페셔널 계정이어야 한다).
4. 장기 액세스 토큰 발급.
5. Vercel 환경변수 등록:
   - `IG_APP_SECRET` — 앱 시크릿(서명 검증)
   - `IG_WEBHOOK_VERIFY_TOKEN` — 아무 임의 문자열(웹훅 구독 확인용, 8번에서 같은 값을 Meta에 입력)
   - `IG_ACCESS_TOKEN` — 4번의 장기 토큰
   - `IG_USER_ID` — Roam 인스타 계정 ID
   - `IG_GRAPH_VERSION` — 선택(Graph API 버전 고정)
6. 마이그레이션 `0058_instagram_comment_dm.sql`을 Supabase SQL Editor로 적용.
7. 배포.
8. 앱 대시보드 웹훅 설정에 콜백 URL `https://roam.ai.kr/api/instagram/webhook`과 검증 토큰을
   등록하고 `comments` 필드를 구독.
9. 앱 역할이 있는 테스트 계정으로 대상 게시물에 "지도" 댓글 → DM 도착·`ig_comment_dm` 행
   `status='sent'` 확인.

## 운영 주의

- **토큰은 60일 뒤 만료된다.** 갱신 자동화는 아직 없다 — 후속 과제. 만료되면 발송이 전부
  `failed`로 쌓인다.
- 규칙 문구는 **해요체, 과장 금지**(화자는 Roam 계정 — Roam-design 카드뉴스 규칙
  `docs/content/card-news/README.md`). 앱 안 로미의 반말과 다르다.
- `publicReply`에는 **어떤 규칙의 키워드도 넣지 않는다.** 자기 댓글은 handle.ts가 거르지만,
  공개 답글이 다시 규칙에 걸리지 않게 하는 이중 안전장치다.
- 실패한 댓글은 재시도하지 않는다. 확인은 `select * from ig_comment_dm where status = 'failed'`.
  필요하면 사람이 직접 DM한다.
