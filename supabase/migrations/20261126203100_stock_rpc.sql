-- ══════════════════════════════════════════════════════════════════
-- GESTION DE STOCK : étape 2 (fonctions)
--
-- Toute modification du stock passe par ces fonctions : une seule
-- transaction, verrou sur la ligne du produit (select … for update),
-- mouvement dans stock_moves + mise à jour de products.stock_qty.
-- Réservé aux plans Pro et Elite (sauf la vente et sa suppression,
-- qui gardent le stock juste quel que soit le plan).
-- Un réassort n'est PAS une dépense : le coût du produit est déjà
-- déduit à chaque vente via le coût de revient.
-- ══════════════════════════════════════════════════════════════════

-- ── Outils communs ────────────────────────────────────────────────
create or replace function private.stock_require_paid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Connecte-toi pour gérer ton stock.' using errcode = '42501';
  end if;
  if not private.has_paid_plan() then
    raise exception 'La gestion de stock est réservée aux plans Pro et Elite.' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function private.stock_require_paid() from public, anon;
grant execute on function private.stock_require_paid() to authenticated;

-- Produit du compte, verrouillé jusqu'à la fin de la transaction
create or replace function private.stock_lock_product(p_product_id uuid, p_uid uuid)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare v public.products%rowtype;
begin
  select * into v from public.products
   where id = p_product_id and account_id = p_uid and not is_archived
   for update;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function private.stock_lock_product(uuid, uuid) from public, anon;
grant execute on function private.stock_lock_product(uuid, uuid) to authenticated;

create or replace function private.stock_product_json(p public.products)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'track_stock', p.track_stock,
    'stock_qty', p.stock_qty, 'alert_threshold', p.alert_threshold, 'cost_price', p.cost_price, 'price', p.price);
$$;
revoke all on function private.stock_product_json(public.products) from public, anon;
grant execute on function private.stock_product_json(public.products) to authenticated;

-- ── Activer le suivi (stock initial) ──────────────────────────────
-- Le mouvement « initial » vaut (quantité − stock actuel) : la somme des
-- mouvements reste égale au stock, même si on réactive le suivi.
create or replace function public.set_initial_stock(p_product_id uuid, p_quantity integer, p_unit_cost bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.stock_require_paid();
  v_p   public.products%rowtype;
  v_delta integer;
begin
  if p_quantity is null or p_quantity < 0 or p_quantity > 10000000 then
    raise exception 'Le stock initial doit être un nombre entier positif ou nul.' using errcode = '22023';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Le coût unitaire ne peut pas être négatif.' using errcode = '22023';
  end if;
  v_p := private.stock_lock_product(p_product_id, v_uid);
  if v_p.track_stock then
    raise exception 'Le suivi est déjà actif sur ce produit : utilise « Ajuster » pour corriger le stock.' using errcode = 'P0001';
  end if;

  v_delta := p_quantity - v_p.stock_qty;
  if v_delta <> 0 then
    insert into public.stock_moves (account_id, product_id, type, quantity, unit_cost)
    values (v_uid, v_p.id, 'initial', v_delta, coalesce(p_unit_cost, v_p.cost_price));
  end if;
  update public.products
     set track_stock = true, stock_qty = p_quantity,
         cost_price = coalesce(p_unit_cost, cost_price)
   where id = v_p.id
  returning * into v_p;
  return private.stock_product_json(v_p);
end;
$$;
revoke all on function public.set_initial_stock(uuid, integer, bigint) from public, anon;
grant execute on function public.set_initial_stock(uuid, integer, bigint) to authenticated;

-- ── Arrêter le suivi (le stock et l'historique sont gardés) ───────
create or replace function public.disable_stock_tracking(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_p   public.products%rowtype;
begin
  if v_uid is null then
    raise exception 'Connecte-toi pour gérer ton stock.' using errcode = '42501';
  end if;
  v_p := private.stock_lock_product(p_product_id, v_uid);
  update public.products set track_stock = false where id = v_p.id returning * into v_p;
  return private.stock_product_json(v_p);
end;
$$;
revoke all on function public.disable_stock_tracking(uuid) from public, anon;
grant execute on function public.disable_stock_tracking(uuid) to authenticated;

-- ── Entrée de stock (réassort) ────────────────────────────────────
-- Coût moyen pondéré = (stock × coût actuel + reçu × nouveau coût) ÷ (stock + reçu)
-- (un stock négatif compte pour 0). Le coût de revient n'est modifié que
-- si p_update_cost = true.
create or replace function public.add_stock_entry(
  p_product_id uuid, p_quantity integer, p_unit_cost bigint,
  p_supplier text default null, p_note text default null, p_date date default null,
  p_update_cost boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.stock_require_paid();
  v_p    public.products%rowtype;
  v_base integer;
  v_avg  bigint;
  v_prev bigint;
  v_today date := (now() at time zone 'Africa/Dakar')::date;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 10000000 then
    raise exception 'La quantité reçue doit être supérieure à 0.' using errcode = '22023';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'Indique le coût d''achat unitaire (0 ou plus).' using errcode = '22023';
  end if;
  if p_date is not null and p_date > v_today then
    raise exception 'La date de l''entrée ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  v_p := private.stock_lock_product(p_product_id, v_uid);
  if not v_p.track_stock then
    raise exception 'Active d''abord le suivi de stock sur ce produit.' using errcode = 'P0001';
  end if;

  v_prev := v_p.cost_price;
  v_base := greatest(v_p.stock_qty, 0);
  v_avg  := round((v_base::numeric * v_p.cost_price + p_quantity::numeric * p_unit_cost) / (v_base + p_quantity));

  insert into public.stock_moves (account_id, product_id, type, quantity, unit_cost, supplier, note, moved_at)
  values (v_uid, v_p.id, 'entree', p_quantity, p_unit_cost,
          left(nullif(btrim(p_supplier), ''), 120), left(nullif(btrim(p_note), ''), 300),
          case when p_date is null or p_date = v_today then now()
               else (p_date + time '12:00') at time zone 'Africa/Dakar' end);

  update public.products
     set stock_qty = stock_qty + p_quantity,
         cost_price = case when coalesce(p_update_cost, false) then v_avg else cost_price end
   where id = v_p.id
  returning * into v_p;

  return private.stock_product_json(v_p) || jsonb_build_object(
    'previous_cost', v_prev, 'weighted_cost', v_avg,
    'cost_differs', p_unit_cost <> v_prev, 'cost_updated', coalesce(p_update_cost, false));
end;
$$;
revoke all on function public.add_stock_entry(uuid, integer, bigint, text, text, date, boolean) from public, anon;
grant execute on function public.add_stock_entry(uuid, integer, bigint, text, text, date, boolean) to authenticated;

-- ── Inventaire (ajustement) ───────────────────────────────────────
create or replace function public.adjust_stock(p_product_id uuid, p_real_quantity integer, p_reason text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.stock_require_paid();
  v_p     public.products%rowtype;
  v_delta integer;
begin
  if p_real_quantity is null or p_real_quantity < 0 or p_real_quantity > 10000000 then
    raise exception 'La quantité comptée doit être un nombre entier positif ou nul.' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('perte', 'casse', 'vol', 'erreur', 'cadeau', 'inventaire', 'autre') then
    raise exception 'Choisis le motif de l''ajustement.' using errcode = '22023';
  end if;
  v_p := private.stock_lock_product(p_product_id, v_uid);
  if not v_p.track_stock then
    raise exception 'Active d''abord le suivi de stock sur ce produit.' using errcode = 'P0001';
  end if;

  v_delta := p_real_quantity - v_p.stock_qty;
  if v_delta <> 0 then
    insert into public.stock_moves (account_id, product_id, type, quantity, reason, note)
    values (v_uid, v_p.id, 'ajustement', v_delta, p_reason, left(nullif(btrim(p_note), ''), 300));
    update public.products set stock_qty = p_real_quantity where id = v_p.id returning * into v_p;
  end if;
  return private.stock_product_json(v_p) || jsonb_build_object('delta', v_delta);
end;
$$;
revoke all on function public.adjust_stock(uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated;

-- ── Vente : même signature et même comportement, + stock ─────────
create or replace function public.record_sale(p_product_id uuid, p_qty integer, p_client_name text default null::text, p_client_phone text default null::text, p_client_address text default null::text, p_delivery_cost bigint default 0, p_delivery_paid_by_client boolean default false, p_sold_on date default null::date)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_negative  boolean;
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

  -- Produit du compte uniquement (et non archivé), VERROUILLÉ : deux
  -- ventes simultanées du même produit passent l'une après l'autre.
  select * into v_product from public.products
   where id = p_product_id and account_id = v_uid and not is_archived
   for update;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'P0002';
  end if;

  -- Stock suivi : quantité disponible (sauf si le stock négatif est autorisé)
  if v_product.track_stock and v_product.stock_qty < p_qty then
    select allow_negative_stock into v_negative from public.profiles where id = v_uid;
    if not coalesce(v_negative, false) then
      raise exception 'Stock insuffisant : il reste % unité(s) de %', greatest(v_product.stock_qty, 0), v_product.name
        using errcode = 'P0001';
    end if;
  end if;

  -- Quota du plan : Free = essais à vie (reçus + factures + devis),
  -- plans payants = reçus par mois
  select p.* into v_plan
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.account_id = v_uid;
  if v_plan.receipt_limit is not null then
    if v_plan.duration_days is null then
      v_used := private.free_trial_used(v_uid);
      if v_used >= v_plan.receipt_limit then
        raise exception 'Tu as utilisé tes % essais gratuits (reçus, factures ou devis). Passe au plan supérieur pour continuer.',
          v_plan.receipt_limit using errcode = 'P0001';
      end if;
    else
      select coalesce(issued, 0) into v_used from public.receipt_usage where account_id = v_uid and period = v_period;
      v_used := coalesce(v_used, 0);
      if v_used >= v_plan.receipt_limit then
        raise exception 'Tu as atteint la limite de % reçus de ton plan %. Passe au plan supérieur pour continuer.',
          v_plan.receipt_limit, v_plan.name using errcode = 'P0001';
      end if;
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

  -- Sortie de stock, dans la même transaction que la vente
  if v_product.track_stock then
    insert into public.stock_moves (account_id, product_id, type, quantity, unit_cost, sale_id, moved_at)
    values (v_uid, v_product.id, 'vente', -p_qty, v_product.cost_price, v_sale.id, v_sale.sold_at);
    update public.products set stock_qty = stock_qty - p_qty where id = v_product.id;
  end if;

  return v_sale;
end;
$function$;

-- ── Suppression d'une vente : remet le stock ──────────────────────
-- Remplace la suppression directe depuis l'écran. Si la vente avait
-- retiré du stock, un mouvement « annulation_vente » le remet.
create or replace function public.delete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_sale public.sales%rowtype;
  v_out  bigint;
begin
  if v_uid is null then
    raise exception 'Connecte-toi pour supprimer une vente.' using errcode = '42501';
  end if;
  if not private.has_active_subscription() then
    raise exception 'Ton abonnement n''est pas actif : choisis un plan pour modifier tes ventes.' using errcode = '42501';
  end if;
  select * into v_sale from public.sales where id = p_sale_id and account_id = v_uid for update;
  if not found then
    raise exception 'Vente introuvable.' using errcode = 'P0002';
  end if;

  -- Ce que la vente a réellement retiré du stock (0 si produit non suivi)
  select -coalesce(sum(quantity), 0) into v_out
    from public.stock_moves
   where sale_id = v_sale.id and account_id = v_uid and type in ('vente', 'annulation_vente');
  if v_out > 0 then
    perform 1 from public.products where id = v_sale.product_id and account_id = v_uid for update;
    insert into public.stock_moves (account_id, product_id, type, quantity, unit_cost, note)
    values (v_uid, v_sale.product_id, 'annulation_vente', v_out, v_sale.unit_cost,
            'Vente supprimée (reçu ' || v_sale.receipt_number || ')');
    update public.products set stock_qty = stock_qty + v_out where id = v_sale.product_id and account_id = v_uid;
  end if;

  delete from public.sales where id = v_sale.id;
end;
$$;
revoke all on function public.delete_sale(uuid) from public, anon;
grant execute on function public.delete_sale(uuid) to authenticated;

-- Plus de suppression directe d'une vente depuis l'écran
drop policy if exists sales_delete_own on public.sales;
revoke insert, update, delete on public.sales from authenticated, anon;
