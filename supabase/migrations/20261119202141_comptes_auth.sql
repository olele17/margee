-- ══════════════════════════════════════════════════════════════════
-- 0007 · Comptes : inscription avec Supabase Auth
--
-- • À l'inscription (insert dans auth.users), un trigger crée le profil
--   et l'abonnement. Selon la décision produit (Free = 3 reçus sans
--   durée, pas d'essai limité dans le temps), l'abonnement démarre
--   « pending » : l'e-commerçant choisit ensuite son plan sur /abonnement.
-- • Si platform_settings.signup_open = false, l'inscription est refusée.
-- • L'email du profil suit l'email de Supabase Auth.
-- • choose_free_plan() : seule écriture d'abonnement possible côté
--   e-commerçant, et uniquement vers le plan Free.
-- ══════════════════════════════════════════════════════════════════

-- ── Création automatique du profil et de l'abonnement ────────────
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business text;
begin
  select coalesce((value)::boolean, true) into v_open
  from public.platform_settings where key = 'signup_open';
  if v_open is false then
    raise exception 'signup_closed' using
      errcode = 'P0001',
      hint = 'Les inscriptions sont fermées pour le moment.';
  end if;

  v_business := nullif(btrim(v_meta ->> 'business_name'), '');
  insert into public.profiles (id, business_name, owner_name, phone, email)
  values (
    new.id,
    left(coalesce(v_business, split_part(new.email, '@', 1), 'Ma boutique'), 120),
    left(nullif(btrim(v_meta ->> 'owner_name'), ''), 120),
    left(nullif(btrim(v_meta ->> 'phone'), ''), 40),
    new.email
  );

  insert into public.subscriptions (account_id, status) values (new.id, 'pending');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ── L'email du profil suit celui de Supabase Auth ────────────────
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.handle_user_email_change() from public, anon, authenticated;

-- ── Dernière connexion : modifiable par l'utilisateur sur son profil ──
grant update (last_login_at) on public.profiles to authenticated;

-- ── Choix du plan Free ───────────────────────────────────────────
-- Autorisé depuis « pending » ou « expired » uniquement. Refusé si le
-- compte est suspendu ou si un plan payant est encore en cours.
create or replace function public.choose_free_plan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sub public.subscriptions%rowtype;
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
    return; -- déjà sur Free
  end if;
  if v_sub.status in ('active', 'trial')
     and (v_sub.expires_at is null or v_sub.expires_at > now())
     and v_sub.plan_id is distinct from 'free' then
    raise exception 'Ton plan payant est encore en cours.' using errcode = 'P0001';
  end if;

  update public.subscriptions
     set plan_id = 'free', status = 'active', billing = null, expires_at = null, trial_ends_at = null
   where account_id = v_uid;
end;
$$;

revoke all on function public.choose_free_plan() from public, anon;
grant execute on function public.choose_free_plan() to authenticated;
comment on function public.choose_free_plan() is
  'Passe le compte connecté au plan Free (seule écriture d''abonnement permise à l''e-commerçant).';
