-- ══════════════════════════════════════════════════════════════════
-- Connexion Google :
--  · le nom vient du profil Google (full_name / name) ;
--  · le parrain est rattaché juste après le retour de Google
--    (claim_referral), car Google ne transmet pas le code « ref ».
-- ══════════════════════════════════════════════════════════════════

-- Rattache le compte connecté à un partenaire, une seule fois et
-- seulement dans l'heure qui suit la création du compte.
create or replace function public.claim_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_code text := upper(left(nullif(btrim(p_code), ''), 20));
begin
  if v_uid is null or v_code is null then return false; end if;
  select p.user_id into v_partner from public.partners p
   where p.code = v_code and p.disabled_at is null and p.user_id <> v_uid;
  if v_partner is null then return false; end if;
  update public.profiles set referred_by = v_partner
   where id = v_uid and referred_by is null and created_at > now() - interval '1 hour'
     and not exists (select 1 from public.admins a where a.user_id = v_uid);
  return found;
end;
$function$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

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
  v_ref text;
  v_referrer uuid;
begin
  select * into v_inv from public.merchant_invitations
   where email = lower(new.email) and expires_at > now();

  select coalesce((value)::boolean, true) into v_open
  from public.platform_settings where key = 'signup_open';
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

  -- Parrain : code d'un partenaire actif (jamais soi-même)
  v_ref := upper(left(nullif(btrim(v_meta ->> 'ref'), ''), 20));
  if v_ref is not null then
    select p.user_id into v_referrer from public.partners p
     where p.code = v_ref and p.disabled_at is null and p.user_id <> new.id;
  end if;

  v_business := nullif(btrim(v_meta ->> 'business_name'), '');
  insert into public.profiles (id, business_name, owner_name, phone, email, referred_by)
  values (
    new.id,
    left(coalesce(v_business, split_part(new.email, '@', 1), 'Ma boutique'), 120),
    left(coalesce(nullif(btrim(v_meta ->> 'owner_name'), ''), nullif(btrim(v_meta ->> 'full_name'), ''), nullif(btrim(v_meta ->> 'name'), '')), 120),
    left(nullif(btrim(v_meta ->> 'phone'), ''), 40),
    new.email,
    v_referrer
  );

  if v_inv.email is not null and v_inv.plan_id <> 'free' then
    insert into public.subscriptions (account_id, plan_id, billing, status, expires_at, trial_ends_at)
    values (new.id, v_inv.plan_id,
            case when coalesce(v_inv.days, 30) >= 365 then 'yearly' else 'monthly' end,
            'active', now() + make_interval(days => coalesce(v_inv.days, 30)), null);
  else
    insert into public.subscriptions (account_id, plan_id, status, trial_ends_at)
    values (new.id, 'free', 'trial', now() + make_interval(days => coalesce(v_inv.days, v_days)));
  end if;

  if v_inv.email is not null then
    delete from public.merchant_invitations where email = v_inv.email;
  end if;
  return new;
end;
$function$;

