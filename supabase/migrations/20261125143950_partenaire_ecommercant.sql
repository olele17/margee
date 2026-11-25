-- ══════════════════════════════════════════════════════════════════
-- Accès partenaire = un DROIT EN PLUS sur un compte normal (et non plus
-- un rôle de l'équipe) : un e-commerçant peut être partenaire tout en
-- gardant sa boutique, son abonnement et la messagerie support.
-- Le partenaire n'a aucun droit d'admin : il ne lit que partner_stats().
-- ══════════════════════════════════════════════════════════════════
create table public.partners (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  disabled_at timestamptz
);
alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;
grant select on public.partners to authenticated;
create policy partners_select_self on public.partners
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- (Aucun partenaire « équipe » n'existait dans admins : rien à déplacer.)

create or replace function private.is_partner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.partners p
                  where p.user_id = (select auth.uid()) and p.disabled_at is null);
$$;
revoke all on function private.is_partner() from public, anon;
grant execute on function private.is_partner() to authenticated;

-- Le compte connecté a-t-il le tableau partenaire ?
create or replace function public.my_partner_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.is_partner() or private.is_admin(); $$;
revoke all on function public.my_partner_access() from public, anon;
grant execute on function public.my_partner_access() to authenticated;

-- partner_stats : partenaires + équipe (super admin, support)
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
  if not (private.is_admin() or private.is_partner()) then
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

-- ── Gestion par le super admin ────────────────────────────────────
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
        select pa.user_id, pa.created_at, pa.disabled_at, u.email, pr.business_name,
               u.last_sign_in_at, (u.last_sign_in_at is null) as invited,
               ib.email as invited_by_email
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

create or replace function public.admin_set_partner_disabled(p_user_id uuid, p_disabled boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text;
  v_row    public.partners%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);
  select * into v_row from public.partners where user_id = p_user_id for update;
  if not found then
    raise exception 'Partenaire introuvable.' using errcode = 'P0002';
  end if;
  if (v_row.disabled_at is not null) = coalesce(p_disabled, false) then
    raise exception 'Cet accès est déjà %.', case when p_disabled then 'retiré' else 'actif' end using errcode = 'P0001';
  end if;
  update public.partners set disabled_at = case when p_disabled then now() else null end where user_id = p_user_id;
  perform private.write_audit(
    case when p_disabled then 'partner.disable' else 'partner.enable' end, p_user_id,
    jsonb_build_object('disabled_at', v_row.disabled_at),
    jsonb_build_object('disabled', p_disabled), v_reason);
  return jsonb_build_object('user_id', p_user_id, 'disabled', p_disabled);
end;
$function$;
revoke all on function public.admin_set_partner_disabled(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_partner_disabled(uuid, boolean, text) to authenticated;
