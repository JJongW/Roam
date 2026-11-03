-- ---------------------------------------------------------------------------
-- 0061: 브랜드 프로필 칸 + 브랜드 컨택(연락 기록, VOC)
--
-- 기준 문서: Roam-design docs/content/engine/brand-profile-spec.md (2026-11-03).
-- 브랜드가 중심이고 연락은 프로필 안의 부수 정보다(Ted 결정 2026-11-03).
--
-- [1] brand_profile_field — 브랜드(exhibitor)나 출전(exhibition_participant)의 칸 하나가 한 행.
--
-- 왜 exhibitor.metadata(jsonb)가 아니라 칸별 테이블인가(기준 문서 "미정 1"):
--   - 모든 칸에 출처, 확인 상태, 갱신일, 누가가 붙는다(5장). metadata에 넣으면 칸마다
--     중첩 객체가 되고, 칸 하나를 고칠 때 jsonb 전체를 읽고 다시 써야 한다 — 워커와
--     운영자가 다른 칸을 동시에 쓰면 한쪽이 사라진다.
--   - status를 check 제약으로 막을 수 있다. metadata 안에서는 오타가 그대로 들어간다.
--   - "AI 초안인 칸 전부", "다시 볼 칸 전부"를 바로 조회할 수 있다(검수 큐, 워커 입력).
--   - 출전 칸(4장)도 같은 모양이라 한 테이블로 같이 둔다. exhibition_participant에는
--     metadata가 있지만 같은 이유로 쓰지 않는다.
--   - exhibitor.metadata는 0040부터 있었지만 지금 코드에서 쓰는 곳이 없다(호출부 0).
--
-- id는 결정적이다: 'ex:<exhibitor_id>:<field>' / 'pt:<participant_id>:<field>'.
-- PostgREST upsert가 부분 unique 인덱스를 onConflict로 못 쓰기 때문에 id로 upsert한다.
-- 칸 목록과 값 모양은 코드(src/lib/brands/profile.ts)가 정한다 — 칸을 늘려도
-- 마이그레이션이 없다. 값 검사는 저장 전에 코드가 한다(parseFieldValue).
--
-- 브랜드를 합치면(연결 승인) 칸을 옮긴다. 대상에 없는 칸만 옮기고 겹치면 대상 것을
-- 지킨다. 옮긴 뒤에 exhibitor를 지운다 — 먼저 지우면 cascade로 사라진다.
--
-- [2] brand_contact, brand_contact_log — 연락 기록.
--
-- 카드뉴스 등에 참가 브랜드의 사진과 소개를 쓰려면 브랜드마다 DM으로 허락을 받는다.
-- 지금까지는 Roam-design 레포의 csv(permissions.csv)로 따로 추적했다. 이 테이블은
-- 그 칸을 그대로 옮겨 /admin/brands에서 본다.
--
-- 한 행 = 한 부스(그 브랜드의 그 박람회 회차). 같은 브랜드도 박람회마다 따로 묻고
-- 허락 범위도 다를 수 있어서 참가사(exhibitor)가 아니라 부스에 붙인다. 브랜드 단위로
-- 묶어 보는 건 화면이 0040 참가사 그래프로 한다.
--
--   status      : csv dmStatus와 같은 값 + replied(답은 왔는데 허락 여부는 아직)
--   allowed_use : csv allowedUse를 `;`로 쪼갠 토큰 배열(account-photo, tag ...)
--   checklist   : { 항목 key: 완료 시각(ISO) }. 항목 정의는 코드
--                 (src/lib/brands/contact.ts CONTACT_CHECKLIST)라 늘려도 마이그레이션이 없다.
--   photo_source, text_source : 받은 사진과 글이 있는 곳(경로나 링크). 파일 자체는
--                 여기 올리지 않는다(새 스토리지 버킷 없음).
--
-- brand_contact_log는 연락이 오간 기록(VOC)을 쌓기만 한다. 고치거나 지우는 API는
-- 없다. 수정이나 내려 달라는 요청도 kind로 남긴다.
--
-- 적용은 손으로 한다(Supabase SQL Editor) — CLAUDE.md 규약.
-- ---------------------------------------------------------------------------

create table if not exists brand_contact (
  booth_id      text primary key references booth(id) on delete cascade,
  exhibition_id text not null references exhibition(id) on delete cascade,
  status        text not null default 'not-sent'
                check (status in ('not-sent', 'sent', 'read', 'replied', 'granted',
                                  'partial', 'declined', 'no-reply', 'withdrawn')),
  channel       text check (channel in ('instagram', 'x', 'email', 'other')),
  handle        text,
  sent_at       date,
  reply         text,
  allowed_use   jsonb not null default '[]'::jsonb,
  photo_source  text,
  text_source   text,
  notes         text,
  checklist     jsonb not null default '{}'::jsonb,
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists brand_contact_exhibition_status_idx
  on brand_contact (exhibition_id, status);

-- exhibition_id는 부스에서 따라 나오는 값이다 — 어긋나면 박람회별 진행 현황이 틀린다.
create or replace function validate_brand_contact_exhibition()
returns trigger
language plpgsql
as $$
declare
  booth_exhibition_id text;
begin
  select exhibition_id into booth_exhibition_id from booth where id = new.booth_id;
  if booth_exhibition_id is null or booth_exhibition_id <> new.exhibition_id then
    raise exception 'brand_contact.exhibition_id must match booth.exhibition_id';
  end if;
  return new;
end;
$$;

drop trigger if exists brand_contact_same_exhibition on brand_contact;
create trigger brand_contact_same_exhibition
  before insert or update on brand_contact
  for each row execute function validate_brand_contact_exhibition();

create table if not exists brand_contact_log (
  id          text primary key,
  booth_id    text not null references brand_contact(booth_id) on delete cascade,
  direction   text not null check (direction in ('outbound', 'inbound', 'internal')),
  kind        text not null
              check (kind in ('message', 'permission', 'edit-request',
                              'takedown-request', 'thanks', 'other')),
  channel     text check (channel in ('instagram', 'x', 'email', 'other')),
  summary     text not null,
  actor       text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists brand_contact_log_booth_idx
  on brand_contact_log (booth_id, occurred_at desc);

alter table brand_contact enable row level security;
alter table brand_contact_log enable row level security;
-- 서비스 롤 전용. 정책이 없으니 방문객 키(anon)로는 읽고 쓸 수 없다 —
-- 읽기와 쓰기 모두 requireAdmin을 통과한 /admin/brands와 /api/admin/brands 뿐이다.

-- [1] 브랜드 프로필 칸 ------------------------------------------------------
create table if not exists brand_profile_field (
  id             text primary key,
  exhibitor_id   text references exhibitor(id) on delete cascade,
  participant_id text references exhibition_participant(id) on delete cascade,
  field          text not null,
  value          jsonb not null,
  sources        jsonb not null default '[]'::jsonb,
  status         text not null
                 check (status in ('collected', 'ai_draft', 'reviewed', 'artist_confirmed', 'stale')),
  verified_at    timestamptz not null default now(),
  actor          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- 브랜드 칸이거나 출전 칸이거나, 둘 중 하나만.
  check ((exhibitor_id is null) <> (participant_id is null)),
  -- id가 주인과 칸에서 나온 값인지(upsert 키라서 어긋나면 같은 칸이 두 줄이 된다).
  check (id = case when exhibitor_id is not null then 'ex:' || exhibitor_id || ':' || field
                   else 'pt:' || participant_id || ':' || field end)
);

create index if not exists brand_profile_field_exhibitor_idx
  on brand_profile_field (exhibitor_id) where exhibitor_id is not null;
create index if not exists brand_profile_field_participant_idx
  on brand_profile_field (participant_id) where participant_id is not null;
-- 검수 큐와 워커가 "AI 초안 칸", "다시 볼 칸"을 찾는다.
create index if not exists brand_profile_field_status_idx
  on brand_profile_field (status, updated_at desc);

-- 합칠 때 칸 옮기기를 한 트랜잭션으로(함수 호출 하나가 트랜잭션 하나다). 대상에 없는 칸만
-- 대상 id로 넣고, from 칸은 전부 지운다 — 겹치면 대상 것을 지킨다(src/lib/brands/profile.ts
-- planFieldMerge와 같은 규칙). 저장소의 mergeExhibitor가 exhibitor를 지우기 전에 부른다.
--   p_kind : 'ex'(브랜드 칸) | 'pt'(출전 칸)
create or replace function move_brand_profile_fields(p_kind text, p_from text, p_to text)
returns integer
language plpgsql
as $$
declare
  moved integer;
begin
  if p_kind not in ('ex', 'pt') then
    raise exception 'p_kind must be ex or pt';
  end if;
  insert into brand_profile_field
    (id, exhibitor_id, participant_id, field, value, sources, status, verified_at, actor, created_at, updated_at)
  select p_kind || ':' || p_to || ':' || f.field,
         case when p_kind = 'ex' then p_to end,
         case when p_kind = 'pt' then p_to end,
         f.field, f.value, f.sources, f.status, f.verified_at, f.actor, f.created_at, now()
    from brand_profile_field f
   where (case when p_kind = 'ex' then f.exhibitor_id else f.participant_id end) = p_from
     and not exists (
       select 1 from brand_profile_field t where t.id = p_kind || ':' || p_to || ':' || f.field
     );
  get diagnostics moved = row_count;
  delete from brand_profile_field f
   where (case when p_kind = 'ex' then f.exhibitor_id else f.participant_id end) = p_from;
  return moved;
end;
$$;
-- 서비스 롤만 부른다. 방문객 키(anon, authenticated)로는 못 부르게 막는다.
revoke all on function move_brand_profile_fields(text, text, text) from public, anon, authenticated;

alter table brand_profile_field enable row level security;
-- 서비스 롤 전용(정책 없음). 앱이 이 칸을 읽게 되면 그때 reviewed 이상만 여는 정책이나
-- 뷰를 따로 만든다(기준 문서 5장 "앱과 카드뉴스는 reviewed 이상만").
