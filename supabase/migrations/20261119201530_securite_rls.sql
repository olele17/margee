-- ══════════════════════════════════════════════════════════════════
-- 0005 · Sécurité : règles RLS (Row Level Security)
--
-- Principes :
--  • Un e-commerçant ne lit / écrit QUE les lignes où account_id = auth.uid().
--  • Écrire (créer, modifier, supprimer) exige un abonnement actif :
--    un compte expiré ou suspendu garde la LECTURE de ses données.
--  • Abonnements et paiements : lecture seule pour l'e-commerçant.
--    Seuls les admins et les Edge Functions (service_role, qui contourne
--    la RLS) y écrivent.
--  • Les ventes ne s'insèrent que via la fonction record_sale (étape 4),
--    qui copie les prix, numérote le reçu et applique le quota du plan.
--  • Confidentialité : AUCUNE règle admin sur notes et épargne. Même un
--    admin ne peut pas en lire le contenu.
-- auth.uid() est appelé via (select auth.uid()) : évalué une seule fois
-- par requête (recommandation Supabase pour les performances).
-- ══════════════════════════════════════════════════════════════════

-- ── FONCTIONS D'AIDE ─────────────────────────────────────────────
-- security definer : lisent leurs tables en contournant la RLS, mais ne
-- renvoient qu'un booléen sur l'utilisateur courant.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.role = 'super_admin');
$$;

-- Abonnement utilisable : actif (et non échu) ou essai en cours.
create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.account_id = (select auth.uid())
      and (
        (s.status = 'active' and (s.expires_at is null or s.expires_at > now()))
        or (s.status = 'trial' and s.trial_ends_at > now())
      )
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_super_admin() from public;
revoke all on function public.has_active_subscription() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_active_subscription() to authenticated;

-- ── TABLES MÉTIER : propriétaire uniquement ──────────────────────
-- Lecture : ses lignes. Écriture : ses lignes + abonnement actif.
-- with check empêche aussi de "déplacer" une ligne vers un autre compte.
do $$
declare
  t text;
begin
  foreach t in array array['products', 'ads', 'expenses', 'investments', 'notes', 'challenges', 'savings_pots', 'savings_moves']
  loop
    execute format($f$
      create policy %1$I on public.%2$I for select to authenticated
        using (account_id = (select auth.uid()));
    $f$, t || '_select_own', t);
    execute format($f$
      create policy %1$I on public.%2$I for insert to authenticated
        with check (account_id = (select auth.uid()) and (select public.has_active_subscription()));
    $f$, t || '_insert_own', t);
    execute format($f$
      create policy %1$I on public.%2$I for update to authenticated
        using (account_id = (select auth.uid()) and (select public.has_active_subscription()))
        with check (account_id = (select auth.uid()));
    $f$, t || '_update_own', t);
    execute format($f$
      create policy %1$I on public.%2$I for delete to authenticated
        using (account_id = (select auth.uid()) and (select public.has_active_subscription()));
    $f$, t || '_delete_own', t);
  end loop;
end $$;

-- ── VENTES ───────────────────────────────────────────────────────
-- Lecture et suppression de ses ventes. Pas d'INSERT direct (passe par
-- record_sale) ni d'UPDATE (une vente enregistrée ne se modifie pas).
create policy sales_select_own on public.sales for select to authenticated
  using (account_id = (select auth.uid()));
create policy sales_delete_own on public.sales for delete to authenticated
  using (account_id = (select auth.uid()) and (select public.has_active_subscription()));

-- ── COMPTEURS DE REÇUS ───────────────────────────────────────────
-- Aucune règle : accessibles uniquement par record_sale (security definer).

-- ── PROFILS ──────────────────────────────────────────────────────
-- Lecture : son profil (les admins lisent tous les profils pour la gestion).
-- Modification : son profil, et uniquement les colonnes autorisées.
-- Création : par le trigger d'inscription (étape 3), jamais par le client.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Droits par colonne : l'id, l'email (géré par Supabase Auth), la date de
-- dernière connexion et les dates techniques ne sont pas modifiables.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (
  business_name, owner_name, phone, savings_rule_percent,
  receipt_logo, receipt_address, receipt_city, receipt_note, receipt_email,
  receipt_signature_type, receipt_signature
) on public.profiles to authenticated;

-- ── ABONNEMENTS : lecture seule pour l'e-commerçant ──────────────
create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using (account_id = (select auth.uid()) or (select public.is_admin()));
create policy subscriptions_admin_update on public.subscriptions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ── PAIEMENTS : lecture seule ; écriture par les Edge Functions ──
create policy payments_select_own on public.payments for select to authenticated
  using (account_id = (select auth.uid()) or (select public.is_admin()));

-- Ceinture et bretelles : le client ne peut physiquement pas écrire ces tables.
revoke insert, update, delete on public.payments from anon, authenticated;
revoke insert, delete on public.subscriptions from anon, authenticated;
revoke update on public.subscriptions from anon;

-- ── PLANS : lecture publique ; écriture admins ───────────────────
create policy plans_select_public on public.plans for select to anon, authenticated
  using (true);
create policy plans_admin_insert on public.plans for insert to authenticated
  with check ((select public.is_super_admin()));
create policy plans_admin_update on public.plans for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- ── PARAMÈTRES : lecture publique des clés publiques ; écriture admins ──
create policy platform_settings_select_public on public.platform_settings for select to anon, authenticated
  using (is_public or (select public.is_admin()));
create policy platform_settings_admin_write on public.platform_settings for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- ── ADMINISTRATION : admins uniquement ───────────────────────────
create policy admins_select on public.admins for select to authenticated
  using ((select public.is_admin()));
create policy admins_super_write on public.admins for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

create policy admin_notes_admin_all on public.admin_notes for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and author_id = (select auth.uid()));

create policy account_flags_admin_all on public.account_flags for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ── Les visiteurs non connectés (anon) n'écrivent nulle part ─────
revoke insert, update, delete on all tables in schema public from anon;
