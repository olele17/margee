-- ══════════════════════════════════════════════════════════════════
-- Paiement déclaré (hors Bictorys) : l'e-commerçant envoie l'argent par
-- Wave ou Orange Money au numéro de Margee+, puis déclare son paiement
-- (numéro qui a payé + référence de la transaction). Le super admin
-- vérifie la réception et valide (abonnement activé) ou refuse.
-- ══════════════════════════════════════════════════════════════════

alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('bictorys', 'manual'));

-- Réglages publics (affichés sur la page des plans), modifiables par le super admin
insert into public.platform_settings (key, value, is_public) values
  ('manual_payment_enabled', 'true'::jsonb, true),
  ('manual_payment_number', '"78 733 28 50"'::jsonb, true),
  ('manual_payment_name', '"OLELE"'::jsonb, true)
on conflict (key) do nothing;

-- ── Côté e-commerçant : déclarer un paiement ──────────────────────
create or replace function public.declare_manual_payment(
  p_plan text, p_billing text, p_method text, p_payer_phone text, p_transaction_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_enabled boolean;
  v_plan    public.plans%rowtype;
  v_sub     public.subscriptions%rowtype;
  v_months  integer;
  v_amount  bigint;
  v_phone   text := regexp_replace(coalesce(p_payer_phone, ''), '[^0-9+]', '', 'g');
  v_tx      text := btrim(coalesce(p_transaction_ref, ''));
  v_ref     text;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'Connecte-toi pour déclarer un paiement.' using errcode = '42501';
  end if;
  select coalesce((value #>> '{}')::boolean, false) into v_enabled from public.platform_settings where key = 'manual_payment_enabled';
  if not coalesce(v_enabled, false) then
    raise exception 'Le paiement direct n''est pas disponible pour le moment : utilise le paiement en ligne.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.admins a where a.user_id = v_uid) then
    raise exception 'Tu es connecté avec un compte de l''équipe Margee+ : il ne prend pas d''abonnement.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if p_billing is null or p_billing not in ('monthly', 'yearly') then
    raise exception 'Période de paiement invalide.' using errcode = '22023';
  end if;
  select * into v_plan from public.plans where id = p_plan;
  if not found or not v_plan.is_active or v_plan.price <= 0 then
    raise exception 'Plan invalide : choisis Pro ou Elite.' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where account_id = v_uid;
  if found and v_sub.status = 'suspended' then
    raise exception 'Ton compte est suspendu. Contacte le support.' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('wave', 'orange_money') then
    raise exception 'Choisis le moyen utilisé : Wave ou Orange Money.' using errcode = '22023';
  end if;
  if v_phone !~ '^\+?[0-9]{7,15}$' then
    raise exception 'Numéro qui a payé invalide.' using errcode = '22023';
  end if;
  if char_length(v_tx) < 4 or char_length(v_tx) > 60 or v_tx !~ '^[A-Za-z0-9._/ -]+$' then
    raise exception 'Référence de transaction invalide : recopie celle du SMS ou de l''app Wave / Orange Money.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments
              where account_id = v_uid and provider = 'manual' and status = 'pending') then
    raise exception 'Tu as déjà un paiement déclaré en cours de vérification. On te répond très vite.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments
              where provider = 'manual' and status <> 'failed'
                and upper(raw ->> 'transaction_ref') = upper(v_tx)) then
    raise exception 'Cette référence de transaction a déjà été déclarée.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.payments
       where account_id = v_uid and provider = 'manual' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Trop de déclarations aujourd''hui. Réessaie demain ou écris-nous.' using errcode = 'P0001';
  end if;

  -- Montant : même règle que le paiement en ligne
  if p_billing = 'yearly' then
    select greatest(coalesce((value)::integer, 10), 1) into v_months
      from public.platform_settings where key = 'annual_months_paid';
    v_amount := v_plan.price * coalesce(v_months, 10);
  else
    v_amount := v_plan.price;
  end if;

  v_ref := 'MAN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.payments (account_id, plan_id, billing, amount, currency, provider, provider_ref, status, payment_method, raw)
  values (v_uid, v_plan.id, p_billing, v_amount, 'XOF', 'manual', v_ref, 'pending', p_method,
          jsonb_build_object('created_by', 'manual_declaration', 'payer_phone', v_phone,
                             'transaction_ref', v_tx, 'declared_at', now()))
  returning id into v_id;

  return jsonb_build_object('payment_id', v_id, 'reference', v_ref, 'amount', v_amount,
                            'plan_name', v_plan.name, 'billing', p_billing, 'status', 'pending');
end;
$function$;
revoke all on function public.declare_manual_payment(text, text, text, text, text) from public, anon;
grant execute on function public.declare_manual_payment(text, text, text, text, text) to authenticated;

-- Dernière déclaration du compte connecté (pour afficher « en cours de vérification »)
create or replace function public.my_manual_payment()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(x) from (
    select p.provider_ref as reference, p.status, p.amount, p.plan_id, p.billing, p.payment_method as method,
           p.created_at, p.paid_at
      from public.payments p
     where p.account_id = (select auth.uid()) and p.provider = 'manual'
     order by p.created_at desc limit 1
  ) x
$$;
revoke all on function public.my_manual_payment() from public, anon;
grant execute on function public.my_manual_payment() to authenticated;

-- ── Côté admin ────────────────────────────────────────────────────
-- Déclarations (tout admin) : numéro qui a payé et référence, pour vérifier
create or replace function public.admin_list_manual_payments(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.is_admin() then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at)
      from (
        select pa.id, pa.created_at, pa.account_id, pr.business_name, pr.email,
               pa.plan_id, pa.billing, pa.amount, pa.status, pa.provider_ref,
               pa.payment_method as method,
               pa.raw ->> 'payer_phone' as payer_phone,
               pa.raw ->> 'transaction_ref' as transaction_ref
          from public.payments pa
          left join public.profiles pr on pr.id = pa.account_id
         where pa.provider = 'manual' and (p_status is null or pa.status = p_status)
         order by pa.created_at
         limit 200
      ) x
  ), '[]'::jsonb);
end;
$function$;
revoke all on function public.admin_list_manual_payments(text) from public, anon;
grant execute on function public.admin_list_manual_payments(text) to authenticated;

-- Valider (super admin) : l'argent est bien arrivé → abonnement activé
create or replace function public.admin_validate_manual_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text;
  v_pay    public.payments%rowtype;
  v_sub    public.subscriptions%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.provider <> 'manual' then
    raise exception 'Paiement déclaré introuvable.' using errcode = 'P0002';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'Ce paiement a déjà été traité.' using errcode = 'P0001';
  end if;
  if v_pay.account_id is null then
    raise exception 'Le compte de ce paiement a été supprimé.' using errcode = 'P0001';
  end if;
  perform private.admin_lock_merchant(v_pay.account_id);

  update public.payments
     set status = 'success', paid_at = now(), activated_by = 'admin',
         provider_charge_id = left(v_pay.raw ->> 'transaction_ref', 120),
         raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
           'validation', jsonb_build_object('by', (select auth.uid()), 'at', now()))
   where id = v_pay.id;

  perform private.write_audit(
    'payment.manual_validate', v_pay.account_id,
    jsonb_build_object('payment_id', v_pay.id, 'status', 'pending', 'reference', v_pay.provider_ref),
    jsonb_build_object('payment_id', v_pay.id, 'status', 'success', 'amount', v_pay.amount,
                       'plan_id', v_pay.plan_id, 'billing', v_pay.billing, 'method', v_pay.payment_method,
                       'transaction_ref', v_pay.raw ->> 'transaction_ref'),
    v_reason);

  perform private.admin_audit_context('subscription.from_payment', v_reason);
  v_sub := private.apply_payment_to_subscription(v_pay.id);
  return jsonb_build_object('payment_id', v_pay.id, 'plan_id', v_sub.plan_id, 'status', v_sub.status, 'expires_at', v_sub.expires_at);
end;
$function$;
revoke all on function public.admin_validate_manual_payment(uuid, text) from public, anon;
grant execute on function public.admin_validate_manual_payment(uuid, text) to authenticated;

-- Refuser (super admin) : argent non reçu ou référence fausse
create or replace function public.admin_reject_manual_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text;
  v_pay    public.payments%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.provider <> 'manual' then
    raise exception 'Paiement déclaré introuvable.' using errcode = 'P0002';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'Ce paiement a déjà été traité.' using errcode = 'P0001';
  end if;

  update public.payments
     set status = 'failed',
         raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
           'rejection', jsonb_build_object('by', (select auth.uid()), 'at', now()))
   where id = v_pay.id;

  perform private.write_audit(
    'payment.manual_reject', v_pay.account_id,
    jsonb_build_object('payment_id', v_pay.id, 'status', 'pending', 'reference', v_pay.provider_ref),
    jsonb_build_object('payment_id', v_pay.id, 'status', 'failed', 'amount', v_pay.amount,
                       'transaction_ref', v_pay.raw ->> 'transaction_ref'),
    v_reason);
  return jsonb_build_object('payment_id', v_pay.id, 'status', 'failed');
end;
$function$;
revoke all on function public.admin_reject_manual_payment(uuid, text) from public, anon;
grant execute on function public.admin_reject_manual_payment(uuid, text) to authenticated;

-- Réglages du paiement direct (super admin)
create or replace function public.admin_update_manual_payment(p_enabled boolean, p_number text, p_name text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text;
  v_number text := btrim(coalesce(p_number, ''));
  v_name   text := btrim(coalesce(p_name, ''));
  v_before jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  if p_enabled is null then
    raise exception 'Indique si le paiement direct est activé.' using errcode = '22023';
  end if;
  if v_number !~ '^\+?[0-9 ]{7,20}$' then
    raise exception 'Numéro invalide (chiffres et espaces, 7 à 20 caractères).' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Nom affiché : 2 à 60 caractères.' using errcode = '22023';
  end if;
  select jsonb_object_agg(key, value) into v_before from public.platform_settings
   where key in ('manual_payment_enabled', 'manual_payment_number', 'manual_payment_name');

  insert into public.platform_settings (key, value, is_public) values
    ('manual_payment_enabled', to_jsonb(p_enabled), true),
    ('manual_payment_number', to_jsonb(v_number), true),
    ('manual_payment_name', to_jsonb(v_name), true)
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform private.write_audit('settings.manual_payment', null, v_before,
    jsonb_build_object('manual_payment_enabled', p_enabled, 'manual_payment_number', v_number, 'manual_payment_name', v_name),
    v_reason);
  return jsonb_build_object('enabled', p_enabled, 'number', v_number, 'name', v_name);
end;
$function$;
revoke all on function public.admin_update_manual_payment(boolean, text, text, text) from public, anon;
grant execute on function public.admin_update_manual_payment(boolean, text, text, text) to authenticated;
