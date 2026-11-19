-- ══════════════════════════════════════════════════════════════════
-- 0008 · Fonctions SQL (RPC) : ventes et statistiques admin
--
-- • record_sale : enregistre une vente en UNE transaction (copie du prix
--   et du coût, numéro de reçu, quota du plan). Seul moyen de créer une
--   vente (pas d'INSERT direct, cf. RLS).
-- • admin_dashboard_stats / admin_merchant_overview : réservées aux
--   admins, uniquement des totaux (jamais le détail des notes/épargne).
-- Fuseau horaire de référence : Africa/Dakar.
-- ══════════════════════════════════════════════════════════════════

-- ── Compteur de reçus émis par mois (quota des plans) ────────────
-- Ne baisse pas quand une vente est supprimée : supprimer une vente ne
-- « rend » pas un reçu déjà émis.
create table public.receipt_usage (
  account_id  uuid not null references public.profiles (id) on delete cascade,
  period      date not null check (extract(day from period) = 1),   -- 1er jour du mois
  issued      integer not null default 0 check (issued >= 0),
  primary key (account_id, period)
);
alter table public.receipt_usage enable row level security;
create policy receipt_usage_select_own on public.receipt_usage for select to authenticated
  using (account_id = (select auth.uid()));
revoke insert, update, delete on public.receipt_usage from anon, authenticated;

-- ── record_sale ──────────────────────────────────────────────────
-- Format du reçu conservé : ES-AAAA-NNNN, numérotation par compte et par
-- année d'émission (heure de Dakar). Deux ventes simultanées ne peuvent
-- pas recevoir le même numéro : l'incrément du compteur verrouille la
-- ligne (account_id, année) jusqu'à la fin de la transaction.
create or replace function public.record_sale(
  p_product_id              uuid,
  p_qty                     integer,
  p_client_name             text default null,
  p_client_phone            text default null,
  p_client_address          text default null,
  p_delivery_cost           bigint default 0,
  p_delivery_paid_by_client boolean default false,
  p_sold_on                 date default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_now_dkr   timestamp := now() at time zone 'Africa/Dakar';
  v_year      smallint := extract(year from v_now_dkr)::smallint;
  v_period    date := date_trunc('month', v_now_dkr)::date;
  v_product   public.products%rowtype;
  v_plan      public.plans%rowtype;
  v_used      integer;
  v_number    integer;
  v_receipt   text;
  v_sale      public.sales%rowtype;
begin
  if v_uid is null then
    raise exception 'Connecte-toi pour enregistrer une vente.' using errcode = '42501';
  end if;
  if not private.has_active_subscription() then
    raise exception 'Ton abonnement n''est pas actif : choisis un plan pour enregistrer des ventes.' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'La quantité doit être supérieure à 0.' using errcode = '22023';
  end if;
  if coalesce(p_delivery_cost, 0) < 0 then
    raise exception 'Les frais de livraison ne peuvent pas être négatifs.' using errcode = '22023';
  end if;

  -- Produit du compte uniquement (et non archivé)
  select * into v_product from public.products
   where id = p_product_id and account_id = v_uid and not is_archived;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'P0002';
  end if;

  -- Quota de reçus du plan : Free = total à vie, plans payants = par mois
  select p.* into v_plan
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.account_id = v_uid;
  if v_plan.receipt_limit is not null then
    if v_plan.duration_days is null then
      select coalesce(sum(issued), 0) into v_used from public.receipt_usage where account_id = v_uid;
    else
      select coalesce(issued, 0) into v_used from public.receipt_usage where account_id = v_uid and period = v_period;
      v_used := coalesce(v_used, 0);
    end if;
    if v_used >= v_plan.receipt_limit then
      raise exception 'Tu as atteint la limite de % reçus de ton plan %. Passe au plan supérieur pour continuer.',
        v_plan.receipt_limit, v_plan.name using errcode = 'P0001';
    end if;
  end if;

  -- Numéro de reçu : incrément atomique (verrou de ligne)
  insert into public.receipt_counters (account_id, year, last_number)
  values (v_uid, v_year, 1)
  on conflict (account_id, year)
  do update set last_number = public.receipt_counters.last_number + 1
  returning last_number into v_number;

  v_receipt := 'ES-' || v_year || '-' || case when v_number < 10000 then lpad(v_number::text, 4, '0') else v_number::text end;

  insert into public.receipt_usage (account_id, period, issued)
  values (v_uid, v_period, 1)
  on conflict (account_id, period) do update set issued = public.receipt_usage.issued + 1;

  -- Vente : nom, prix et coût COPIÉS depuis le produit
  insert into public.sales (
    account_id, product_id, product_name, unit_price, unit_cost, qty,
    client_name, client_phone, client_address, delivery_cost, delivery_paid_by_client,
    receipt_number, sold_at
  ) values (
    v_uid, v_product.id, v_product.name, v_product.price, v_product.cost_price, p_qty,
    nullif(btrim(p_client_name), ''), nullif(btrim(p_client_phone), ''), nullif(btrim(p_client_address), ''),
    coalesce(p_delivery_cost, 0), coalesce(p_delivery_paid_by_client, false),
    v_receipt,
    -- La vente est datée du jour choisi, à midi heure de Dakar
    ((coalesce(p_sold_on, v_now_dkr::date) + time '12:00') at time zone 'Africa/Dakar')
  )
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke all on function public.record_sale(uuid, integer, text, text, text, bigint, boolean, date) from public, anon;
grant execute on function public.record_sale(uuid, integer, text, text, text, bigint, boolean, date) to authenticated;

-- ── admin_dashboard_stats ────────────────────────────────────────
-- Comptes par statut, MRR, revenu du mois et du mois précédent,
-- répartition par plan, inscriptions par jour (30 jours), conversion
-- vers un plan payant. Les comptes admins sont exclus des chiffres.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now_dkr  timestamp := now() at time zone 'Africa/Dakar';
  v_month    timestamptz := (date_trunc('month', v_now_dkr)) at time zone 'Africa/Dakar';
  v_prev     timestamptz := (date_trunc('month', v_now_dkr) - interval '1 month') at time zone 'Africa/Dakar';
  v_result   jsonb;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;

  with merchants as (
    select p.id, p.created_at, s.status, s.plan_id, s.billing, s.expires_at
      from public.profiles p
      left join public.subscriptions s on s.account_id = p.id
     where not exists (select 1 from public.admins a where a.user_id = p.id)
  ),
  effective as (
    select m.*,
      case
        when m.status = 'active' and m.expires_at is not null and m.expires_at <= now() then 'expired'
        else coalesce(m.status, 'pending')
      end as eff_status
      from merchants m
  ),
  paid_ok as (
    select distinct account_id from public.payments where status = 'success' and account_id is not null
  )
  select jsonb_build_object(
    'accounts_total', (select count(*) from effective),
    'accounts_by_status', (
      select coalesce(jsonb_object_agg(eff_status, n), '{}'::jsonb)
        from (select eff_status, count(*) as n from effective group by eff_status) x
    ),
    'paying_active', (select count(*) from effective where eff_status = 'active' and plan_id in ('pro', 'elite')),
    'free_active',   (select count(*) from effective where eff_status = 'active' and plan_id = 'free'),
    'mrr', (
      select coalesce(sum(case when e.billing = 'yearly' then round(pl.price * 10 / 12.0) else pl.price end), 0)::bigint
        from effective e join public.plans pl on pl.id = e.plan_id
       where e.eff_status = 'active' and pl.price > 0
    ),
    'revenue_this_month', (
      select coalesce(sum(amount), 0) from public.payments
       where status = 'success' and created_at >= v_month
    ),
    'revenue_last_month', (
      select coalesce(sum(amount), 0) from public.payments
       where status = 'success' and created_at >= v_prev and created_at < v_month
    ),
    'by_plan', (
      select coalesce(jsonb_object_agg(plan_id, n), '{}'::jsonb)
        from (select plan_id, count(*) as n from effective where eff_status = 'active' and plan_id is not null group by plan_id) x
    ),
    'signups_last_30_days', (
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(c.n, 0)) order by d)
        from generate_series((v_now_dkr::date - 29), v_now_dkr::date, interval '1 day') d
        left join (
          select (created_at at time zone 'Africa/Dakar')::date as day, count(*) as n
            from effective group by 1
        ) c on c.day = d::date
    ),
    'conversion', (
      select jsonb_build_object(
        'accounts', count(*),
        'converted', count(*) filter (where e.id in (select account_id from paid_ok)),
        'rate_percent', case when count(*) = 0 then 0
          else round(100.0 * count(*) filter (where e.id in (select account_id from paid_ok)) / count(*), 1) end
      ) from effective e
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ── admin_merchant_overview ──────────────────────────────────────
-- Uniquement des totaux, en lecture seule. Aucune donnée des notes ni
-- de l'épargne, aucun détail client.
create or replace function public.admin_merchant_overview(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'account_id', p_account_id,
    'revenue_total', (select coalesce(sum(unit_price * qty), 0) from public.sales where account_id = p_account_id),
    'sales_count', (select count(*) from public.sales where account_id = p_account_id),
    'products_count', (select count(*) from public.products where account_id = p_account_id and not is_archived),
    'last_sale_at', (select max(sold_at) from public.sales where account_id = p_account_id)
  );
end;
$$;

revoke all on function public.admin_merchant_overview(uuid) from public, anon;
grant execute on function public.admin_merchant_overview(uuid) to authenticated;
