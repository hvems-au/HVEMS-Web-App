-- ---------------------------------------------------------------------------
-- LOCAL TEST HARNESS ONLY — never applied to a real Supabase project.
--
-- Recreates the parts of a Supabase Postgres instance our migrations depend on
-- (API roles, the auth schema, auth.uid()/auth.jwt(), default privileges), so
-- migrations and RLS can be tested on a plain Postgres 16 server when the
-- Supabase CLI / Docker stack is unavailable. Behaviour mirrors Supabase:
-- auth.uid() and auth.jwt() read the request.jwt.claims GUC set by PostgREST.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgtap with schema extensions;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Supabase grants table/function/sequence privileges on public to the API roles
-- by default; RLS and explicit revokes are what actually restrict access.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
