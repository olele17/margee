-- ══════════════════════════════════════════════════════════════════
-- 0010 · Essai gratuit
--
-- Décision produit : le plan Free devient un ESSAI de trial_days jours
-- (3 par défaut), démarré automatiquement à l'inscription. Ensuite il
-- faut passer à Pro ou Elite. La limite de 3 reçus du plan Free reste
-- appliquée pendant l'essai (fin au premier des deux).
-- Les comptes existants ne sont pas modifiés.
-- ══════════════════════════════════════════════════════════════════

update public.platform_settings set value = '3'::jsonb where key = 'trial_days';

update public.plans
   set features = '["Essai gratuit de 3 jours", "3 reçus PDF pour tester", "Produits et coût de revient", "Ventes avec calcul du bénéfice", "Tableau de bord"]'::jsonb
 where id = 'free';

-- Inscription : abonnement « trial » sur le plan Free
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
  if v_open is false then
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

-- choose_free_plan : démarre l'essai UNE seule fois (comptes « pending »
-- créés avant l'essai). Un essai déjà utilisé ne peut pas être relancé.
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
    return; -- ancien compte Free (avant l'essai) : inchangé
  end if;
  if v_sub.status = 'trial' and v_sub.trial_ends_at > now() then
    return; -- essai en cours
  end if;
  if v_sub.status = 'active' and v_sub.plan_id is distinct from 'free'
     and (v_sub.expires_at is null or v_sub.expires_at > now()) then
    raise exception 'Ton plan payant est encore en cours.' using errcode = 'P0001';
  end if;
  if v_sub.trial_ends_at is not null then
    raise exception 'Ton essai gratuit est terminé : choisis Pro ou Elite pour continuer.' using errcode = 'P0001';
  end if;

  select greatest(coalesce((value)::integer, 3), 1) into v_days
  from public.platform_settings where key = 'trial_days';
  update public.subscriptions
     set plan_id = 'free', status = 'trial', billing = null, expires_at = null,
         trial_ends_at = now() + make_interval(days => coalesce(v_days, 3))
   where account_id = v_uid;
end;
$$;
