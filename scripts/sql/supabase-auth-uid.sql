-- The throwaway Supabase Postgres image ships an older auth.uid() that reads
-- only request.jwt.claim.sub. On a real project, the Auth service's migrations
-- install this version, which also reads request.jwt.claims (what PostgREST
-- sends today). No Auth service runs in the verify containers, so the scripts
-- install it themselves. Run as the image's superuser.
create or replace function auth.uid() returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
