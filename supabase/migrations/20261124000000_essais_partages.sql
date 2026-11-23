-- ══════════════════════════════════════════════════════════════════
-- Essais gratuits (plan Free) : un seul compteur pour les reçus, les
-- factures et les devis. Exemple : 3 essais = 3 reçus, ou 1 reçu +
-- 1 devis + 1 facture… au choix de l'e-commerçant.
-- Compté « à vie » : supprimer une vente ou un document ne rend pas
-- d'essai. Les plans payants ne changent pas (reçus par mois,
-- factures et devis illimités).
-- ══════════════════════════════════════════════════════════════════

-- Essais déjà utilisés : reçus émis + factures et devis créés
create or replace function private.free_trial_used(p_account uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((select sum(u.issued) from public.receipt_usage u where u.account_id = p_account), 0)
    + coalesce((select sum(c.last_number) from public.document_counters c where c.account_id = p_account), 0)
  )::integer
$$;
revoke all on function private.free_trial_used(uuid) from public, anon, authenticated;

-- Reçus : le plan Free compte aussi les factures et devis
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

  return v_sale;
end;
$function$;

-- Factures et devis : contrôle des essais Free à la création
create or replace function private.documents_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item     jsonb;
  v_qty      numeric;
  v_price    numeric;
  v_desc     text;
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_year     integer;
  v_next     integer;
  v_plan     public.plans%rowtype;
begin
  -- Lignes : 1 à 50, désignation 1-200 caractères, quantité > 0, prix ≥ 0
  if new.items is null or jsonb_typeof(new.items) <> 'array'
     or jsonb_array_length(new.items) < 1 or jsonb_array_length(new.items) > 50 then
    raise exception 'Ajoute entre 1 et 50 lignes.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(new.items) loop
    v_desc := btrim(coalesce(v_item ->> 'description', ''));
    begin
      v_qty := (v_item ->> 'qty')::numeric;
      v_price := (v_item ->> 'unit_price')::numeric;
    exception when others then
      raise exception 'Quantité ou prix invalide.' using errcode = '22023';
    end;
    if char_length(v_desc) < 1 or char_length(v_desc) > 200 then
      raise exception 'Chaque ligne a besoin d''une désignation (200 caractères maximum).' using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 then
      raise exception 'Quantité invalide sur la ligne « % ».', left(v_desc, 40) using errcode = '22023';
    end if;
    if v_price is null or v_price < 0 or v_price > 1000000000 or v_price <> trunc(v_price) then
      raise exception 'Prix unitaire invalide sur la ligne « % » (nombre entier de F CFA).', left(v_desc, 40) using errcode = '22023';
    end if;
    v_items := v_items || jsonb_build_object('description', v_desc, 'qty', v_qty, 'unit_price', v_price,
                                             'total', round(v_qty * v_price));
    v_subtotal := v_subtotal + round(v_qty * v_price);
  end loop;
  new.items := v_items;
  new.client_name := btrim(new.client_name);
  new.subtotal := v_subtotal;
  new.discount_amount := round(v_subtotal * new.discount_percent / 100);
  new.tax_amount := round((v_subtotal - new.discount_amount) * new.tax_rate / 100);
  new.total := v_subtotal - new.discount_amount + new.tax_amount;

  -- Statut « payée » : date de paiement ; sinon effacée
  if new.kind = 'invoice' and new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;
  end if;

  if tg_op = 'INSERT' then
    -- Plan Free : chaque facture ou devis utilise un essai (partagé avec les reçus)
    select p.* into v_plan
      from public.subscriptions s join public.plans p on p.id = s.plan_id
     where s.account_id = new.account_id;
    if v_plan.receipt_limit is not null and v_plan.duration_days is null
       and private.free_trial_used(new.account_id) >= v_plan.receipt_limit then
      raise exception 'Tu as utilisé tes % essais gratuits (reçus, factures ou devis). Passe au plan supérieur pour continuer.',
        v_plan.receipt_limit using errcode = 'P0001';
    end if;

    -- Numéro attribué par la base (le numéro envoyé est ignoré)
    v_year := extract(year from new.issue_date)::integer;
    insert into public.document_counters (account_id, kind, year, last_number)
    values (new.account_id, new.kind, v_year, 1)
    on conflict (account_id, kind, year)
      do update set last_number = public.document_counters.last_number + 1
    returning last_number into v_next;
    new.number := case new.kind when 'quote' then 'DEV' else 'FAC' end
                  || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
  else
    -- Le type, le numéro et le compte ne changent jamais
    new.kind := old.kind;
    new.number := old.number;
    new.account_id := old.account_id;
  end if;
  return new;
end;
$function$;

-- Décompte pour l'app (le compte connecté uniquement)
create or replace function public.my_trial_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'receipts', coalesce((select sum(u.issued) from public.receipt_usage u where u.account_id = (select auth.uid())), 0),
    'quotes',   coalesce((select sum(c.last_number) from public.document_counters c where c.account_id = (select auth.uid()) and c.kind = 'quote'), 0),
    'invoices', coalesce((select sum(c.last_number) from public.document_counters c where c.account_id = (select auth.uid()) and c.kind = 'invoice'), 0)
  )
$$;
revoke all on function public.my_trial_usage() from public, anon;
grant execute on function public.my_trial_usage() to authenticated;

-- Texte du plan Free (tarifs) : la ligne des reçus devient « 3 essais »
-- (seulement si l'admin ne l'a pas déjà modifiée)
update public.plans
   set features = (
     select jsonb_agg(case when f = '3 reçus PDF pour tester' then '3 essais : reçus, factures ou devis' else f end order by i)
       from jsonb_array_elements_text(features) with ordinality as x(f, i)
   )
 where id = 'free' and features ? '3 reçus PDF pour tester';
