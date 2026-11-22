-- ══════════════════════════════════════════════════════════════════
-- 0018 · Paiement : message clair pour un compte de l'équipe
--
-- Un compte admin (ou support) ne prend pas d'abonnement. Avant, il
-- recevait « Compte introuvable. », trompeur (cas fréquent : une session
-- admin ouverte dans un autre onglet du même navigateur remplace la
-- session e-commerçant). Seul le message change ; les règles restent.
-- ══════════════════════════════════════════════════════════════════

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
  if exists (select 1 from public.admins a where a.user_id = p_account_id) then
    raise exception 'Tu es connecté avec un compte de l''équipe Margee+ : il ne prend pas d''abonnement. Déconnecte-toi et connecte-toi avec ton compte e-commerçant (attention : les onglets du même navigateur partagent la même session).'
      using errcode = 'P0001';
  end if;
  select * into v_prof from public.profiles where id = p_account_id;
  if not found then
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
