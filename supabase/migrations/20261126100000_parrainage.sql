-- ══════════════════════════════════════════════════════════════════
-- Parrainage : chaque partenaire a un lien (code). Les comptes créés
-- via ce lien sont rattachés à lui (profiles.referred_by), et son
-- tableau ne montre QUE ces comptes. L'équipe garde la vue globale.
-- Toujours des totaux : aucun nom, aucun e-mail.
-- ══════════════════════════════════════════════════════════════════

-- ── Code de parrainage du partenaire ──────────────────────────────
create or replace function private.new_partner_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v text;
begin
  loop
    v := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.partners where code = v);
  end loop;
  return v;
end;
$$;
revoke all on function private.new_partner_code() from public, anon, authenticated;

alter table public.partners add column code text;
update public.partners set code = private.new_partner_code() where code is null;
alter table public.partners alter column code set not null;
alter table public.partners add constraint partners_code_key unique (code);
alter table public.partners add constraint partners_code_format check (code ~ '^[A-Z0-9]{4,20}$');

create or replace function private.partners_set_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code is null then new.code := private.new_partner_code(); end if;
  return new;
end;
$$;
revoke all on function private.partners_set_code() from public, anon, authenticated;
create trigger partners_set_code before insert on public.partners
  for each row execute function private.partners_set_code();

-- ── Parrain du compte (fixé à l'inscription, non modifiable) ──────
-- Les e-commerçants ne peuvent modifier que des colonnes listées :
-- referred_by n'en fait pas partie.
alter table public.profiles add column referred_by uuid references auth.users(id) on delete set null;
create index profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;

-- ── Inscription : lit le code « ref » transmis par le lien ────────
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
    left(nullif(btrim(v_meta ->> 'owner_name'), ''), 120),
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

-- ── partner_stats : partenaire = ses filleuls ; équipe = tout ─────
create or replace function public.partner_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid     uuid := auth.uid();
  v_global  boolean := private.is_admin();
  v_code    text;
  v_now_dkr timestamp := now() at time zone 'Africa/Dakar';
  v_month   timestamptz := (date_trunc('month', v_now_dkr)) at time zone 'Africa/Dakar';
  v_prev    timestamptz := (date_trunc('month', v_now_dkr) - interval '1 month') at time zone 'Africa/Dakar';
  v_result  jsonb;
begin
  if not (v_global or private.is_partner()) then
    raise exception 'Accès réservé aux partenaires de Margee+.' using errcode = '42501';
  end if;
  if not v_global then
    select code into v_code from public.partners where user_id = v_uid;
  end if;

  with merchants as (
    select p.id, p.created_at, s.plan_id, s.billing, s.trial_ends_at,
           private.effective_status(s.status, s.trial_ends_at, s.expires_at) as eff
      from public.profiles p
      left join public.subscriptions s on s.account_id = p.id
     where not exists (select 1 from public.admins a where a.user_id = p.id)
       and (v_global or p.referred_by = v_uid)
  ),
  pays as (
    select pa.account_id, pa.amount, pa.created_at
      from public.payments pa
     where pa.status = 'success'
       and (v_global or pa.account_id in (select id from merchants))
  ),
  paid as (
    select distinct account_id from pays where account_id is not null
  ),
  rev as (
    select
      coalesce(sum(amount) filter (where created_at >= v_month), 0) as this_month,
      coalesce(sum(amount) filter (where created_at >= v_prev and created_at < v_month), 0) as last_month,
      coalesce(sum(amount), 0) as total,
      count(*) as payments_count
      from pays
  )
  select jsonb_build_object(
    'generated_at', now(),
    'scope', case when v_global then 'global' else 'referrals' end,
    'referral_code', v_code,
    'signups', jsonb_build_object(
      'total',      (select count(*) from merchants),
      'this_month', (select count(*) from merchants where created_at >= v_month),
      'last_month', (select count(*) from merchants where created_at >= v_prev and created_at < v_month)
    ),
    'counts', jsonb_build_object(
      'trial',     (select count(*) from merchants where eff = 'trial'),
      'active',    (select count(*) from merchants where eff = 'active'),
      'expired',   (select count(*) from merchants where eff = 'expired'),
      'suspended', (select count(*) from merchants where eff = 'suspended')
    ),
    'by_plan', (
      select jsonb_build_object(
        'free',  count(*) filter (where plan_id = 'free'  and eff in ('trial', 'active')),
        'pro',   count(*) filter (where plan_id = 'pro'   and eff = 'active'),
        'elite', count(*) filter (where plan_id = 'elite' and eff = 'active')
      ) from merchants
    ),
    'mrr', (
      select coalesce(sum(case when m.billing = 'yearly' then round(pl.price * 10 / 12.0) else pl.price end), 0)::bigint
        from merchants m join public.plans pl on pl.id = m.plan_id
       where m.eff = 'active' and pl.price > 0
    ),
    'revenue', (
      select jsonb_build_object(
        'this_month', r.this_month, 'last_month', r.last_month, 'total', r.total,
        'payments_count', r.payments_count,
        'change_percent', case when r.last_month = 0 then null
          else round(100.0 * (r.this_month - r.last_month) / r.last_month, 1) end
      ) from rev r
    ),
    'signups_30_days', (
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(c.n, 0)) order by d)
        from generate_series(v_now_dkr::date - 29, v_now_dkr::date, interval '1 day') d
        left join (
          select (created_at at time zone 'Africa/Dakar')::date as day, count(*) as n
            from merchants group by 1
        ) c on c.day = d::date
    ),
    'conversion', (
      select jsonb_build_object(
        'trials', count(*),
        'converted', count(*) filter (where m.id in (select account_id from paid)),
        'rate_percent', case when count(*) = 0 then 0
          else round(100.0 * count(*) filter (where m.id in (select account_id from paid)) / count(*), 1) end
      ) from merchants m where m.trial_ends_at is not null
    )
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.partner_stats() from public, anon;
grant execute on function public.partner_stats() to authenticated;

-- ── Liste des partenaires (équipe) : code + totaux des filleuls ───
create or replace function public.admin_list_partners()
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
        select pa.user_id, pa.code, pa.created_at, pa.disabled_at, u.email, pr.business_name,
               u.last_sign_in_at, (u.last_sign_in_at is null) as invited,
               ib.email as invited_by_email,
               (select count(*) from public.profiles f where f.referred_by = pa.user_id) as referrals,
               (select count(*) from public.profiles f
                  join public.subscriptions s on s.account_id = f.id
                  join public.plans pl on pl.id = s.plan_id
                 where f.referred_by = pa.user_id and pl.price > 0
                   and private.effective_status(s.status, s.trial_ends_at, s.expires_at) = 'active') as referrals_paid,
               (select coalesce(sum(py.amount), 0) from public.payments py
                  join public.profiles f on f.id = py.account_id
                 where f.referred_by = pa.user_id and py.status = 'success') as referrals_revenue
          from public.partners pa
          join auth.users u on u.id = pa.user_id
          left join public.profiles pr on pr.id = pa.user_id
          left join auth.users ib on ib.id = pa.invited_by
      ) x
  ), '[]'::jsonb);
end;
$function$;
revoke all on function public.admin_list_partners() from public, anon;
grant execute on function public.admin_list_partners() to authenticated;
