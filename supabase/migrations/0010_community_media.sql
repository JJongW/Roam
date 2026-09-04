-- 0010: community_post media (Cloudinary photo / short clip). Display-only.
-- Idempotent.

alter table community_post add column if not exists media_url       text;
alter table community_post add column if not exists media_type       text;
alter table community_post add column if not exists media_public_id  text;
