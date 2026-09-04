-- ---------------------------------------------------------------------------
-- 0018: OAuth accounts (Google) layered onto the existing nickname identity.
-- app_user stays the single account table; a row may originate from a nickname
-- (provider NULL) or from an OAuth provider. Nickname remains the unique public
-- key either way — for OAuth users it is auto-generated and still unique.
-- ---------------------------------------------------------------------------

alter table app_user add column if not exists provider            text;
alter table app_user add column if not exists provider_account_id text;
alter table app_user add column if not exists email               text;
alter table app_user add column if not exists avatar_url          text;

-- One account per (provider, provider_account_id). Partial: nickname-only rows
-- (provider NULL) are exempt so many of them can coexist.
create unique index if not exists app_user_provider_unique
  on app_user (provider, provider_account_id)
  where provider is not null;
