# 인스타 댓글 → DM → 브랜드 모아보기 페이지 (picks) 설계

_작성 2026-10-22 · 상태: 설계 검토 대기 · 첫 대상: 카드뉴스 p4-04 "취향 분명한 친구에게 줄 작은 물건"(2026-10-22 19:00 게시)_

## 왜

카드뉴스는 브랜드를 소개하지만 독자가 그 브랜드와 상품으로 가는 길이 없다. 캡션의 @태그를 하나씩
누르는 수밖에 없고, 판매 여부나 가격처럼 바뀌는 정보는 게시물에 넣으면 고칠 수 없다.

댓글에 키워드를 남기면 DM으로 회차별 페이지 링크를 보내고, 그 페이지에서 브랜드, 상품, 공식 몰,
인스타로 바로 가게 한다. 얻는 것은 셋이다.

1. 댓글이 생긴다(저장 권유보다 직접적인 반응 신호, 학습 에이전트가 읽는 `comments`).
2. 바뀌는 정보(판매 여부, 가격, 링크)는 페이지만 고치면 된다. 카드에는 남기지 않는다.
3. 페이지 끝에서 다시 팔로우를 권한다. 팔로우 동선이 카드 마지막 장과 페이지 두 군데가 된다.

## 이미 있는 것

| 부품 | 위치 | 쓰는 방법 |
|---|---|---|
| 댓글 키워드 → Private Reply DM | `/api/instagram/webhook`, `src/lib/instagram/rules.ts`, `ig_comment_dm`(0058) | 규칙 하나 추가로 링크 발송. `mediaIds`로 게시물 한정 가능 |
| 행사를 넘는 브랜드 | `exhibitor`(0040: `instagram_url`, `website_url`) ← `exhibition_participant` ← `booth_participant` | 페이지 항목이 브랜드를 가리키는 앵커 |
| 브랜드 소개와 사진 | 가장 최근 승인 부스(`booth.description`, `booth.images`) | CLAUDE.md 규칙대로 복사하지 않고 부스에서 읽는다 |
| 공개 라우트 게이트 | `src/proxy.ts` `PUBLIC_PATH_PATTERNS` | 새 패턴 하나 추가 |
| 게시 CLI | `npm run ig:publish` | 게시 결과의 media id를 페이지에 연결 |

## 범위

**한다**: 회차별 공개 페이지 `/picks/[slug]`, 그 데이터 테이블 두 개, 콘텐츠 엔진 산출물에서 페이지를 채우는
import 스크립트, DB에서 읽는 DM 규칙, 바깥 링크 클릭 기록.

**안 한다(v1)**: 관리 화면(import로 시작), 제휴 링크와 수수료, 장바구니나 결제, 로그인 개인화, 상품 재고 연동.

## 화면 `/picks/[slug]`

로그인 없이 열린다. 인스타 인앱 브라우저에서 열리므로 모바일 한 열, 가볍게.

```
[표지 사진]  취향 분명한 친구에게 줄 작은 물건 6가지
             받는 사람 취향별로 하나씩

┌ 항목 ───────────────────────────────┐
│ [사진]                               │
│ 잘 웃는 친구에게                      │  ← 카드의 받는 사람 제목
│ 미소랑  하이포 북앤드                  │  ← 브랜드(exhibitor) + 상품
│ 사물에 표정을 입힌 도자 식기를 만들어요   │  ← 카드 문구(회차 고유)
│ [공식 몰에서 보기]  [@_misorang_]      │  ← 확인된 링크만
└─────────────────────────────────────┘
 … 6개

판매 여부와 가격은 각 공식 몰 기준이에요 · 링크 확인 2026-10-22
@withromi.con 팔로우하면 전시에서 찾은 작은 브랜드를 계속 소개해요  [인스타에서 보기]
```

- 문구는 카드뉴스와 같은 규칙(해요체, 보이스톤, 금칙어). 회차 고유 문구는 콘텐츠 엔진 `copy.json`이 원천이고,
  윤문 게이트를 이미 거친 것만 들어온다.
- 링크는 확인 날짜가 있는 것만 버튼으로 보인다. 확인 안 된 링크는 숨긴다(공식 출처 원칙).
- 지난 행사 이름과 부스 번호는 쓰지 않는다(카드뉴스 규칙과 같다).
- OG 이미지는 표지 카드. DM 미리보기에 보인다.

## 데이터

```sql
-- 0061_picks.sql (번호는 main 기준으로 다시 확인)
create table pick_list (
  id            text primary key default gen_random_uuid()::text,
  slug          text not null unique,          -- 콘텐츠 엔진 run slug와 같게 (p4-04-gift-for-taste)
  title         text not null,
  intro         text,
  cover_image   text,                          -- 공개 URL
  ig_media_id   text,                          -- 게시물 id. DM 규칙을 이 게시물로 한정
  dm_keyword    text,                          -- 예: '선물'. null이면 DM 없음
  dm_message    text,                          -- 해요체. 링크는 서버가 붙인다
  status        text not null default 'draft' check (status in ('draft','published','archived')),
  source_run    text,                          -- Roam-design docs/content/engine/runs/<slug>
  links_checked_at date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table pick_item (
  id            text primary key default gen_random_uuid()::text,
  list_id       text not null references pick_list(id) on delete cascade,
  position      int  not null,
  exhibitor_id  text references exhibitor(id) on delete restrict,  -- 브랜드 앵커. 인스타·웹은 여기서 읽는다
  heading       text not null,                 -- '잘 웃는 친구에게'
  product_name  text,                          -- '하이포 북앤드'
  blurb         text,                          -- 회차 고유 한 줄
  image         text,                          -- 기본은 부스 사진 참조, 없으면 공개 URL
  links         jsonb not null default '[]',   -- [{kind:'store'|'product'|'instagram', url, checkedAt}]
  unique (list_id, position)
);

create table pick_click (                      -- 텔레메트리. loggedWrite로 쓴다
  id bigint generated always as identity primary key,
  list_id text not null, item_id text, kind text not null, created_at timestamptz not null default now()
);
```

- RLS: `pick_list`, `pick_item`은 `status = 'published'`만 공개 읽기. 쓰기는 service role.
- 쓰기는 CLAUDE.md 쓰기 규약(`wrote()`/`loggedWrite()`)을 따른다.
- 브랜드 소개와 사진을 복사하지 않는다. `exhibitor_id`가 있으면 인스타와 웹은 `exhibitor`에서, 사진 기본값은
  가장 최근 승인 부스에서 읽는다. 회차 문구(`heading`, `blurb`)만 저장한다.
- 바깥 링크는 `/api/picks/[slug]/out?item=&kind=`로 한 번 거쳐 `pick_click`에 남기고 리다이렉트한다.
  허용 URL은 그 항목의 `links`에 있는 것뿐(오픈 리다이렉트 방지).

## 콘텐츠 엔진과의 연결

```
Roam-design  runs/<slug>/copy.json  (+ picks 블록)
      │  npm run picks:import -- <copy.json 경로>   (Roam 레포, 드라이런 기본)
      ▼
Roam DB  pick_list(draft) / pick_item
      │  ig:publish 결과 media id 기록 → status published
      ▼
웹훅  댓글 키워드 매칭(코드 규칙 + pick_list 규칙) → DM에 /picks/<slug> 링크
```

- `copy.json`에 `picks` 블록을 더한다: 항목마다 `exhibitorSlug`(또는 브랜드 이름), `heading`, `product`,
  `blurb`, `links`. 카피 에이전트가 쓰고, 링크는 `needs-check`면 import가 숨김 처리한다.
- 카드뉴스 CTA 라이브러리에 `cta-comment-picks`(댓글 키워드로 모아보기 받기, `dmKeyword` 필드)를 더한다.
  키워드는 `pick_list.dm_keyword`와 같아야 한다.
- 학습 에이전트는 `comments`와 `pick_click` 수를 함께 본다(게시물 지표는 Graph API, 클릭은 DB).

## DM 규칙을 DB로

지금 규칙은 코드에 있고 바꾸면 배포한다(`rules.ts` 주석). 회차마다 페이지가 생기면 회차마다 배포가 필요해진다.
웹훅이 `published` 상태이고 `dm_keyword`가 있는 `pick_list`를 규칙으로 함께 읽게 한다.

- 매칭 규칙은 코드 규칙과 같다(`normalizeForMatch`, 부분 일치). `ig_media_id`로 그 게시물 댓글에만 반응한다.
- 공개 답글(`publicReply`)에 키워드를 넣지 않는 기존 안전장치를 그대로 둔다.
- 중복 방지는 기존 `ig_comment_dm` 선점을 그대로 쓴다(`rule_id` = `pick:<slug>`).

## 위험과 확인할 것

1. **Meta 고급 액세스.** 개발 모드에선 앱 역할이 있는 계정에만 Private Reply가 간다
   (`2026-10-14_instagram-comment-auto-dm.md`). 일반 독자 댓글에 실제로 DM이 가는지 먼저 확인한다.
   막혀 있으면 이 기능의 입구가 없다 — 그때는 매니챗 이전(문서에 열어 둔 대안)이나 프로필 링크로 우회한다.
2. **Private Reply 제약**: 댓글 후 7일 안, 댓글당 1회. 게시 7일 뒤 댓글에는 DM이 못 간다 — 페이지 URL을
   프로필 링크에도 두는 걸 같이 고려한다.
3. **링크 정확성**: 공식 몰 주소는 브랜드마다 한 번 확인한다. 확인 날짜를 저장하고 페이지에 보인다.
4. **사진 사용 허락**: 부스 공식 이미지는 카드뉴스와 같은 조건(태그, 가능하면 DM 허락).

## 순서

| 단계 | 내용 | 끝 기준 |
|---|---|---|
| 0 | Meta 고급 액세스 상태 확인(일반 계정 댓글로 DM 테스트) | 일반 계정에 DM 도착 |
| 1 | 마이그레이션, Repository 메서드, `/picks/[slug]` 페이지, proxy 공개 패턴, 클릭 리다이렉트 | p4-04 페이지가 로컬에서 열린다 |
| 2 | `picks:import`(드라이런 기본) + `copy.json` picks 블록 스키마(Roam-design `schema.md`) | p4-04 copy.json으로 draft 생성 |
| 3 | 웹훅이 pick_list 규칙을 읽음 + 테스트 | 테스트 계정 댓글 → DM 링크 |
| 4 | p4-04에 적용: 고정 댓글이나 캡션 수정으로 키워드 안내 | 실제 댓글로 확인 |

## 열린 질문

- URL 이름: `/picks/[slug]`로 둘지(다른 후보: `/list`, `/edit`)
- 제휴 링크와 수수료를 나중에라도 붙일지(붙이면 페이지에 표시 의무)
- p4-04 키워드: 이미 게시된 글이라 캡션에 안내가 없다. 고정 댓글로 안내할지, 앱에서 캡션을 고칠지
