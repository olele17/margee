-- ══════════════════════════════════════════════════════════════════
-- 0013 · Admin : e-commerçants (liste, fiche, actions)
--
-- Toutes ces fonctions vérifient le rôle DANS LA BASE :
--   admin_list_merchants / admin_merchant_detail : tout admin
--   admin_extend        : tout admin (le support : essais uniquement)
--   admin_set_suspended : super_admin
--   admin_change_plan   : super_admin
-- Chaque action exige un motif (3 à 500 caractères). Le motif et le nom
-- de l'action sont transmis aux triggers du journal (admin_audit_log)
-- via les réglages de transaction margee.audit_reason / audit_action.
--
-- CONFIDENTIALITÉ : uniquement des totaux. Jamais le contenu des notes,
-- le détail de l'épargne, les challenges ni les clients des ventes.
-- Les comptes administrateurs ne sont pas des e-commerçants : ils sont
-- exclus de la liste et refusés par la fiche et les actions.
--
-- Suppression de compte et réinitialisation du mot de passe : Edge
-- Function « admin-actions » (clé service_role côté serveur seulement).
-- ══════════════════════════════════════════════════════════════════

-- ── Contrôles communs ────────────────────────────────────────────
create or replace function private.admin_check_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Motif obligatoire : explique en quelques mots pourquoi (3 caractères minimum).' using errcode = '22023';
  end if;
  if char_length(btrim(p_reason)) > 500 then
    raise exception 'Motif trop long (500 caractères maximum).' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;
revoke all on function private.admin_check_reason(text) from public, anon, authenticated;

-- Abonnement d'un e-commerçant (verrouillé pour la mise à jour).
-- Refuse les comptes inconnus et les comptes administrateurs.
create or replace function private.admin_lock_merchant(p_account_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions%rowtype;
begin
  if p_account_id is null
     or not exists (select 1 from public.profiles p where p.id = p_account_id)
     or exists (select 1 from public.admins a where a.user_id = p_account_id) then
    raise exception 'Compte e-commerçant introuvable.' using errcode = 'P0002';
  end if;
  select * into v_sub from public.subscriptions s where s.account_id = p_account_id for update;
  if not found then
    insert into public.subscriptions (account_id) values (p_account_id) returning * into v_sub;
  end if;
  return v_sub;
end;
$$;
revoke all on function private.admin_lock_merchant(uuid) from public, anon, authenticated;

-- Prépare le journal : action et motif de la transaction en cours
create or replace function private.admin_audit_context(p_action text, p_reason text)
returns void
language sql
set search_path = ''
as $$
  select set_config('margee.audit_action', p_action, true), set_config('margee.audit_reason', p_reason, true);
$$;
revoke all on function private.admin_audit_context(text, text) from public, anon, authenticated;

-- ── Liste des e-commerçants ──────────────────────────────────────
-- Recherche (boutique, nom, email, téléphone), filtres plan / statut
-- réel / signalé, tri sur une liste blanche, pagination côté serveur.
-- p_page commence à 1 ; p_page_size jusqu'à 1000 (export CSV).
create or replace function public.admin_list_merchants(
  p_search    text default null,
  p_plan      text default null,
  p_status    text default null,
  p_flagged   boolean default null,
  p_sort      text default 'created_at',
  p_dir       text default 'desc',
  p_page      integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort   text := case when p_sort in ('created_at', 'business_name', 'email', 'last_login_at', 'ends_at', 'plan_id', 'status') then p_sort else 'created_at' end;
  v_desc   boolean := lower(coalesce(p_dir, 'desc')) <> 'asc';
  v_size   integer := least(greatest(coalesce(p_page_size, 25), 1), 1000);
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_total  bigint;
  v_rows   jsonb;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  if p_plan is not null and p_plan not in ('free', 'pro', 'elite', 'none') then
    raise exception 'Plan inconnu.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('trial', 'active', 'expired', 'suspended', 'pending') then
    raise exception 'Statut inconnu.' using errcode = '22023';
  end if;
  if v_search is not null then
    -- les caractères spéciaux de LIKE sont cherchés tels quels
    v_search := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with m as (
    select p.id, p.business_name, p.owner_name, p.email, p.phone, p.created_at, p.last_login_at,
           s.plan_id, s.billing,
           private.effective_status(s.status, s.trial_ends_at, s.expires_at) as status,
           case when s.status = 'trial' or (s.plan_id = 'free' and s.expires_at is null) then s.trial_ends_at else s.expires_at end as ends_at,
           (select count(*) from public.account_flags f where f.account_id = p.id and f.resolved_at is null) as open_flags
      from public.profiles p
      left join public.subscriptions s on s.account_id = p.id
     where not exists (select 1 from public.admins a where a.user_id = p.id)
  ),
  f as (
    select * from m
     where (v_search is null or business_name ilike v_search or owner_name ilike v_search
            or email ilike v_search or phone ilike v_search)
       and (p_plan is null or (p_plan = 'none' and plan_id is null) or plan_id = p_plan)
       and (p_status is null or status = p_status)
       and (p_flagged is null or (open_flags > 0) = p_flagged)
  ),
  o as (
    select f.*, row_number() over (order by
        case when not v_desc and v_sort = 'created_at'    then created_at end asc,
        case when     v_desc and v_sort = 'created_at'    then created_at end desc,
        case when not v_desc and v_sort = 'business_name' then lower(business_name) end asc,
        case when     v_desc and v_sort = 'business_name' then lower(business_name) end desc,
        case when not v_desc and v_sort = 'email'         then lower(email) end asc,
        case when     v_desc and v_sort = 'email'         then lower(email) end desc,
        case when not v_desc and v_sort = 'last_login_at' then last_login_at end asc nulls first,
        case when     v_desc and v_sort = 'last_login_at' then last_login_at end desc nulls last,
        case when not v_desc and v_sort = 'ends_at'       then ends_at end asc nulls last,
        case when     v_desc and v_sort = 'ends_at'       then ends_at end desc nulls last,
        case when not v_desc and v_sort = 'plan_id'       then plan_id end asc,
        case when     v_desc and v_sort = 'plan_id'       then plan_id end desc,
        case when not v_desc and v_sort = 'status'        then status end asc,
        case when     v_desc and v_sort = 'status'        then status end desc,
        created_at desc, id) as rn,
        count(*) over () as total
      from f
  )
  select coalesce(max(total), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'business_name', business_name, 'owner_name', owner_name, 'email', email, 'phone', phone,
           'plan_id', plan_id, 'billing', billing, 'status', status, 'ends_at', ends_at,
           'created_at', created_at, 'last_login_at', last_login_at, 'open_flags', open_flags
         ) order by rn) filter (where rn > (v_page - 1) * v_size and rn <= v_page * v_size), '[]'::jsonb)
    into v_total, v_rows
    from o;

  return jsonb_build_object('total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows);
end;
$$;
revoke all on function public.admin_list_merchants(text, text, text, boolean, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_merchants(text, text, text, boolean, text, text, integer, integer) to authenticated;

-- ── Fiche d'un e-commerçant ──────────────────────────────────────
create or replace function public.admin_merchant_detail(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p   public.profiles%rowtype;
  v_s   public.subscriptions%rowtype;
  v_period date := date_trunc('month', now() at time zone 'Africa/Dakar')::date;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = p_account_id;
  if not found or exists (select 1 from public.admins a where a.user_id = p_account_id) then
    raise exception 'Compte e-commerçant introuvable.' using errcode = 'P0002';
  end if;
  select * into v_s from public.subscriptions where account_id = p_account_id;

  return jsonb_build_object(
    'account', jsonb_build_object(
      'id', v_p.id, 'business_name', v_p.business_name, 'owner_name', v_p.owner_name,
      'email', v_p.email, 'phone', v_p.phone, 'created_at', v_p.created_at, 'last_login_at', v_p.last_login_at
    ),
    'subscription', jsonb_build_object(
      'plan_id', v_s.plan_id, 'billing', v_s.billing, 'stored_status', v_s.status,
      'status', private.effective_status(v_s.status, v_s.trial_ends_at, v_s.expires_at),
      'trial_ends_at', v_s.trial_ends_at, 'expires_at', v_s.expires_at, 'updated_at', v_s.updated_at
    ),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'created_at', created_at, 'plan_id', plan_id, 'billing', billing,
        'amount', amount, 'status', status, 'provider_ref', provider_ref) order by created_at desc)
        from public.payments where account_id = p_account_id), '[]'::jsonb),
    -- Totaux uniquement : aucun contenu, aucun client
    'totals', jsonb_build_object(
      'revenue_total', (select coalesce(sum(unit_price * qty), 0) from public.sales where account_id = p_account_id),
      'sales_count', (select count(*) from public.sales where account_id = p_account_id),
      'last_sale_at', (select max(sold_at) from public.sales where account_id = p_account_id),
      'products_count', (select count(*) from public.products where account_id = p_account_id and not is_archived),
      'receipts_this_month', (select coalesce(sum(issued), 0) from public.receipt_usage where account_id = p_account_id and period = v_period),
      'receipts_total', (select coalesce(sum(issued), 0) from public.receipt_usage where account_id = p_account_id),
      'notes_count', (select count(*) from public.notes where account_id = p_account_id),
      'challenges_count', (select count(*) from public.challenges where account_id = p_account_id),
      'pots_count', (select count(*) from public.savings_pots where account_id = p_account_id)
    ),
    'admin_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'content', n.content, 'created_at', n.created_at,
        'author_id', n.author_id, 'author_email', u.email) order by n.created_at desc)
        from public.admin_notes n left join auth.users u on u.id = n.author_id
       where n.account_id = p_account_id), '[]'::jsonb),
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'reason', f.reason, 'created_at', f.created_at,
        'resolved_at', f.resolved_at, 'resolved_by_email', u.email) order by f.resolved_at is not null, f.created_at desc)
        from public.account_flags f left join auth.users u on u.id = f.resolved_by
       where f.account_id = p_account_id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'created_at', l.created_at, 'action', l.action,
        'admin_email', l.admin_email, 'reason', l.reason) order by l.created_at desc)
        from (select * from public.admin_audit_log where account_id = p_account_id order by created_at desc limit 30) l), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_merchant_detail(uuid) from public, anon;
grant execute on function public.admin_merchant_detail(uuid) to authenticated;

-- ── Suspendre / réactiver (super_admin) ──────────────────────────
-- À la réactivation, le statut est recalculé d'après les dates :
--   plan payant encore valable → active ; essai encore valable → trial ;
--   ancien Free sans date (compte d'avant l'essai) → active ;
--   aucun plan → pending ; sinon → expired.
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
      when v_sub.plan_id = 'free' and v_sub.trial_ends_at > now() then 'trial'
      when v_sub.plan_id = 'free' and v_sub.trial_ends_at is null and v_sub.expires_at is null then 'active'
      else 'expired'
    end;
  end if;

  perform private.admin_audit_context(case when v_new = 'suspended' then 'merchant.suspend' else 'merchant.reactivate' end, v_reason);
  update public.subscriptions set status = v_new where account_id = p_account_id;
  return jsonb_build_object('status', v_new);
end;
$$;
revoke all on function public.admin_set_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_suspended(uuid, boolean, text) to authenticated;

-- ── Changer de plan (super_admin) ────────────────────────────────
-- Pro / Elite : abonnement actif ; la date de fin en cours est gardée si
--   elle est dans le futur, sinon nouvelle période (30 jours, ou 365 en
--   annuel). Utile pour un geste commercial ou un paiement hors ligne.
-- Free : essai ; l'essai en cours est gardé, sinon un nouvel essai de
--   trial_days jours est accordé.
-- Refusé sur un compte suspendu (le réactiver d'abord).
create or replace function public.admin_change_plan(p_account_id uuid, p_plan text, p_billing text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text;
  v_sub     public.subscriptions%rowtype;
  v_billing text := case when p_plan = 'free' then null else coalesce(p_billing, 'monthly') end;
  v_days    integer;
  v_trial   integer;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  if p_plan is null or not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'Plan inconnu.' using errcode = '22023';
  end if;
  if v_billing is not null and v_billing not in ('monthly', 'yearly') then
    raise exception 'Facturation inconnue (mensuelle ou annuelle).' using errcode = '22023';
  end if;
  v_sub := private.admin_lock_merchant(p_account_id);
  if v_sub.status = 'suspended' then
    raise exception 'Compte suspendu : réactive-le avant de changer son plan.' using errcode = 'P0001';
  end if;
  if v_sub.plan_id = p_plan and v_sub.billing is not distinct from v_billing
     and private.effective_status(v_sub.status, v_sub.trial_ends_at, v_sub.expires_at) in ('active', 'trial') then
    raise exception 'Ce compte a déjà ce plan.' using errcode = 'P0001';
  end if;

  perform private.admin_audit_context('merchant.change_plan', v_reason);
  if p_plan = 'free' then
    select coalesce((value #>> '{}')::integer, 3) into v_trial from public.platform_settings where key = 'trial_days';
    update public.subscriptions
       set plan_id = 'free', billing = null, status = 'trial', expires_at = null,
           trial_ends_at = case when trial_ends_at > now() then trial_ends_at else now() + make_interval(days => coalesce(v_trial, 3)) end
     where account_id = p_account_id;
  else
    select coalesce(duration_days, 30) into v_days from public.plans where id = p_plan;
    if v_billing = 'yearly' then v_days := 365; end if;
    update public.subscriptions
       set plan_id = p_plan, billing = v_billing, status = 'active',
           expires_at = case when plan_id in ('pro', 'elite') and expires_at > now() then expires_at else now() + make_interval(days => v_days) end
     where account_id = p_account_id;
  end if;
  return (select jsonb_build_object('plan_id', plan_id, 'billing', billing, 'status', status,
                                    'trial_ends_at', trial_ends_at, 'expires_at', expires_at)
            from public.subscriptions where account_id = p_account_id);
end;
$$;
revoke all on function public.admin_change_plan(uuid, text, text, text) from public, anon;
grant execute on function public.admin_change_plan(uuid, text, text, text) to authenticated;

-- ── Prolonger un essai ou un abonnement de X jours ───────────────
-- super_admin : essai ou abonnement payant. support : essai uniquement.
-- La prolongation part de la date de fin si elle est dans le futur,
-- sinon d'aujourd'hui (un compte expiré redevient utilisable).
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
    if v_sub.trial_ends_at is null and v_sub.status = 'active' then
      raise exception 'Ancien compte Free sans date de fin : rien à prolonger.' using errcode = 'P0001';
    end if;
    perform private.admin_audit_context('merchant.extend_trial', v_reason);
    update public.subscriptions
       set status = 'trial',
           trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
     where account_id = p_account_id;
  else
    if not private.is_super_admin() then
      raise exception 'Le support peut seulement prolonger un essai gratuit.' using errcode = '42501';
    end if;
    perform private.admin_audit_context('merchant.extend_subscription', v_reason);
    update public.subscriptions
       set status = 'active',
           billing = coalesce(billing, 'monthly'),
           expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(days => p_days)
     where account_id = p_account_id;
  end if;
  return (select jsonb_build_object('plan_id', plan_id, 'status', status, 'trial_ends_at', trial_ends_at, 'expires_at', expires_at)
            from public.subscriptions where account_id = p_account_id);
end;
$$;
revoke all on function public.admin_extend(uuid, integer, text) from public, anon;
grant execute on function public.admin_extend(uuid, integer, text) to authenticated;

-- ── Notes internes et signalements : motif de journal par défaut ──
-- (écriture directe autorisée par la RLS à tout admin ; on rattache
-- l'auteur côté base pour qu'il ne puisse pas être usurpé)
alter table public.admin_notes alter column author_id set default auth.uid();
