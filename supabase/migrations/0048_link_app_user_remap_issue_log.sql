-- ---------------------------------------------------------------------------
-- 0048: 계정 병합 시 issue_log.user_id도 옮긴다.
--
-- 0046은 app_user(id)를 FK로 가진 테이블만 옮겼다. issue_log.user_id는 FK가
-- 없는 plain text라(0036 — 오류 로그는 계정이 지워져도 남아야 해서 의도적으로
-- 안 걸었다) 그 목록에서 빠졌고, 병합 후 옛 id를 가진 오류 로그의 관리자
-- 계정 링크(/admin/accounts/{user_id})가 전부 "계정을 찾을 수 없어요"가 된다.
--
-- FK가 없다는 건 DB가 대신 지워주지도, 끊어주지도 않는다는 뜻이다 — 옮기는
-- 것도 여기서 직접 해야 한다.
--
-- 0046 본문을 그대로 다시 싣고 update 한 줄만 더한다(create or replace라
-- 이 파일 하나가 함수의 최신 정의가 된다).

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
  my_email text;
begin
  if new_id is null then
    return null;
  end if;

  -- 신원의 출처는 세션이지 인자가 아니다. 미확인 이메일은 대상에서 제외한다.
  select email into my_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;

  if my_email is null then
    return null;
  end if;

  if p_email is not null and lower(p_email) <> lower(my_email) then
    return null;
  end if;

  select id, nickname, avatar_url into old_id, old_nickname, old_avatar_url
  from app_user
  where lower(email) = lower(my_email) and id <> new_id
  order by created_at asc
  limit 1;

  if old_id is null then
    return null;
  end if;

  -- app_user(id)를 FK로 가진 테이블.
  update booth_note set user_id = new_id where user_id = old_id;
  update user_signal_log set user_id = new_id where user_id = old_id;
  update route_plan set user_id = new_id where user_id = old_id;
  update analytics_event set user_id = new_id where user_id = old_id;
  -- FK 없는 plain text 참조 — DB가 안 봐주므로 직접 옮긴다(0048).
  update issue_log set user_id = new_id where user_id = old_id;
  -- 새 계정 쪽 행을 먼저 비운다 — user_brain은 PK, bookmark는
  -- (user_id, target_type, target_id) 유니크라 그대로 옮기면 충돌한다.
  delete from user_brain where user_id = new_id;
  update user_brain set user_id = new_id where user_id = old_id;
  delete from bookmark where user_id = new_id;
  update bookmark set user_id = new_id where user_id = old_id;

  -- 옛 행을 먼저 지운다 — nickname은 lower(nickname) 유니크(0003)라, 옛 행이
  -- 그 닉네임을 쥔 채로 새 행에 같은 값을 쓰면 23505로 반드시 실패한다.
  delete from app_user where id = old_id;

  update app_user
    set nickname = old_nickname,
        avatar_url = coalesce(old_avatar_url, avatar_url)
    where id = new_id;

  return old_id;
end;
$$;

revoke all on function link_app_user_by_email(text) from public;
grant execute on function link_app_user_by_email(text) to authenticated;
