-- ══════════════════════════════════════════════════════════════════
-- SCHÉMA EASY SWAP — à exécuter dans l'éditeur SQL du dashboard Supabase
-- (Project → SQL Editor → New query → coller ce fichier → Run)
-- ══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── PROFILS (1 ligne par compte, liée à auth.users) ──────────────
create table if not exists public.profiles (
  id                        uuid primary key references auth.users(id) on delete cascade,
  owner_name                text,
  business_name             text,
  phone                     text,
  email                     text,
  subscription_status       text default 'pending', -- pending | active | expired
  subscription_plan         text,
  subscription_expires_at   timestamptz,
  receipt_logo              text,
  receipt_address           text,
  receipt_city              text,
  receipt_note              text,
  receipt_signature_type    text default 'draw',     -- draw | upload
  receipt_signature_image   text,
  created_at                timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ── PRODUITS ───────────────────────────────────────────────────
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  category    text,
  cost_price  numeric not null default 0,
  price       numeric not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.products enable row level security;
create policy "own products" on public.products
  for all using (auth.uid() = account_id) with check (auth.uid() = account_id);

-- ── VENTES ─────────────────────────────────────────────────────
create table if not exists public.sales (
  id                       uuid primary key default gen_random_uuid(),
  account_id               uuid not null references public.profiles(id) on delete cascade,
  date                     date not null,
  product_id               uuid,
  product_name             text,
  qty                      numeric not null default 1,
  cost_price               numeric not null default 0,
  price                    numeric not null default 0,
  client_name              text,
  client_phone             text,
  client_address           text,
  delivery_cost            numeric default 0,
  delivery_paid_by_client  boolean default false,
  receipt_number           text,
  created_at               timestamptz not null default now()
);

alter table public.sales enable row level security;
create policy "own sales" on public.sales
  for all using (auth.uid() = account_id) with check (auth.uid() = account_id);

create index if not exists sales_account_date_idx on public.sales(account_id, date);

-- ── PUBS DÉPENSÉES ─────────────────────────────────────────────
create table if not exists public.ads (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.profiles(id) on delete cascade,
  date        date not null,
  platform    text,
  amount      numeric not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.ads enable row level security;
create policy "own ads" on public.ads
  for all using (auth.uid() = account_id) with check (auth.uid() = account_id);

create index if not exists ads_account_date_idx on public.ads(account_id, date);

-- ── INVESTISSEMENTS ────────────────────────────────────────────
create table if not exists public.investments (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.profiles(id) on delete cascade,
  date         date not null,
  description  text,
  amount       numeric not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.investments enable row level security;
create policy "own investments" on public.investments
  for all using (auth.uid() = account_id) with check (auth.uid() = account_id);

create index if not exists investments_account_date_idx on public.investments(account_id, date);

-- ── DÉPENSES (actif / passif) ──────────────────────────────────
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.profiles(id) on delete cascade,
  date         date not null,
  description  text,
  amount       numeric not null default 0,
  type         text not null default 'passif' check (type in ('actif', 'passif')),
  created_at   timestamptz not null default now()
);

alter table public.expenses enable row level security;
create policy "own expenses" on public.expenses
  for all using (auth.uid() = account_id) with check (auth.uid() = account_id);

create index if not exists expenses_account_date_idx on public.expenses(account_id, date);

-- ── COMPTEUR DE REÇUS (accès uniquement via la fonction ci-dessous) ─
create table if not exists public.receipt_counters (
  account_id  uuid not null references public.profiles(id) on delete cascade,
  year        int not null,
  seq         int not null default 0,
  primary key (account_id, year)
);

alter table public.receipt_counters enable row level security;
-- Aucune policy : la table n'est accessible que via next_receipt_number() (security definer).

-- ── FONCTION : création automatique du profil à l'inscription ────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, owner_name, business_name, phone, email, subscription_status)
  values (
    new.id,
    new.raw_user_meta_data->>'owner_name',
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'phone',
    new.email,
    'pending'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── FONCTION : numéro de reçu atomique (ES-AAAA-NNNN) ─────────────
create or replace function public.next_receipt_number(p_account_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_seq  int;
begin
  insert into public.receipt_counters (account_id, year, seq)
  values (p_account_id, v_year, 1)
  on conflict (account_id, year)
  do update set seq = receipt_counters.seq + 1
  returning seq into v_seq;

  return 'ES-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

grant execute on function public.next_receipt_number(uuid) to authenticated;
