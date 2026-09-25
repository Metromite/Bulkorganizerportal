-- Department entry portal + pallet-size capacities.
-- Non-breaking: adds only new portal tables/columns and keeps existing operational tables intact.

create extension if not exists pgcrypto;

alter table public.bulk_organizer_plans
  add column if not exists customers jsonb not null default '[]'::jsonb,
  add column if not exists invoices jsonb not null default '[]'::jsonb,
  add column if not exists pallet_assignments jsonb not null default '{}'::jsonb,
  add column if not exists buildings jsonb not null default '[]'::jsonb,
  add column if not exists vehicle_meta jsonb not null default '{}'::jsonb,
  add column if not exists customer_schedules jsonb not null default '[]'::jsonb;

create table if not exists public.bulk_organizer_month_defaults (
  id uuid primary key default gen_random_uuid(),
  month_key date not null unique,
  buildings jsonb not null default '[]'::jsonb,
  vehicles jsonb not null default '[]'::jsonb,
  customer_schedules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bulk_organizer_month_defaults enable row level security;
drop policy if exists bulk_organizer_month_defaults_access on public.bulk_organizer_month_defaults;
create policy bulk_organizer_month_defaults_access on public.bulk_organizer_month_defaults for all to anon, authenticated using (true) with check (true);

alter table public.vehicles
  add column if not exists capacity_tons numeric default 0,
  add column if not exists pallet_capacity integer default 0,
  add column if not exists big_pallet_capacity integer default 0,
  add column if not exists small_pallet_capacity integer default 0;

create table if not exists public.department_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  division_scope text not null check (division_scope in ('Pharma','Consumer')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.department_portal_accounts enable row level security;
drop policy if exists department_portal_accounts_no_direct_access on public.department_portal_accounts;
create policy department_portal_accounts_no_direct_access on public.department_portal_accounts for select to anon, authenticated using (false);

create table if not exists public.department_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.department_portal_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.department_portal_sessions enable row level security;
drop policy if exists department_portal_sessions_no_direct_access on public.department_portal_sessions;
create policy department_portal_sessions_no_direct_access on public.department_portal_sessions for all to anon, authenticated using (false) with check (false);

create table if not exists public.department_portal_submissions (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  division text not null check (division in ('Pharma','Consumer')),
  invoice_no text not null,
  customer_name text not null,
  building_id text,
  area text,
  pallet_count integer not null check (pallet_count > 0),
  pallet_size text not null check (pallet_size in ('big','small')),
  invoice_date date,
  dispatch_date date not null,
  status text not null default 'Ready' check (status in ('Ready','Handed over to Dispatch')),
  submitted_by text not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.department_portal_submissions enable row level security;
drop policy if exists department_portal_submissions_no_direct_access on public.department_portal_submissions;
create policy department_portal_submissions_no_direct_access on public.department_portal_submissions for all to anon, authenticated using (false) with check (false);
create index if not exists ix_department_portal_submissions_dispatch_date on public.department_portal_submissions(dispatch_date, division);
create index if not exists ix_department_portal_submissions_building on public.department_portal_submissions(building_id, dispatch_date);

create or replace function public.department_portal_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare a public.department_portal_accounts; raw_token text; h text;
begin
  select * into a from public.department_portal_accounts
  where lower(username)=lower(trim(p_username)) and enabled=true limit 1;
  if not found or crypt(coalesce(p_password,''), a.password_hash) <> a.password_hash then
    raise exception 'Invalid username or password';
  end if;
  raw_token := encode(gen_random_bytes(24),'hex');
  h := encode(digest(raw_token,'sha256'),'hex');
  insert into public.department_portal_sessions(account_id,token_hash,expires_at)
  values(a.id,h,now()+interval '12 hours');
  return jsonb_build_object('token',raw_token,'username',a.username,'division',a.division_scope,'expires_at',now()+interval '12 hours');
end $$;
grant execute on function public.department_portal_login(text,text) to anon, authenticated;

create or replace function public.department_portal_submit(
  p_token text,
  p_invoice_no text,
  p_customer_name text,
  p_building_id text,
  p_area text,
  p_pallet_count integer,
  p_pallet_size text,
  p_invoice_date date,
  p_dispatch_date date,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare s public.department_portal_sessions; a public.department_portal_accounts; r public.department_portal_submissions; now_local timestamp;
begin
  select s0.* into s from public.department_portal_sessions s0
  where s0.token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex') and s0.expires_at>now() limit 1;
  if not found then raise exception 'Session expired. Please login again.'; end if;
  select * into a from public.department_portal_accounts where id=s.account_id and enabled=true;
  if not found then raise exception 'Account disabled.'; end if;
  now_local := timezone('Asia/Dubai', now());
  if now_local::time >= time '16:30' then raise exception 'Daily entry window is closed after 16:30.'; end if;
  if p_dispatch_date <= now_local::date then raise exception 'Dispatch date must be tomorrow or a later date.'; end if;
  if p_dispatch_date is null or trim(coalesce(p_invoice_no,''))='' or trim(coalesce(p_customer_name,''))='' then raise exception 'Invoice number, customer and dispatch date are required.'; end if;
  if p_pallet_count is null or p_pallet_count < 1 then raise exception 'Pallet count must be at least 1.'; end if;
  if p_pallet_size not in ('big','small') then raise exception 'Choose Big or Small pallet.'; end if;
  if p_status not in ('Ready','Handed over to Dispatch') then raise exception 'Invalid status.'; end if;
  if a.division_scope='Consumer' and a.division_scope<> 'Consumer' then raise exception 'Invalid division.'; end if;

  insert into public.department_portal_submissions(department,division,invoice_no,customer_name,building_id,area,pallet_count,pallet_size,invoice_date,dispatch_date,status,submitted_by)
  values(a.division_scope,a.division_scope,trim(p_invoice_no),trim(p_customer_name),nullif(trim(coalesce(p_building_id,'')),''),nullif(trim(coalesce(p_area,'')),''),p_pallet_count,p_pallet_size,p_invoice_date,p_dispatch_date,p_status,a.username)
  returning * into r;
  update public.department_portal_sessions set last_seen_at=now() where id=s.id;
  return to_jsonb(r);
end $$;
grant execute on function public.department_portal_submit(text,text,text,text,text,integer,text,date,date,text) to anon, authenticated;

-- Seed the requested initial logins. Medical users use the Pharma account/page.
insert into public.department_portal_accounts(username,password_hash,division_scope,enabled)
values
 ('Pharma',crypt('0000',gen_salt('bf')),'Pharma',true),
 ('Consumer',crypt('0000',gen_salt('bf')),'Consumer',true)
on conflict (username) do update set division_scope=excluded.division_scope, enabled=true, updated_at=now();

notify pgrst,'reload schema';
