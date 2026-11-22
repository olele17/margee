-- ══════════════════════════════════════════════════════════════════
-- 0019 · Changement de plan payant : les jours restants sont gardés
--
-- Avant : passer de Pro à Elite démarrait Elite « maintenant » et les
-- jours de Pro déjà payés étaient perdus.
-- Maintenant : les jours restants de l'ancien plan payant sont convertis
-- au prorata des prix mensuels, puis ajoutés à la nouvelle période.
--   ex. 20 jours de Pro (2 400 F) → 20 × 2 400 / 4 500 = 10 jours d'Elite
--   (et dans l'autre sens, Elite → Pro donne plus de jours).
-- Même plan encore valide : prolongé à partir de la fin actuelle (inchangé).
-- ══════════════════════════════════════════════════════════════════

create or replace function private.apply_payment_to_subscription(p_payment_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay       public.payments%rowtype;
  v_sub       public.subscriptions%rowtype;
  v_days      integer;
  v_base      timestamptz;
  v_old_price bigint;
  v_new_price bigint;
  v_credit    integer := 0;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found or v_pay.status <> 'success' or v_pay.account_id is null then
    raise exception 'Paiement introuvable ou non réussi.' using errcode = 'P0002';
  end if;

  select * into v_sub from public.subscriptions where account_id = v_pay.account_id for update;
  if not found then
    insert into public.subscriptions (account_id) values (v_pay.account_id) returning * into v_sub;
  end if;

  if v_pay.billing = 'yearly' then
    v_days := 365;
  else
    select coalesce(p.duration_days, 30) into v_days from public.plans p where p.id = v_pay.plan_id;
    v_days := coalesce(v_days, 30);
  end if;

  if v_sub.plan_id = v_pay.plan_id and v_sub.status in ('active', 'suspended')
     and v_sub.expires_at is not null and v_sub.expires_at > now() then
    -- Même plan encore valide : on prolonge à partir de la fin actuelle
    v_base := v_sub.expires_at;
  else
    v_base := now();
    -- Autre plan payant encore valide : jours restants convertis au prorata
    if v_sub.plan_id is not null and v_sub.plan_id <> v_pay.plan_id
       and v_sub.status in ('active', 'suspended')
       and v_sub.expires_at is not null and v_sub.expires_at > now() then
      select price into v_old_price from public.plans where id = v_sub.plan_id;
      select price into v_new_price from public.plans where id = v_pay.plan_id;
      if coalesce(v_old_price, 0) > 0 and coalesce(v_new_price, 0) > 0 then
        v_credit := least(
          floor(extract(epoch from (v_sub.expires_at - now())) / 86400.0 * v_old_price / v_new_price)::integer,
          400);
      end if;
    end if;
  end if;

  update public.subscriptions
     set plan_id    = v_pay.plan_id,
         billing    = v_pay.billing,
         expires_at = v_base + make_interval(days => v_days + greatest(v_credit, 0)),
         status     = case when v_sub.status = 'suspended' then 'suspended' else 'active' end
   where account_id = v_pay.account_id
  returning * into v_sub;
  return v_sub;
end;
$$;
revoke all on function private.apply_payment_to_subscription(uuid) from public, anon, authenticated;
