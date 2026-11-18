-- ---------------------------------------------------------------------------
-- 0065: 기존 booth_note 행의 hearted_at, verdict_at을 채운다(데이터 이관).
--
-- 0064 다음에, 운영 booth_note 백업을 뜬 뒤 적용한다. 되돌리기는 두 칸을 null로
-- 비우면 된다(다른 칸은 안 건드린다).
--
-- - 하트: must, curious → 하트. 시각은 모르니 그 행의 updated_at으로 둔다(지어낸
--   시각이 아니라 "이때까지는 하트였다"는 가장 이른 확인 시각). pass → 하트 없음.
-- - 평가 시각: 옛 규칙에선 평가를 쓸 때 visited_at을 같이 썼다 → 평가가 있는 행은
--   visited_at이 곧 평가 시각이다.
--
-- 트리거(0064)는 interest가 안 바뀌는 이 update에서는 아무것도 하지 않는다.
-- updated_at은 일부러 안 건드린다.
-- ---------------------------------------------------------------------------

update booth_note
   set hearted_at = updated_at
 where hearted_at is null
   and interest in ('must', 'curious');

update booth_note
   set verdict_at = visited_at
 where verdict_at is null
   and verdict is not null
   and visited_at is not null;
