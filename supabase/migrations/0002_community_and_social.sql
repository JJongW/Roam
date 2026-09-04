-- ---------------------------------------------------------------------------
-- 0002: booth social links + real-time community feed
-- ---------------------------------------------------------------------------

-- --- booth: stand number (floorplan) + outbound links ----------------------
alter table booth add column if not exists code          text;
alter table booth add column if not exists instagram_url text;
alter table booth add column if not exists website_url   text;

-- --- community_post --------------------------------------------------------
create table if not exists community_post (
  id            text primary key default gen_random_uuid()::text,
  exhibition_id text not null references exhibition(id) on delete cascade,
  session_id    text not null references visitor_session(id) on delete cascade,
  author_name   text not null default '익명',
  body          text not null,
  booth_id      text references booth(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists community_post_exhibition_created_idx
  on community_post (exhibition_id, created_at desc);

-- --- RLS: 누구나 조회 + 작성(세션 범위는 서버 레이어에서 처리) -------------
alter table community_post enable row level security;

drop policy if exists "public read community_post" on community_post;
drop policy if exists "anon insert community_post" on community_post;
create policy "public read community_post" on community_post for select using (true);
create policy "anon insert community_post" on community_post for insert with check (true);

-- --- realtime: 신규 글 INSERT 구독 (이미 등록돼 있으면 건너뜀) ---------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'community_post'
  ) then
    alter publication supabase_realtime add table community_post;
  end if;
end $$;
