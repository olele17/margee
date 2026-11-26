-- ══════════════════════════════════════════════════════════════════
-- GESTION DE STOCK : étape 1 (structure)
--
-- · products.stock_qty est un RÉSUMÉ, écrit uniquement par les
--   fonctions de stock (security definer). Il est toujours égal à la
--   somme des mouvements (stock_moves) du produit : voir stock_check().
-- · Les produits existants passent en « stock non suivi » : rien ne
--   change pour eux tant que l'e-commerçant n'active pas le suivi.
-- · Le journal est en lecture seule pour son propriétaire ; aucune
--   écriture directe depuis l'écran, aucun accès admin.
-- ══════════════════════════════════════════════════════════════════

-- ── Produits ──────────────────────────────────────────────────────
alter table public.products
  add column track_stock     boolean not null default false,
  add column stock_qty       integer not null default 0,
  add column alert_threshold integer not null default 5 check (alert_threshold between 0 and 1000000);

-- L'écran ne peut plus écrire que les colonnes « catalogue » :
-- track_stock et stock_qty passent exclusivement par les fonctions.
revoke insert, update on public.products from authenticated, anon;
grant insert (name, category, price, cost_price, alert_threshold) on public.products to authenticated;
grant update (name, category, price, cost_price, is_archived, alert_threshold) on public.products to authenticated;

-- ── Paramètre du compte ───────────────────────────────────────────
alter table public.profiles add column allow_negative_stock boolean not null default false;
grant update (allow_negative_stock) on public.profiles to authenticated;

-- ── Journal du stock ──────────────────────────────────────────────
create table public.stock_moves (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  product_id  uuid not null,
  type        text not null check (type in ('initial', 'entree', 'vente', 'annulation_vente', 'ajustement')),
  quantity    integer not null check (quantity <> 0),          -- + entrée, − sortie
  unit_cost   bigint check (unit_cost >= 0),                   -- coût d'achat unitaire (entrées)
  reason      text check (reason in ('perte', 'casse', 'vol', 'erreur', 'cadeau', 'inventaire', 'autre')),
  supplier    text check (char_length(supplier) <= 120),
  note        text check (char_length(note) <= 300),
  sale_id     uuid references public.sales (id) on delete set null,
  moved_at    timestamptz not null default now(),             -- date choisie (ex. date du réassort)
  created_at  timestamptz not null default now(),
  constraint stock_moves_product_fk foreign key (product_id, account_id)
    references public.products (id, account_id) on delete cascade,
  constraint stock_moves_reason_required check (type <> 'ajustement' or reason is not null),
  constraint stock_moves_sign check (
    (type in ('entree', 'annulation_vente') and quantity > 0)
    or (type = 'vente' and quantity < 0)
    or type in ('initial', 'ajustement')
  )
);
create index stock_moves_account_product_idx on public.stock_moves (account_id, product_id, created_at);
create index stock_moves_sale_idx on public.stock_moves (sale_id) where sale_id is not null;

alter table public.stock_moves enable row level security;
revoke all on public.stock_moves from anon, authenticated;
grant select on public.stock_moves to authenticated;
create policy stock_moves_select_own on public.stock_moves for select to authenticated
  using (account_id = (select auth.uid()));

-- ── Vérification : stock_qty = somme des mouvements ───────────────
-- Renvoie les produits INCOHÉRENTS du compte connecté (vide = tout est juste).
create or replace function public.stock_check()
returns table (product_id uuid, product_name text, stock_qty integer, moves_total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.stock_qty, coalesce(sum(m.quantity), 0)
    from public.products p
    left join public.stock_moves m on m.product_id = p.id and m.account_id = p.account_id
   where p.account_id = (select auth.uid())
   group by p.id, p.name, p.stock_qty
  having p.stock_qty <> coalesce(sum(m.quantity), 0);
$$;
revoke all on function public.stock_check() from public, anon;
grant execute on function public.stock_check() to authenticated;

-- Même contrôle sur TOUS les comptes (éditeur SQL / service uniquement)
create or replace function private.stock_check_all()
returns table (account_id uuid, product_id uuid, stock_qty integer, moves_total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.account_id, p.id, p.stock_qty, coalesce(sum(m.quantity), 0)
    from public.products p
    left join public.stock_moves m on m.product_id = p.id and m.account_id = p.account_id
   group by p.account_id, p.id, p.stock_qty
  having p.stock_qty <> coalesce(sum(m.quantity), 0);
$$;
revoke all on function private.stock_check_all() from public, anon, authenticated;
