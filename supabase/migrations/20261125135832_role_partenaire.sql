-- ══════════════════════════════════════════════════════════════════
-- Rôle « partenaire » : compte de l'équipe en LECTURE SEULE, qui ne voit
-- que des totaux (inscrits, abonnements, revenus) via partner_stats().
-- Il n'a AUCUN droit d'admin : private.is_admin() ne reconnaît plus que
-- super_admin et support (toutes les règles RLS et fonctions admin_*
-- passent par is_admin / is_super_admin).
-- Comme les autres membres de l'équipe, un partenaire est exclu des
-- statistiques des e-commerçants (filtre « not exists admins »).
-- ══════════════════════════════════════════════════════════════════

alter table public.admins drop constraint admins_role_check;
alter table public.admins add constraint admins_role_check
  check (role in ('super_admin', 'support', 'partner'));

alter table public.admin_invitations drop constraint admin_invitations_role_check;
alter table public.admin_invitations add constraint admin_invitations_role_check
  check (role in ('super_admin', 'support', 'partner'));

-- Admin = super_admin ou support uniquement (jamais partenaire)
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a
                  where a.user_id = (select auth.uid()) and a.disabled_at is null
                    and a.role in ('super_admin', 'support'));
$$;

-- Chaque membre (partenaire compris) peut lire SA ligne (pour connaître son rôle)
create policy admins_select_self on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Totaux pour le partenaire (et l'équipe) : aucun nom, aucun e-mail
create or replace function public.partner_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now_dkr timestamp := now() at time zone 'Africa/Dakar';
  v_month   timestamptz := (date_trunc('month', v_now_dkr)) at time zone 'Africa/Dakar';
  v_prev    timestamptz := (date_trunc('month', v_now_dkr) - interval '1 month') at time zone 'Africa/Dakar';
  v_result  jsonb;
begin
  if not exists (select 1 from public.admins a
                  where a.user_id = (select auth.uid()) and a.disabled_at is null
                    and a.role in ('super_admin', 'support', 'partner')) then
    raise exception 'Accès réservé aux partenaires de Margee+.' using errcode = '42501';
  end if;

  with merchants as (
    select p.id, p.created_at, s.plan_id, s.billing, s.trial_ends_at,
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
      coalesce(sum(amount) filter (where created_at >= v_prev and created_at < v_month), 0) as last_month,
      coalesce(sum(amount), 0) as total,
      count(*) as payments_count
      from public.payments where status = 'success'
  )
  select jsonb_build_object(
    'generated_at', now(),
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
