-- 방문 목적 다중선택: 단일 enum 컬럼을 enum 배열로 전환하고 이름을 복수형으로.
-- 기존 행은 단일 값을 1개짜리 배열로 감싸 보존한다.
alter table user_preference
  alter column visit_purpose type visit_purpose[]
  using array[visit_purpose]::visit_purpose[];

alter table user_preference
  rename column visit_purpose to visit_purposes;
