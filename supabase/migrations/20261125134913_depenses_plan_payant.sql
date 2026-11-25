-- ══════════════════════════════════════════════════════════════════
-- Dépenses et Investissements : réservés aux plans payants (Pro, Elite).
-- Un compte en essai Free peut lire ses éventuelles anciennes lignes,
-- mais pas en créer, modifier ni supprimer.
-- ══════════════════════════════════════════════════════════════════

-- Abonnement payant actif (plan au prix > 0, non expiré)
create or replace function private.has_paid_plan()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
     where s.account_id = (select auth.uid())
       and p.price > 0
       and s.status = 'active'
       and (s.expires_at is null or s.expires_at > now())
  );
$$;
revoke all on function private.has_paid_plan() from public, anon;
grant execute on function private.has_paid_plan() to authenticated;

alter policy expenses_insert_own on public.expenses
  with check ((account_id = (select auth.uid())) and (select private.has_paid_plan()));
alter policy expenses_update_own on public.expenses
  using ((account_id = (select auth.uid())) and (select private.has_paid_plan()))
  with check (account_id = (select auth.uid()));
alter policy expenses_delete_own on public.expenses
  using ((account_id = (select auth.uid())) and (select private.has_paid_plan()));

alter policy investments_insert_own on public.investments
  with check ((account_id = (select auth.uid())) and (select private.has_paid_plan()));
alter policy investments_update_own on public.investments
  using ((account_id = (select auth.uid())) and (select private.has_paid_plan()))
  with check (account_id = (select auth.uid()));
alter policy investments_delete_own on public.investments
  using ((account_id = (select auth.uid())) and (select private.has_paid_plan()));
