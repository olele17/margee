-- ══════════════════════════════════════════════════════════════════
-- 0006 · Fonctions d'aide de sécurité déplacées dans un schéma privé
--
-- Alerte Supabase corrigée : is_admin, is_super_admin et
-- has_active_subscription (SECURITY DEFINER) étaient appelables via
-- l'API publique /rest/v1/rpc/... Le schéma "private" n'est pas exposé
-- par l'API. Les règles RLS référencent les fonctions par identifiant
-- interne : elles continuent de fonctionner après le déplacement.
-- ══════════════════════════════════════════════════════════════════

create schema if not exists private;
revoke all on schema private from public;
-- Le rôle "authenticated" doit pouvoir exécuter ces fonctions, car les
-- règles RLS sont évaluées avec ses droits.
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
alter function public.is_super_admin() set schema private;
alter function public.has_active_subscription() set schema private;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_super_admin() from public, anon;
revoke all on function private.has_active_subscription() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.has_active_subscription() to authenticated;

comment on schema private is 'Fonctions internes (non exposées par l''API Supabase).';

-- Paramètres publics : les visiteurs non connectés n'exécutent plus
-- is_admin(). Une règle pour eux (clés publiques seulement), une pour
-- les comptes connectés (clés publiques, ou tout pour un admin).
drop policy platform_settings_select_public on public.platform_settings;
create policy platform_settings_select_anon on public.platform_settings for select to anon
  using (is_public);
create policy platform_settings_select_auth on public.platform_settings for select to authenticated
  using (is_public or (select private.is_admin()));
