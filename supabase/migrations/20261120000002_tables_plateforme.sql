-- ══════════════════════════════════════════════════════════════════
-- 0002 · Tables de la plateforme : comptes, plans, abonnements,
--        paiements, administration, paramètres
-- La RLS est activée sur chaque table dès sa création, sans règle :
-- tout accès est refusé tant que les règles (migration RLS) ne sont pas
-- appliquées.
-- ══════════════════════════════════════════════════════════════════

-- ── PROFILS (1 ligne par compte, liée à auth.users) ──────────────
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  business_name           text not null check (char_length(btrim(business_name)) between 1 and 120),
  owner_name              text check (char_length(owner_name) <= 120),
  phone                   text check (char_length(phone) <= 40),
  email                   text not null check (char_length(email) <= 254),
  -- Règle d'épargne : part du bénéfice à mettre de côté (en %)
  savings_rule_percent    smallint not null default 10 check (savings_rule_percent between 0 and 100),
  -- Réglages des reçus (logo et signature : image en data URL, 1 Mo max)
  receipt_logo            text check (char_length(receipt_logo) <= 1500000),
  receipt_address         text check (char_length(receipt_address) <= 200),
  receipt_city            text check (char_length(receipt_city) <= 80),
  receipt_note            text check (char_length(receipt_note) <= 500),
  receipt_email           text check (char_length(receipt_email) <= 254),
  receipt_signature_type  text not null default 'draw' check (receipt_signature_type in ('draw', 'upload')),
  receipt_signature       text check (char_length(receipt_signature) <= 1500000),
  last_login_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
comment on table public.profiles is 'Un profil par e-commerçant (id = auth.users.id).';

-- ── PLANS ────────────────────────────────────────────────────────
-- Valeurs identiques à PLANS dans src/services/api.js (source affichée).
create table public.plans (
  id             text primary key check (id in ('free', 'pro', 'elite')),
  name           text not null,
  price          bigint not null check (price >= 0),          -- F CFA par mois
  old_price      bigint check (old_price > price),            -- prix barré éventuel
  duration_days  integer check (duration_days > 0),           -- null = sans durée (Free)
  receipt_limit  integer check (receipt_limit > 0),           -- null = illimité
  highlight      boolean not null default false,              -- plan mis en avant
  features       jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  is_active      boolean not null default true,
  sort_order     smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── ABONNEMENTS (1 par compte) ───────────────────────────────────
-- pending   : compte créé, aucun plan choisi
-- trial     : réservé à un futur essai limité dans le temps
-- active    : plan en cours (Free sans date de fin)
-- expired   : période payée dépassée
-- suspended : bloqué par un administrateur
create table public.subscriptions (
  account_id     uuid primary key references public.profiles (id) on delete cascade,
  plan_id        text references public.plans (id),
  status         text not null default 'pending'
                   check (status in ('pending', 'trial', 'active', 'expired', 'suspended')),
  billing        text check (billing in ('monthly', 'yearly')),
  trial_ends_at  timestamptz,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint subscriptions_plan_required check (status not in ('active', 'trial') or plan_id is not null)
);
create index subscriptions_status_idx on public.subscriptions (status, expires_at);

-- ── PAIEMENTS ────────────────────────────────────────────────────
-- account_id passe à null si le compte est supprimé : l'historique
-- comptable des paiements est conservé.
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references public.profiles (id) on delete set null,
  plan_id       text not null references public.plans (id),
  billing       text not null check (billing in ('monthly', 'yearly')),
  amount        bigint not null check (amount > 0),
  currency      text not null default 'XOF',
  provider      text not null default 'bictorys' check (provider in ('bictorys')),
  provider_ref  text not null unique,                      -- empêche les doublons de webhook
  status        text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index payments_account_created_idx on public.payments (account_id, created_at desc);
create index payments_status_created_idx on public.payments (status, created_at desc);

-- ── PARAMÈTRES DE LA PLATEFORME ──────────────────────────────────
create table public.platform_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,60}$'),
  value       jsonb not null,
  is_public   boolean not null default false,   -- lisible sans connexion (landing, inscription)
  updated_at  timestamptz not null default now()
);

-- ── ADMINISTRATEURS ──────────────────────────────────────────────
create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('super_admin', 'support')),
  created_at  timestamptz not null default now()
);

-- ── NOTES INTERNES DES ADMINS (sur un compte e-commerçant) ───────
create table public.admin_notes (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.profiles (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  content     text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index admin_notes_account_idx on public.admin_notes (account_id, created_at desc);

-- ── SIGNALEMENTS (usage anormal) ─────────────────────────────────
create table public.account_flags (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id) on delete set null
);
create index account_flags_open_idx on public.account_flags (account_id) where resolved_at is null;

-- ── updated_at automatique ───────────────────────────────────────
create trigger profiles_set_updated_at          before update on public.profiles          for each row execute function public.set_updated_at();
create trigger plans_set_updated_at             before update on public.plans             for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at     before update on public.subscriptions     for each row execute function public.set_updated_at();
create trigger payments_set_updated_at          before update on public.payments          for each row execute function public.set_updated_at();
create trigger platform_settings_set_updated_at before update on public.platform_settings for each row execute function public.set_updated_at();

-- ── RLS activée partout (fermé par défaut) ───────────────────────
alter table public.profiles          enable row level security;
alter table public.plans             enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.payments          enable row level security;
alter table public.platform_settings enable row level security;
alter table public.admins            enable row level security;
alter table public.admin_notes       enable row level security;
alter table public.account_flags     enable row level security;
