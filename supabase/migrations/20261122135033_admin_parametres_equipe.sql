-- ══════════════════════════════════════════════════════════════════
-- 0016 · Admin : paramètres, équipe et journal
--
-- Paramètres (super_admin) : inscriptions ouvertes / fermées avec un
--   message affiché quand elles sont fermées, durée de l'essai gratuit
--   (appliquée aux nouveaux inscrits seulement).
-- Équipe (super_admin) : liste, changement de rôle, désactivation /
--   réactivation. Le dernier super_admin actif ne peut être ni retiré,
--   ni rétrogradé, ni désactivé. On ne modifie pas son propre accès.
--   L'invitation par email passe par l'Edge Function admin-actions
--   (clé service_role) ; un invité peut s'inscrire même quand les
--   inscriptions sont fermées (auth.users.invited_at, posé par Supabase).
-- Journal (tout admin) : admin_list_audit, filtres admin / action /
--   compte / période, pagination.
-- ══════════════════════════════════════════════════════════════════

-- ── Admins désactivables ─────────────────────────────────────────
alter table public.admins
  add column if not exists disabled_at timestamptz,
  add column if not exists invited_by  uuid references auth.users (id) on delete set null;

-- Un admin désactivé perd tous ses droits (toutes les règles RLS et
-- fonctions admin passent par ces trois fonctions).
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.disabled_at is null);
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a
                  where a.user_id = (select auth.uid()) and a.role = 'super_admin' and a.disabled_at is null);
$$;

create or replace function private.admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role from public.admins a where a.user_id = (select auth.uid()) and a.disabled_at is null;
$$;

-- ── Inscription : un admin invité passe même si elles sont fermées ─
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_days integer;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business text;
begin
  select coalesce((value)::boolean, true) into v_open
  from public.platform_settings where key = 'signup_open';
  -- invited_at n'est posé que par une invitation (clé service_role) :
  -- une inscription publique ne peut pas le fournir.
  if v_open is false and new.invited_at is null then
    raise exception 'signup_closed' using
      errcode = 'P0001',
      hint = 'Les inscriptions sont fermées pour le moment.';
  end if;

  select greatest(coalesce((value)::integer, 3), 1) into v_days
  from public.platform_settings where key = 'trial_days';
  v_days := coalesce(v_days, 3);

  v_business := nullif(btrim(v_meta ->> 'business_name'), '');
  insert into public.profiles (id, business_name, owner_name, phone, email)
  values (
    new.id,
    left(coalesce(v_business, split_part(new.email, '@', 1), 'Ma boutique'), 120),
    left(nullif(btrim(v_meta ->> 'owner_name'), ''), 120),
    left(nullif(btrim(v_meta ->> 'phone'), ''), 40),
    new.email
  );

  insert into public.subscriptions (account_id, plan_id, status, trial_ends_at)
  values (new.id, 'free', 'trial', now() + make_interval(days => v_days));
  return new;
end;
$$;

-- ── Paramètres ───────────────────────────────────────────────────
insert into public.platform_settings (key, value, is_public)
values ('signup_closed_message', to_jsonb('Les inscriptions sont fermées pour le moment. Reviens très bientôt !'::text), true)
on conflict (key) do nothing;

create or replace function public.admin_update_settings(
  p_signup_open boolean, p_closed_message text, p_trial_days integer, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text;
  v_message text := btrim(coalesce(p_closed_message, ''));
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  if p_signup_open is null then
    raise exception 'Indique si les inscriptions sont ouvertes.' using errcode = '22023';
  end if;
  if char_length(v_message) < 5 or char_length(v_message) > 300 then
    raise exception 'Message de fermeture : entre 5 et 300 caractères.' using errcode = '22023';
  end if;
  if p_trial_days is null or p_trial_days < 1 or p_trial_days > 30 then
    raise exception 'Durée de l''essai : entre 1 et 30 jours.' using errcode = '22023';
  end if;

  perform private.admin_audit_context('settings.update', v_reason);
  -- Seules les valeurs qui changent sont écrites (une ligne de journal chacune)
  update public.platform_settings set value = to_jsonb(p_signup_open), updated_at = now()
   where key = 'signup_open' and value is distinct from to_jsonb(p_signup_open);
  update public.platform_settings set value = to_jsonb(v_message), updated_at = now()
   where key = 'signup_closed_message' and value is distinct from to_jsonb(v_message);
  update public.platform_settings set value = to_jsonb(p_trial_days), updated_at = now()
   where key = 'trial_days' and value is distinct from to_jsonb(p_trial_days);

  return (select jsonb_object_agg(key, value) from public.platform_settings
           where key in ('signup_open', 'signup_closed_message', 'trial_days'));
end;
$$;
revoke all on function public.admin_update_settings(boolean, text, integer, text) from public, anon;
grant execute on function public.admin_update_settings(boolean, text, integer, text) to authenticated;

-- ── Équipe ───────────────────────────────────────────────────────
create or replace function public.admin_list_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', a.user_id, 'email', u.email, 'role', a.role,
             'created_at', a.created_at, 'disabled_at', a.disabled_at,
             'last_sign_in_at', u.last_sign_in_at,
             'invited', u.invited_at is not null,
             'invited_by_email', ib.email,
             'is_me', a.user_id = (select auth.uid()))
           order by (a.disabled_at is not null), a.role desc, u.email)
      from public.admins a
      join auth.users u on u.id = a.user_id
      left join auth.users ib on ib.id = a.invited_by
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_team() from public, anon;
grant execute on function public.admin_list_team() to authenticated;

-- Contrôles communs : cible = un admin, pas soi-même
create or replace function private.admin_lock_team_member(p_user_id uuid)
returns public.admins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.admins%rowtype;
begin
  if p_user_id = (select auth.uid()) then
    raise exception 'Tu ne peux pas modifier ton propre accès : demande à un autre super admin.' using errcode = 'P0001';
  end if;
  select * into v_admin from public.admins where user_id = p_user_id for update;
  if not found then
    raise exception 'Membre de l''équipe introuvable.' using errcode = 'P0002';
  end if;
  return v_admin;
end;
$$;
revoke all on function private.admin_lock_team_member(uuid) from public, anon, authenticated;

-- Autres super_admins actifs que p_user_id
create or replace function private.other_active_super_admins(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.admins
   where role = 'super_admin' and disabled_at is null and user_id <> p_user_id;
$$;
revoke all on function private.other_active_super_admins(uuid) from public, anon, authenticated;

create or replace function public.admin_set_role(p_user_id uuid, p_role text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_admin  public.admins%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  if p_role is null or p_role not in ('super_admin', 'support') then
    raise exception 'Rôle invalide.' using errcode = '22023';
  end if;
  v_admin := private.admin_lock_team_member(p_user_id);
  if v_admin.role = p_role then
    raise exception 'Ce membre a déjà ce rôle.' using errcode = 'P0001';
  end if;
  -- (garde-fou : la cible n'est jamais l'appelant, donc il reste au
  -- moins l'appelant comme super_admin actif)
  if v_admin.role = 'super_admin' and v_admin.disabled_at is null
     and private.other_active_super_admins(p_user_id) = 0 then
    raise exception 'Impossible : c''est le dernier super admin actif.' using errcode = 'P0001';
  end if;
  perform private.admin_audit_context('admin.set_role', v_reason);
  update public.admins set role = p_role where user_id = p_user_id;
end;
$$;
revoke all on function public.admin_set_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text, text) to authenticated;

create or replace function public.admin_set_team_disabled(p_user_id uuid, p_disabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_admin  public.admins%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  if p_disabled is null then
    raise exception 'Action invalide.' using errcode = '22023';
  end if;
  v_admin := private.admin_lock_team_member(p_user_id);
  if p_disabled and v_admin.disabled_at is not null then
    raise exception 'Ce membre est déjà désactivé.' using errcode = 'P0001';
  end if;
  if not p_disabled and v_admin.disabled_at is null then
    raise exception 'Ce membre est déjà actif.' using errcode = 'P0001';
  end if;
  if p_disabled and v_admin.role = 'super_admin' and private.other_active_super_admins(p_user_id) = 0 then
    raise exception 'Impossible : c''est le dernier super admin actif.' using errcode = 'P0001';
  end if;
  perform private.admin_audit_context(case when p_disabled then 'admin.disable' else 'admin.enable' end, v_reason);
  update public.admins set disabled_at = case when p_disabled then now() else null end where user_id = p_user_id;
end;
$$;
revoke all on function public.admin_set_team_disabled(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_team_disabled(uuid, boolean, text) to authenticated;

-- ── Journal d'activité (tout admin) ──────────────────────────────
-- Filtres : admin (id), action (exacte), compte (id), période (jours),
-- recherche sur la boutique ou l'email du compte concerné.
create or replace function public.admin_list_audit(
  p_admin uuid default null, p_action text default null, p_account uuid default null,
  p_from date default null, p_to date default null, p_search text default null,
  p_page integer default 1, p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_size   integer := least(greatest(coalesce(p_page_size, 50), 1), 1000);
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_search text := nullif(btrim(p_search), '');
  v_like   text;
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'La date de début doit être avant la date de fin.' using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with filtered as (
    select l.*, pr.business_name as account_name
      from public.admin_audit_log l
      left join public.profiles pr on pr.id = l.account_id
     where (p_admin is null or l.admin_id = p_admin)
       and (p_action is null or l.action = p_action)
       and (p_account is null or l.account_id = p_account)
       and (p_from is null or l.created_at >= p_from::timestamptz)
       and (p_to is null or l.created_at < (p_to + 1)::timestamptz)
       and (v_like is null or pr.business_name ilike v_like or pr.email ilike v_like
            or l.admin_email ilike v_like or l.reason ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', v_page,
    'page_size', v_size,
    'rows', coalesce((
      select jsonb_agg(r order by r.created_at desc)
        from (
          select f.id, f.created_at, f.admin_id, f.admin_email, f.action, f.account_id,
                 f.account_name, f.before, f.after, f.reason
            from filtered f
           order by f.created_at desc
           limit v_size offset (v_page - 1) * v_size
        ) r
    ), '[]'::jsonb),
    -- Options des filtres (sur tout le journal)
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object('id', admin_id, 'email', admin_email) order by admin_email)
        from (select distinct on (admin_id) admin_id, admin_email from public.admin_audit_log
               where admin_id is not null order by admin_id, created_at desc) d
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(action order by action) from (select distinct action from public.admin_audit_log) d
    ), '[]'::jsonb),
    'account_name', (select business_name from public.profiles where id = p_account)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_list_audit(uuid, text, uuid, date, date, text, integer, integer) from public, anon;
grant execute on function public.admin_list_audit(uuid, text, uuid, date, date, text, integer, integer) to authenticated;
