-- 0008: event program fields — tag(유형), subtitle(부주제), speaker(강연자),
-- standing(상시 운영 여부). Event rows themselves are reseeded via seed.sql /
-- reset.sql (the official SIBF program: standing booth events + timed lectures).
-- Idempotent.

alter table event add column if not exists tag      text;
alter table event add column if not exists subtitle text;
alter table event add column if not exists speaker  text;
alter table event add column if not exists standing boolean not null default false;
