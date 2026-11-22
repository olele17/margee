-- ══════════════════════════════════════════════════════════════════
-- 0017 · Invitations de l'équipe quand les inscriptions sont fermées
--
-- Supabase crée l'utilisateur invité AVANT de poser auth.users.invited_at :
-- le trigger d'inscription ne peut donc pas s'y fier. L'Edge Function
-- admin-actions (clé service_role) inscrit l'email dans
-- admin_invitations juste avant de créer le compte ; le trigger laisse
-- passer un email invité (valable 24 h), puis la ligne est supprimée.
-- Aucun accès depuis l'API publique : un visiteur ne peut pas s'y ajouter.
-- ══════════════════════════════════════════════════════════════════

create table if not exists public.admin_invitations (
  email       text primary key check (email = lower(email)),
  role        text not null check (role in ('super_admin', 'support')),
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '1 day'
);
alter table public.admin_invitations enable row level security;
revoke all on public.admin_invitations from anon, authenticated;

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
  -- Fermées : seuls passent les membres de l'équipe invités
  -- (admin_invitations n'est modifiable que par la clé service_role).
  if v_open is false and new.invited_at is null
     and not exists (select 1 from public.admin_invitations i
                      where i.email = lower(new.email) and i.expires_at > now()) then
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
