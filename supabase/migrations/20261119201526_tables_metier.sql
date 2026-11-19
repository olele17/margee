-- ══════════════════════════════════════════════════════════════════
-- 0003 · Tables métier de l'e-commerçant
-- Chaque ligne appartient à un compte (account_id). Par défaut,
-- account_id = auth.uid() : le frontend n'a pas à l'envoyer.
-- Les références vers un produit ou un coffre utilisent une clé
-- composée (id, account_id) : la base refuse qu'une vente pointe vers
-- le produit d'un AUTRE compte, en plus de la RLS.
-- Rien de calculé n'est stocké (CA, bénéfice, soldes, progression).
-- RLS activée dès la création, sans règle = tout est fermé.
-- ══════════════════════════════════════════════════════════════════

-- ── PRODUITS ─────────────────────────────────────────────────────
-- Un produit déjà vendu n'est jamais supprimé : il est archivé.
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  category     text check (char_length(category) <= 60),
  price        bigint not null check (price > 0),        -- prix de vente (F CFA)
  cost_price   bigint not null check (cost_price >= 0),  -- coût de revient (F CFA)
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint products_id_account_key unique (id, account_id)
);
create index products_account_created_idx on public.products (account_id, created_at);

-- ── VENTES ───────────────────────────────────────────────────────
-- Nom, prix et coût du produit sont COPIÉS au moment de la vente :
-- changer le prix d'un produit ne modifie pas les anciens bénéfices.
create table public.sales (
  id                       uuid primary key default gen_random_uuid(),
  account_id               uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  product_id               uuid not null,
  product_name             text not null check (char_length(product_name) between 1 and 120),
  unit_price               bigint not null check (unit_price > 0),
  unit_cost                bigint not null check (unit_cost >= 0),
  qty                      integer not null check (qty > 0),
  client_name              text check (char_length(client_name) <= 120),
  client_phone             text check (char_length(client_phone) <= 40),
  client_address           text check (char_length(client_address) <= 200),
  delivery_cost            bigint not null default 0 check (delivery_cost >= 0),
  delivery_paid_by_client  boolean not null default false,
  receipt_number           text not null check (receipt_number ~ '^ES-[0-9]{4}-[0-9]{4,}$'),
  sold_at                  timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- "no action" (vérifié en fin d'instruction) : un produit vendu ne peut
  -- pas être supprimé, mais la suppression complète d'un compte reste possible.
  constraint sales_product_fk foreign key (product_id, account_id)
    references public.products (id, account_id) on delete no action,
  constraint sales_receipt_unique unique (account_id, receipt_number)
);
create index sales_account_sold_at_idx on public.sales (account_id, sold_at);
create index sales_account_product_idx on public.sales (account_id, product_id);

-- ── PUBS DÉPENSÉES ───────────────────────────────────────────────
create table public.ads (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  platform    text not null default 'Meta' check (platform in ('Meta', 'TikTok', 'Google', 'WhatsApp', 'Autre')),
  amount      bigint not null check (amount > 0),
  spent_at    timestamptz not null default now(),
  note        text check (char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ads_account_spent_at_idx on public.ads (account_id, spent_at);

-- ── DÉPENSES (actif / passif) ────────────────────────────────────
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  description  text not null check (char_length(btrim(description)) between 1 and 200),
  type         text not null default 'passif' check (type in ('actif', 'passif')),
  amount       bigint not null check (amount > 0),
  spent_at     timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index expenses_account_spent_at_idx on public.expenses (account_id, spent_at);

-- ── INVESTISSEMENTS ──────────────────────────────────────────────
create table public.investments (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  description  text not null check (char_length(btrim(description)) between 1 and 200),
  amount       bigint not null check (amount > 0),
  invested_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index investments_account_invested_at_idx on public.investments (account_id, invested_at);

-- ── NOTES (carnet privé) ─────────────────────────────────────────
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  content     text not null default '' check (char_length(content) <= 5000),
  category    text not null default 'autre' check (category in ('idee', 'fournisseur', 'client', 'afaire', 'autre')),
  product_id  uuid,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notes_product_fk foreign key (product_id, account_id)
    references public.products (id, account_id) on delete set null (product_id)
);
create index notes_account_updated_idx on public.notes (account_id, pinned desc, updated_at desc);

-- ── CHALLENGES (objectifs) ───────────────────────────────────────
-- Périodes en jours entiers (date), comme dans calc.js.
-- Progression et statut ne sont JAMAIS stockés : calculés dans calc.js.
create table public.challenges (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  type        text not null check (type in ('ca', 'profit', 'sales_count', 'product_units', 'ad_budget')),
  target      bigint not null check (target > 0),
  product_id  uuid,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint challenges_dates_check check (end_date > start_date),
  constraint challenges_product_required check (type <> 'product_units' or product_id is not null),
  constraint challenges_product_fk foreign key (product_id, account_id)
    references public.products (id, account_id) on delete no action
);
create index challenges_account_dates_idx on public.challenges (account_id, end_date);

-- ── COMPTEUR DE REÇUS (par compte et par année) ──────────────────
-- Utilisé uniquement par la fonction record_sale (verrou de ligne).
create table public.receipt_counters (
  account_id   uuid not null references public.profiles (id) on delete cascade,
  year         smallint not null check (year between 2000 and 2999),
  last_number  integer not null default 0 check (last_number >= 0),
  primary key (account_id, year)
);

-- ── ÉPARGNE : COFFRES ────────────────────────────────────────────
-- Le solde d'un coffre n'est pas stocké : il est calculé à partir des
-- mouvements (dans src/utils/calc.js).
create table public.savings_pots (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 60),
  target_amount  bigint check (target_amount > 0),     -- objectif facultatif
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint savings_pots_id_account_key unique (id, account_id)
);
create index savings_pots_account_idx on public.savings_pots (account_id, created_at);

-- ── ÉPARGNE : MOUVEMENTS ─────────────────────────────────────────
-- source = 'rule' quand le versement vient de la règle des X % du bénéfice.
create table public.savings_moves (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  pot_id      uuid not null,
  kind        text not null check (kind in ('deposit', 'withdrawal')),
  amount      bigint not null check (amount > 0),
  source      text not null default 'manual' check (source in ('manual', 'rule')),
  note        text check (char_length(note) <= 200),
  moved_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint savings_moves_pot_fk foreign key (pot_id, account_id)
    references public.savings_pots (id, account_id) on delete cascade
);
create index savings_moves_account_moved_at_idx on public.savings_moves (account_id, moved_at);
create index savings_moves_pot_idx on public.savings_moves (pot_id);

-- ── updated_at automatique ───────────────────────────────────────
create trigger products_set_updated_at      before update on public.products      for each row execute function public.set_updated_at();
create trigger sales_set_updated_at         before update on public.sales         for each row execute function public.set_updated_at();
create trigger ads_set_updated_at           before update on public.ads           for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at      before update on public.expenses      for each row execute function public.set_updated_at();
create trigger investments_set_updated_at   before update on public.investments   for each row execute function public.set_updated_at();
create trigger notes_set_updated_at         before update on public.notes         for each row execute function public.set_updated_at();
create trigger challenges_set_updated_at    before update on public.challenges    for each row execute function public.set_updated_at();
create trigger savings_pots_set_updated_at  before update on public.savings_pots  for each row execute function public.set_updated_at();
create trigger savings_moves_set_updated_at before update on public.savings_moves for each row execute function public.set_updated_at();

-- ── RLS activée partout (fermé par défaut) ───────────────────────
alter table public.products         enable row level security;
alter table public.sales            enable row level security;
alter table public.ads              enable row level security;
alter table public.expenses         enable row level security;
alter table public.investments      enable row level security;
alter table public.notes            enable row level security;
alter table public.challenges       enable row level security;
alter table public.receipt_counters enable row level security;
alter table public.savings_pots     enable row level security;
alter table public.savings_moves    enable row level security;
