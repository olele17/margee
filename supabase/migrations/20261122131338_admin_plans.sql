-- ══════════════════════════════════════════════════════════════════
-- 0015 · Admin : plans et tarifs (super_admin)
--
-- admin_update_plan modifie : nom, prix mensuel, prix barré, durée,
-- avantages, ordre d'affichage, mise en avant, actif / inactif.
-- Motif obligatoire ; le trigger audit_plans écrit le journal
-- (action « plan.update », avant / après).
--
-- Les abonnements en cours ne changent pas :
--   - le prix ne sert qu'aux NOUVEAUX paiements (checkout_create_payment) ;
--   - la durée n'est appliquée qu'au moment d'un paiement ;
--   - la limite de reçus (receipt_limit) n'est PAS modifiable ici, car
--     record_sale la lit en direct : la changer toucherait les abonnés.
-- Free : toujours gratuit et toujours actif (l'essai est réglé par
-- trial_days dans les paramètres). Il reste au moins un plan payant actif.
-- ══════════════════════════════════════════════════════════════════

create or replace function public.admin_update_plan(
  p_id text,
  p_name text,
  p_price bigint,
  p_old_price bigint,
  p_duration_days integer,
  p_features jsonb,
  p_sort_order integer,
  p_highlight boolean,
  p_is_active boolean,
  p_reason text
)
returns public.plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason   text;
  v_plan     public.plans%rowtype;
  v_name     text := btrim(coalesce(p_name, ''));
  v_features jsonb;
  v_item     jsonb;
  v_free     boolean;
begin
  if not private.is_super_admin() then
    raise exception 'Action réservée au super admin.' using errcode = '42501';
  end if;
  v_reason := private.admin_check_reason(p_reason);

  select * into v_plan from public.plans where id = p_id for update;
  if not found then
    raise exception 'Plan introuvable.' using errcode = 'P0002';
  end if;
  v_free := v_plan.price = 0;

  -- Nom
  if char_length(v_name) < 2 or char_length(v_name) > 30 then
    raise exception 'Le nom du plan doit faire entre 2 et 30 caractères.' using errcode = '22023';
  end if;

  -- Prix
  if v_free then
    if coalesce(p_price, 0) <> 0 or p_old_price is not null then
      raise exception 'Le plan Free reste gratuit : pas de prix ni de prix barré.' using errcode = '22023';
    end if;
    if p_is_active is distinct from true then
      raise exception 'Le plan Free ne peut pas être désactivé : il porte l''essai gratuit des nouveaux inscrits.' using errcode = '22023';
    end if;
  else
    if p_price is null or p_price < 100 or p_price > 10000000 then
      raise exception 'Prix invalide : entre 100 F et 10 000 000 F par mois.' using errcode = '22023';
    end if;
    if p_old_price is not null and (p_old_price <= p_price or p_old_price > 10000000) then
      raise exception 'Le prix barré doit être plus élevé que le prix.' using errcode = '22023';
    end if;
  end if;

  -- Durée (plans payants seulement)
  if v_free then
    if p_duration_days is not null then
      raise exception 'Le plan Free n''a pas de durée : l''essai se règle dans les paramètres.' using errcode = '22023';
    end if;
  elsif p_duration_days is null or p_duration_days < 1 or p_duration_days > 366 then
    raise exception 'Durée invalide : entre 1 et 366 jours.' using errcode = '22023';
  end if;

  -- Avantages : 1 à 12 lignes de 2 à 120 caractères
  if p_features is null or jsonb_typeof(p_features) <> 'array'
     or jsonb_array_length(p_features) < 1 or jsonb_array_length(p_features) > 12 then
    raise exception 'Indique entre 1 et 12 avantages.' using errcode = '22023';
  end if;
  v_features := '[]'::jsonb;
  for v_item in select * from jsonb_array_elements(p_features) loop
    if jsonb_typeof(v_item) <> 'string'
       or char_length(btrim(v_item #>> '{}')) < 2 or char_length(btrim(v_item #>> '{}')) > 120 then
      raise exception 'Chaque avantage doit faire entre 2 et 120 caractères.' using errcode = '22023';
    end if;
    v_features := v_features || to_jsonb(btrim(v_item #>> '{}'));
  end loop;

  -- Ordre d'affichage
  if p_sort_order is null or p_sort_order < 0 or p_sort_order > 99 then
    raise exception 'Ordre d''affichage invalide : entre 0 et 99.' using errcode = '22023';
  end if;

  -- Au moins un plan payant actif
  if not v_free and v_plan.is_active and p_is_active is distinct from true
     and not exists (select 1 from public.plans where price > 0 and is_active and id <> p_id) then
    raise exception 'Impossible de désactiver le dernier plan payant actif.' using errcode = 'P0001';
  end if;

  perform private.admin_audit_context('plan.update', v_reason);
  update public.plans
     set name = v_name,
         price = coalesce(p_price, 0),
         old_price = p_old_price,
         duration_days = p_duration_days,
         features = v_features,
         sort_order = p_sort_order,
         highlight = coalesce(p_highlight, false),
         is_active = coalesce(p_is_active, true)
   where id = p_id
  returning * into v_plan;
  return v_plan;
end;
$$;
revoke all on function public.admin_update_plan(text, text, bigint, bigint, integer, jsonb, integer, boolean, boolean, text) from public, anon;
grant execute on function public.admin_update_plan(text, text, bigint, bigint, integer, jsonb, integer, boolean, boolean, text) to authenticated;

-- Nombre d'abonnés par plan (affiché dans l'admin, tout admin)
create or replace function public.admin_plan_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(plan_id, n)
      from (
        select s.plan_id, count(*) as n
          from public.subscriptions s
         where s.plan_id is not null
           and private.effective_status(s.status, s.trial_ends_at, s.expires_at) in ('active', 'trial')
           and not exists (select 1 from public.admins a where a.user_id = s.account_id)
         group by s.plan_id
      ) t
  ), '{}'::jsonb);
end;
$$;
revoke all on function public.admin_plan_stats() from public, anon;
grant execute on function public.admin_plan_stats() to authenticated;
