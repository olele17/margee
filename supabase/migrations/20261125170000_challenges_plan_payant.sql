-- ══════════════════════════════════════════════════════════════════
-- Challenges : réservés aux plans payants (Pro, Elite), comme les
-- dépenses et les investissements. Lecture des anciens challenges
-- conservée ; création, modification et suppression refusées en Free.
-- ══════════════════════════════════════════════════════════════════
alter policy challenges_insert_own on public.challenges
  with check ((account_id = (select auth.uid())) and (select private.has_paid_plan()));
alter policy challenges_update_own on public.challenges
  using ((account_id = (select auth.uid())) and (select private.has_paid_plan()))
  with check (account_id = (select auth.uid()));
alter policy challenges_delete_own on public.challenges
  using ((account_id = (select auth.uid())) and (select private.has_paid_plan()));
