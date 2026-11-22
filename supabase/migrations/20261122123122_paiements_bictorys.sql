-- ══════════════════════════════════════════════════════════════════
-- 0014 · Paiements Bictorys et abonnements
--
-- Parcours d'un paiement :
--   1. L'Edge Function « bictorys-checkout » (clé service_role) appelle
--      checkout_create_payment : ligne « pending », montant calculé ICI
--      depuis la table plans (jamais depuis le navigateur).
--   2. Elle crée la charge chez Bictorys et redirige vers sa page.
--   3. L'Edge Function « bictorys-webhook » vérifie la clé secrète du
--      webhook puis appelle payment_webhook_apply : idempotent (un
--      paiement réussi n'est appliqué qu'une fois), montant contrôlé.
--   4. Paiement réussi → abonnement activé ou prolongé.
--
-- Admin (/admin/paiements) :
--   admin_list_payments    : tout admin, filtres période / statut
--   admin_activate_payment : super_admin, référence Bictorys + motif,
--                            inscrit au journal.
-- ══════════════════════════════════════════════════════════════════

alter table public.payments
  add column if not exists provider_charge_id text,
  add column if not exists payment_method     text,
  add column if not exists paid_at            timestamptz,
  add column if not exists activated_by       text;

alter table public.payments
  add constraint payments_activated_by_check check (activated_by is null or activated_by in ('webhook', 'admin')),
  add constraint payments_method_length check (payment_method is null or char_length(payment_method) <= 40),
  add constraint payments_charge_length check (provider_charge_id is null or char_length(provider_charge_id) <= 120);

create unique index if not exists payments_provider_charge_id_key
  on public.payments (provider_charge_id) where provider_charge_id is not null;
create index if not exists payments_created_idx on public.payments (created_at desc);

-- ── Application d'un paiement réussi à l'abonnement ──────────────
-- Même plan encore valide : prolongé à partir de la fin actuelle.
-- Sinon (nouveau plan, expiré, essai) : à partir de maintenant.
-- Un compte suspendu reste suspendu (plan et date mis à jour : la
-- réactivation par l'équipe retrouvera l'abonnement payé).
create or replace function private.apply_payment_to_subscription(p_payment_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay  public.payments%rowtype;
  v_sub  public.subscriptions%rowtype;
  v_days integer;
  v_base timestamptz;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found or v_pay.status <> 'success' or v_pay.account_id is null then
    raise exception 'Paiement introuvable ou non réussi.' using errcode = 'P0002';
  end if;

  select * into v_sub from public.subscriptions where account_id = v_pay.account_id for update;
  if not found then
    insert into public.subscriptions (account_id) values (v_pay.account_id) returning * into v_sub;
  end if;

  if v_pay.billing = 'yearly' then
    v_days := 365;
  else
    select coalesce(p.duration_days, 30) into v_days from public.plans p where p.id = v_pay.plan_id;
    v_days := coalesce(v_days, 30);
  end if;

  v_base := case
    when v_sub.plan_id = v_pay.plan_id and v_sub.status in ('active', 'suspended')
         and v_sub.expires_at is not null and v_sub.expires_at > now()
      then v_sub.expires_at
    else now()
  end;

  update public.subscriptions
     set plan_id    = v_pay.plan_id,
         billing    = v_pay.billing,
         expires_at = v_base + make_interval(days => v_days),
         status     = case when v_sub.status = 'suspended' then 'suspended' else 'active' end
   where account_id = v_pay.account_id
  returning * into v_sub;
  return v_sub;
end;
$$;
revoke all on function private.apply_payment_to_subscription(uuid) from public, anon, authenticated;

-- ── 1. Création du paiement (Edge Function bictorys-checkout) ────
-- Appelée avec la clé service_role : p_account_id vient du jeton
-- vérifié par la fonction, jamais d'un champ envoyé par le navigateur.
create or replace function public.checkout_create_payment(p_account_id uuid, p_plan text, p_billing text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan    public.plans%rowtype;
  v_sub     public.subscriptions%rowtype;
  v_prof    public.profiles%rowtype;
  v_months  integer;
  v_amount  bigint;
  v_ref     text;
  v_id      uuid;
begin
  select * into v_prof from public.profiles where id = p_account_id;
  if not found or exists (select 1 from public.admins a where a.user_id = p_account_id) then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if p_billing is null or p_billing not in ('monthly', 'yearly') then
    raise exception 'Période de paiement invalide.' using errcode = '22023';
  end if;
  select * into v_plan from public.plans where id = p_plan;
  if not found or not v_plan.is_active or v_plan.price <= 0 then
    raise exception 'Plan invalide : choisis Pro ou Elite.' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where account_id = p_account_id;
  if found and v_sub.status = 'suspended' then
    raise exception 'Ton compte est suspendu. Contacte le support.' using errcode = '42501';
  end if;
  -- Anti-abus : pas plus de 10 paiements commencés par heure
  if (select count(*) from public.payments
       where account_id = p_account_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de tentatives de paiement. Réessaie dans une heure.' using errcode = 'P0001';
  end if;

  if p_billing = 'yearly' then
    select greatest(coalesce((value)::integer, 10), 1) into v_months
    from public.platform_settings where key = 'annual_months_paid';
    v_amount := v_plan.price * coalesce(v_months, 10);
  else
    v_amount := v_plan.price;
  end if;

  v_ref := 'MRG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  insert into public.payments (account_id, plan_id, billing, amount, currency, provider, provider_ref, status, raw)
  values (p_account_id, v_plan.id, p_billing, v_amount, 'XOF', 'bictorys', v_ref, 'pending',
          jsonb_build_object('created_by', 'checkout'))
  returning id into v_id;

  return jsonb_build_object(
    'payment_id', v_id, 'reference', v_ref, 'amount', v_amount, 'currency', 'XOF',
    'plan_name', v_plan.name, 'billing', p_billing,
    'business_name', v_prof.business_name, 'owner_name', v_prof.owner_name,
    'email', v_prof.email, 'phone', v_prof.phone
  );
end;
$$;
revoke all on function public.checkout_create_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.checkout_create_payment(uuid, text, text) to service_role;

-- ── 2. Notification Bictorys (Edge Function bictorys-webhook) ────
-- p_status : statut Bictorys déjà normalisé par la fonction
-- (succeeded, failed, cancelled, pending, processing, reversed…).
-- Idempotent : un paiement déjà réussi n'est jamais réappliqué.
create or replace function public.payment_webhook_apply(
  p_reference text, p_charge_id text, p_status text,
  p_amount bigint, p_currency text, p_method text, p_raw jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay  public.payments%rowtype;
  v_raw  jsonb;
begin
  if nullif(btrim(p_reference), '') is not null then
    select * into v_pay from public.payments where provider_ref = btrim(p_reference) for update;
  end if;
  if v_pay.id is null and nullif(btrim(p_charge_id), '') is not null then
    select * into v_pay from public.payments where provider_charge_id = btrim(p_charge_id) for update;
  end if;
  if v_pay.id is null then
    return jsonb_build_object('result', 'unknown');
  end if;

  v_raw := coalesce(v_pay.raw, '{}'::jsonb)
           || jsonb_build_object('last_event', jsonb_build_object('status', p_status, 'received_at', now(), 'payload', p_raw));

  if v_pay.status = 'success' then
    if p_status = 'reversed' then
      update public.payments set raw = v_raw || jsonb_build_object('reversed_at', now()) where id = v_pay.id;
      return jsonb_build_object('result', 'reversed_after_success');
    end if;
    return jsonb_build_object('result', 'already_applied');
  end if;

  if p_status = 'succeeded' then
    if p_amount is distinct from v_pay.amount or upper(coalesce(p_currency, 'XOF')) <> v_pay.currency then
      update public.payments
         set raw = v_raw || jsonb_build_object('amount_mismatch', jsonb_build_object('received', p_amount, 'currency', p_currency))
       where id = v_pay.id;
      return jsonb_build_object('result', 'amount_mismatch');
    end if;
    if v_pay.account_id is null then
      update public.payments set status = 'success', paid_at = now(), activated_by = 'webhook',
             provider_charge_id = coalesce(v_pay.provider_charge_id, nullif(btrim(p_charge_id), '')),
             payment_method = coalesce(left(nullif(btrim(p_method), ''), 40), v_pay.payment_method), raw = v_raw
       where id = v_pay.id;
      return jsonb_build_object('result', 'paid_account_deleted');
    end if;
    update public.payments
       set status = 'success', paid_at = now(), activated_by = 'webhook',
           provider_charge_id = coalesce(v_pay.provider_charge_id, nullif(btrim(p_charge_id), '')),
           payment_method = coalesce(left(nullif(btrim(p_method), ''), 40), v_pay.payment_method),
           raw = v_raw
     where id = v_pay.id;
    perform private.apply_payment_to_subscription(v_pay.id);
    return jsonb_build_object('result', 'applied', 'payment_id', v_pay.id);
  end if;

  if p_status in ('failed', 'cancelled') then
    update public.payments
       set status = 'failed', raw = v_raw,
           provider_charge_id = coalesce(v_pay.provider_charge_id, nullif(btrim(p_charge_id), '')),
           payment_method = coalesce(left(nullif(btrim(p_method), ''), 40), v_pay.payment_method)
     where id = v_pay.id;
    return jsonb_build_object('result', 'failed');
  end if;

  -- pending, processing, authorized… : on garde la trace, rien d'autre
  update public.payments set raw = v_raw where id = v_pay.id;
  return jsonb_build_object('result', 'noted');
end;
$$;
revoke all on function public.payment_webhook_apply(text, text, text, bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.payment_webhook_apply(text, text, text, bigint, text, text, jsonb) to service_role;

-- ── 3. Liste des paiements (tout admin) ──────────────────────────
-- Période sur la date de création, en jours (Dakar = UTC). Total
-- encaissé = somme des paiements réussis de la période et des filtres.
create or replace function public.admin_list_payments(
  p_from date default null, p_to date default null, p_status text default null,
  p_search text default null, p_page integer default 1, p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_size   integer := least(greatest(coalesce(p_page_size, 25), 1), 1000);
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_search text := nullif(btrim(p_search), '');
  v_like   text;
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('success', 'pending', 'failed') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'La date de début doit être avant la date de fin.' using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with base as (
    select pa.*, pr.business_name, pr.email
      from public.payments pa
      left join public.profiles pr on pr.id = pa.account_id
     where (p_from is null or pa.created_at >= p_from::timestamptz)
       and (p_to is null or pa.created_at < (p_to + 1)::timestamptz)
       and (v_like is null or pa.provider_ref ilike v_like or pa.provider_charge_id ilike v_like
            or pr.business_name ilike v_like or pr.email ilike v_like)
  ),
  filtered as (
    select * from base where p_status is null or status = p_status
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', v_page,
    'page_size', v_size,
    'summary', jsonb_build_object(
      'collected', (select coalesce(sum(amount), 0) from base where status = 'success'),
      'success_count', (select count(*) from base where status = 'success'),
      'pending_count', (select count(*) from base where status = 'pending'),
      'failed_count', (select count(*) from base where status = 'failed')
    ),
    'rows', coalesce((
      select jsonb_agg(r order by r.created_at desc)
        from (
          select f.id, f.created_at, f.paid_at, f.account_id, f.business_name, f.email,
                 f.plan_id, f.billing, f.amount, f.currency, f.status, f.provider_ref,
                 f.provider_charge_id, f.payment_method, f.activated_by
            from filtered f
           order by f.created_at desc
           limit v_size offset (v_page - 1) * v_size
        ) r
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_list_payments(date, date, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_payments(date, date, text, text, integer, integer) to authenticated;

-- ── 4. Activation manuelle (super_admin) ─────────────────────────
-- Seulement pour un paiement réellement reçu chez Bictorys dont la
-- notification a échoué : référence Bictorys et motif obligatoires.
create or replace function public.admin_activate_payment(p_payment_id uuid, p_bictorys_ref text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_ref    text := btrim(coalesce(p_bictorys_ref, ''));
  v_pay    public.payments%rowtype;
  v_sub    public.subscriptions%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  if char_length(v_ref) < 3 or char_length(v_ref) > 120 then
    raise exception 'Référence Bictorys obligatoire (celle de la transaction reçue).' using errcode = '22023';
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable.' using errcode = 'P0002';
  end if;
  if v_pay.status = 'success' then
    raise exception 'Ce paiement est déjà activé.' using errcode = 'P0001';
  end if;
  if v_pay.account_id is null then
    raise exception 'Le compte de ce paiement a été supprimé.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where provider_charge_id = v_ref and id <> v_pay.id) then
    raise exception 'Cette référence Bictorys est déjà liée à un autre paiement.' using errcode = 'P0001';
  end if;
  if v_pay.provider_charge_id is not null and v_pay.provider_charge_id <> v_ref then
    raise exception 'La référence ne correspond pas à la transaction Bictorys de ce paiement (%).', v_pay.provider_charge_id using errcode = 'P0001';
  end if;
  perform private.admin_lock_merchant(v_pay.account_id);

  update public.payments
     set status = 'success', paid_at = now(), activated_by = 'admin', provider_charge_id = v_ref,
         raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
           'manual_activation', jsonb_build_object('by', (select auth.uid()), 'at', now(), 'bictorys_ref', v_ref))
   where id = v_pay.id;

  perform private.write_audit(
    'payment.manual_activate', v_pay.account_id,
    jsonb_build_object('payment_id', v_pay.id, 'status', v_pay.status, 'reference', v_pay.provider_ref),
    jsonb_build_object('payment_id', v_pay.id, 'status', 'success', 'bictorys_ref', v_ref,
                       'amount', v_pay.amount, 'plan_id', v_pay.plan_id, 'billing', v_pay.billing),
    v_reason);

  perform private.admin_audit_context('subscription.from_payment', v_reason);
  v_sub := private.apply_payment_to_subscription(v_pay.id);
  return jsonb_build_object('payment_id', v_pay.id, 'plan_id', v_sub.plan_id, 'status', v_sub.status, 'expires_at', v_sub.expires_at);
end;
$$;
revoke all on function public.admin_activate_payment(uuid, text, text) from public, anon;
grant execute on function public.admin_activate_payment(uuid, text, text) to authenticated;
