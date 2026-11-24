-- ══════════════════════════════════════════════════════════════════
-- Invitation d'un e-commerçant par le super admin, avec un plan offert
-- (Free, Pro ou Elite, pour une durée choisie).
-- L'Edge Function admin-actions inscrit d'abord l'invitation ici (clé
-- service_role uniquement), puis crée le compte : la création de compte
-- (handle_new_user) lit l'invitation et active directement le plan.
-- ══════════════════════════════════════════════════════════════════
create table public.merchant_invitations (
  email       text primary key check (email = lower(email)),
  plan_id     text not null references public.plans(id),
  days        integer check (days is null or days between 1 and 730),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '1 day'
);
alter table public.merchant_invitations enable row level security;
revoke all on public.merchant_invitations from anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_open boolean;
  v_days integer;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business text;
  v_inv public.merchant_invitations%rowtype;
begin
  -- Invitation d'un e-commerçant (inscrite par le serveur, jamais par le navigateur)
  select * into v_inv from public.merchant_invitations
   where email = lower(new.email) and expires_at > now();

  select coalesce((value)::boolean, true) into v_open
  from public.platform_settings where key = 'signup_open';
  -- Fermées : seuls passent les invités (équipe ou e-commerçants)
  if v_open is false and new.invited_at is null and v_inv.email is null
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

  if v_inv.email is not null and v_inv.plan_id <> 'free' then
    -- Plan offert : actif tout de suite, pour la durée choisie
    insert into public.subscriptions (account_id, plan_id, billing, status, expires_at, trial_ends_at)
    values (new.id, v_inv.plan_id,
            case when coalesce(v_inv.days, 30) >= 365 then 'yearly' else 'monthly' end,
            'active', now() + make_interval(days => coalesce(v_inv.days, 30)), null);
  else
    -- Inscription normale (ou invitation en Free) : essai gratuit
    insert into public.subscriptions (account_id, plan_id, status, trial_ends_at)
    values (new.id, 'free', 'trial', now() + make_interval(days => coalesce(v_inv.days, v_days)));
  end if;

  if v_inv.email is not null then
    delete from public.merchant_invitations where email = v_inv.email;
  end if;
  return new;
end;
$function$;
