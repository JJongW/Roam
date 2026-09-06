-- ---------------------------------------------------------------------------
-- 0046: 이메일로 다른 provider 계정을 지금 계정에 합친다(예: 웹 Google 계정과
-- iOS Apple 계정이 같은 사람).
--
-- 웹(Google)과 iOS(Apple)의 app_user.id 의미가 서로 다르다 — 웹은 독립적으로
-- 생성한 임의 UUID, iOS는 Supabase auth.uid() 그 자체(0041 RLS가 이 값에
-- 의존). 그래서 합칠 때 반드시 지금 로그인 세션의 auth.uid()가 최종 id로
-- 남아야 한다 — 이건 강제 조건이지 선택이 아니다.
--
-- "내 이메일과 같은 남의 계정 찾기"는 RLS(자기 것만 보임) 하위에서 원천적으로
-- 안 된다 — 그래서 이 함수 하나만 좁게 SECURITY DEFINER로 RLS를 우회한다.
-- authenticated 롤에만 실행 권한을 준다.
--
-- ponytail: 방금 새로 만든(아직 부스 메모 등 아무 데이터도 없는) 계정에서만
-- 호출된다는 전제로 짰다(iOS 신규 가입 직후 1회) — 이미 데이터가 양쪽에 있는
-- 두 계정을 나중에 합치는 일반 시나리오는 다루지 않는다(user_brain PK 충돌 등
-- 더 손볼 게 생김 — 필요해지면 그때 확장).
create or replace function link_app_user_by_email(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  old_id text;
  old_nickname text;
  old_avatar_url text;
  new_id text := auth.uid()::text;
begin
  if p_email is null or new_id is null then
    return null;
  end if;

  select id, nickname, avatar_url into old_id, old_nickname, old_avatar_url
  from app_user
  where lower(email) = lower(p_email) and id <> new_id
  order by created_at asc
  limit 1;

  if old_id is null then
    return null;
  end if;

  -- app_user(id)를 FK로 가진 테이블 전부. 빠뜨리면 아래 delete에서 cascade로
  -- 지워지거나(booth_note·user_signal_log·user_brain·bookmark) 귀속이 끊긴다
  -- (route_plan·analytics_event는 set null).
  update booth_note set user_id = new_id where user_id = old_id;
  update user_signal_log set user_id = new_id where user_id = old_id;
  update route_plan set user_id = new_id where user_id = old_id;
  update analytics_event set user_id = new_id where user_id = old_id;
  -- 새 계정 쪽 행을 먼저 비운다 — user_brain은 PK, bookmark는
  -- (user_id, target_type, target_id) 유니크라 그대로 옮기면 충돌한다.
  delete from user_brain where user_id = new_id;
  update user_brain set user_id = new_id where user_id = old_id;
  delete from bookmark where user_id = new_id;
  update bookmark set user_id = new_id where user_id = old_id;

  update app_user
    set nickname = old_nickname,
        avatar_url = coalesce(old_avatar_url, avatar_url)
    where id = new_id;

  delete from app_user where id = old_id;

  return old_id;
end;
$$;

revoke all on function link_app_user_by_email(text) from public;
grant execute on function link_app_user_by_email(text) to authenticated;
