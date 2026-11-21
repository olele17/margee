-- ══════════════════════════════════════════════════════════════════
-- 0012 · Admin : vue d'ensemble
--
-- private.effective_status : statut RÉEL d'un abonnement (un essai ou
-- un abonnement dont la date est dépassée compte comme « expired »).
-- admin_overview() : tout ce que la page /admin affiche, en un appel.
-- Réservée aux admins (super_admin et support). Les comptes admins sont
-- exclus des chiffres. Aucune donnée des clients des e-commerçants.
-- Fuseau horaire de référence : Africa/Dakar.
-- ══════════════════════════════════════════════════════════════════

create or replace function private.effective_status(p_status text, p_trial_ends_at timestamptz, p_expires_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'suspended' then 'suspended'
    when p_status = 'trial' and (p_trial_ends_at is null or p_trial_ends_at <= now()) then 'expired'
    when p_status = 'active' and p_expires_at is not null and p_expires_at <= now() then 'expired'
    else coalesce(p_status, 'pending')
  end;
$$;
revoke all on function private.effective_status(text, timestamptz, timestamptz) from public, anon;
grant execute on function private.effective_status(text, timestamptz, timestamptz) to authenticated;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now_dkr timestamp := now() at time zone 'Africa/Dakar';
  v_month   timestamptz := (date_trunc('month', v_now_dkr)) at time zone 'Africa/Dakar';
  v_prev    timestamptz := (date_trunc('month', v_now_dkr) - interval '1 month') at time zone 'Africa/Dakar';
  v_result  jsonb;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;

  with merchants as (
    select p.id, p.business_name, p.email, p.created_at,
           s.status, s.plan_id, s.billing, s.trial_ends_at, s.expires_at,
           private.effective_status(s.status, s.trial_ends_at, s.expires_at) as eff
      from public.profiles p
      left join public.subscriptions s on s.account_id = p.id
     where not exists (select 1 from public.admins a where a.user_id = p.id)
  ),
  paid as (
    select distinct account_id from public.payments where status = 'success' and account_id is not null
  ),
  rev as (
    select
      coalesce(sum(amount) filter (where created_at >= v_month), 0) as this_month,
      coalesce(sum(amount) filter (where created_at >= v_prev and created_at < v_month), 0) as last_month
      from public.payments where status = 'success'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'counts', jsonb_build_object(
      'total',     (select count(*) from merchants),
      'trial',     (select count(*) from merchants where eff = 'trial'),
      'active',    (select count(*) from merchants where eff = 'active'),
      'expired',   (select count(*) from merchants where eff = 'expired'),
      'suspended', (select count(*) from merchants where eff = 'suspended'),
      'pending',   (select count(*) from merchants where eff = 'pending')
    ),
    'mrr', (
      select coalesce(sum(case when m.billing = 'yearly' then round(pl.price * 10 / 12.0) else pl.price end), 0)::bigint
        from merchants m join public.plans pl on pl.id = m.plan_id
       where m.eff = 'active' and pl.price > 0
    ),
    'revenue', (
      select jsonb_build_object(
        'this_month', r.this_month,
        'last_month', r.last_month,
        'change_percent', case when r.last_month = 0 then null
          else round(100.0 * (r.this_month - r.last_month) / r.last_month, 1) end
      ) from rev r
    ),
    'by_plan', (
      select jsonb_build_object(
        'free',  count(*) filter (where plan_id = 'free'  and eff in ('trial', 'active')),
        'pro',   count(*) filter (where plan_id = 'pro'   and eff = 'active'),
        'elite', count(*) filter (where plan_id = 'elite' and eff = 'active')
      ) from merchants
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
    ),
    'expiring_7_days', (
      select coalesce(jsonb_agg(x order by x.ends_at), '[]'::jsonb) from (
        select m.id as account_id, m.business_name, m.email, m.plan_id, m.eff as status,
               case when m.eff = 'trial' then m.trial_ends_at else m.expires_at end as ends_at
          from merchants m
         where (m.eff = 'trial'  and m.trial_ends_at <= now() + interval '7 days')
            or (m.eff = 'active' and m.expires_at is not null and m.expires_at <= now() + interval '7 days')
         limit 50
      ) x
    ),
    'last_payments', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select pa.id, pa.created_at, pa.amount, pa.status, pa.plan_id, pa.billing, pa.provider_ref,
               pa.account_id, p.business_name
          from public.payments pa left join public.profiles p on p.id = pa.account_id
         order by pa.created_at desc limit 10
      ) x
    ),
    'failed_payments', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select pa.id, pa.created_at, pa.amount, pa.plan_id, pa.provider_ref, pa.account_id, p.business_name
          from public.payments pa left join public.profiles p on p.id = pa.account_id
         where pa.status = 'failed' and pa.created_at >= now() - interval '30 days'
         order by pa.created_at desc limit 10
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
