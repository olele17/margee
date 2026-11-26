-- ══════════════════════════════════════════════════════════════════
-- Plan Free sans date de fin
--   Un compte Free ne s'expire plus avec le temps : il garde l'accès à
--   son espace et décide lui-même de passer à Pro ou Elite.
--   La seule limite du Free reste les 3 essais partagés (reçus, factures,
--   devis), vérifiée par record_sale et documents_prepare : inchangée.
--   trial_ends_at est conservé (historique : « a commencé par le Free »)
--   mais n'est plus lu pour l'accès ni pour le statut.
--   Les plans payants gardent leur date de fin (expires_at), inchangé.
-- ══════════════════════════════════════════════════════════════════

-- Statut affiché : un essai Free n'est plus jamais « expiré »
create or replace function private.effective_status(p_status text, p_trial_ends_at timestamptz, p_expires_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'suspended' then 'suspended'
    when p_status = 'active' and p_expires_at is not null and p_expires_at <= now() then 'expired'
    else coalesce(p_status, 'pending')
  end;
$$;

-- Droit d'écrire (RLS, ventes, documents) : le Free garde l'accès
create or replace function private.has_active_subscription()
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.account_id = (select auth.uid())
      and (
        (s.status = 'active' and (s.expires_at is null or s.expires_at > now()))
        or s.status = 'trial'
      )
  );
$$;

-- Choix du plan Free depuis la page Abonnement
create or replace function public.choose_free_plan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_sub  public.subscriptions%rowtype;
  v_days integer;
begin
  if v_uid is null then
    raise exception 'Connecte-toi pour choisir un plan.' using errcode = '42501';
  end if;

  select * into v_sub from public.subscriptions where account_id = v_uid for update;
  if not found then
    raise exception 'Abonnement introuvable.' using errcode = 'P0002';
  end if;
  if v_sub.status = 'suspended' then
    raise exception 'Ton compte est suspendu. Contacte le support.' using errcode = '42501';
  end if;
  if v_sub.status = 'active' and v_sub.plan_id = 'free' then
    return; -- ancien compte Free : inchangé
  end if;
  if v_sub.status = 'trial' then
    return; -- déjà sur le Free (sans date de fin)
  end if;
  if v_sub.status = 'active' and v_sub.plan_id is distinct from 'free'
     and (v_sub.expires_at is null or v_sub.expires_at > now()) then
    raise exception 'Ton plan payant est encore en cours.' using errcode = 'P0001';
  end if;
  if v_sub.trial_ends_at is not null then
    raise exception 'Tu as déjà utilisé le plan Free : choisis Pro ou Elite pour continuer.' using errcode = 'P0001';
  end if;

  select greatest(coalesce((value)::integer, 3), 1) into v_days
  from public.platform_settings where key = 'trial_days';
  update public.subscriptions
     set plan_id = 'free', status = 'trial', billing = null, expires_at = null,
         trial_ends_at = now() + make_interval(days => coalesce(v_days, 3))
   where account_id = v_uid;
end;
$$;

-- Réactivation d'un compte suspendu : un compte Free revient sur le Free
create or replace function public.admin_set_suspended(p_account_id uuid, p_suspend boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_sub    public.subscriptions%rowtype;
  v_new    text;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  v_sub := private.admin_lock_merchant(p_account_id);

  if coalesce(p_suspend, false) then
    if v_sub.status = 'suspended' then
      raise exception 'Ce compte est déjà suspendu.' using errcode = 'P0001';
    end if;
    v_new := 'suspended';
  else
    if v_sub.status <> 'suspended' then
      raise exception 'Ce compte n''est pas suspendu.' using errcode = 'P0001';
    end if;
    v_new := case
      when v_sub.plan_id is null then 'pending'
      when v_sub.plan_id in ('pro', 'elite') and v_sub.expires_at > now() then 'active'
      when v_sub.plan_id = 'free' and v_sub.trial_ends_at is not null then 'trial'
      when v_sub.plan_id = 'free' and v_sub.trial_ends_at is null and v_sub.expires_at is null then 'active'
      else 'expired'
    end;
  end if;

  perform private.admin_audit_context(case when v_new = 'suspended' then 'merchant.suspend' else 'merchant.reactivate' end, v_reason);
  update public.subscriptions set status = v_new where account_id = p_account_id;
  return jsonb_build_object('status', v_new);
end;
$$;

-- Prolonger : seulement les plans payants (le Free n'a plus de date de fin)
create or replace function public.admin_extend(p_account_id uuid, p_days integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_sub    public.subscriptions%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Nombre de jours invalide (entre 1 et 365).' using errcode = '22023';
  end if;
  v_sub := private.admin_lock_merchant(p_account_id);
  if v_sub.status = 'suspended' then
    raise exception 'Compte suspendu : réactive-le avant de le prolonger.' using errcode = 'P0001';
  end if;
  if v_sub.plan_id is null then
    raise exception 'Ce compte n''a pas encore choisi de plan.' using errcode = 'P0001';
  end if;
  if v_sub.plan_id = 'free' then
    raise exception 'Le plan Free n''a pas de date de fin : rien à prolonger.' using errcode = 'P0001';
  end if;
  if not private.is_super_admin() then
    raise exception 'Seul le super admin peut prolonger un abonnement.' using errcode = '42501';
  end if;

  perform private.admin_audit_context('merchant.extend_subscription', v_reason);
  update public.subscriptions
     set status = 'active',
         billing = coalesce(billing, 'monthly'),
         expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(days => p_days)
   where account_id = p_account_id;
  return (select jsonb_build_object('plan_id', plan_id, 'status', status, 'trial_ends_at', trial_ends_at, 'expires_at', expires_at)
            from public.subscriptions where account_id = p_account_id);
end;
$$;
