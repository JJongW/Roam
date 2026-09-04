-- 0037: issue_log에 기기·위치 컬럼 추가. IP 자체는 저장하지 않는다 — Vercel의
-- x-vercel-ip-country/x-vercel-ip-city 헤더에서 뽑은 국가/도시만 담는다.
alter table issue_log
  add column if not exists device  text,
  add column if not exists country text,
  add column if not exists city    text;
