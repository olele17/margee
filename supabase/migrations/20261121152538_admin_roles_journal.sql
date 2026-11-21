-- ══════════════════════════════════════════════════════════════════
-- 0011 · Admin : rôles et journal d'activité
--
-- Rôles (table admins) :
--   super_admin : tout.
--   support     : lecture, notes internes, signalements, prolonger un
--                 essai. Pas de suppression, de prix, de paramètres
--                 plateforme ni de gestion de l'équipe.
-- Ces règles sont appliquées PAR LA BASE (fonctions admin_* et RLS) ;
-- src/admin/permissions.js reprend les mêmes pour l'affichage.
--
-- Journal admin_audit_log : alimenté automatiquement par des triggers
-- dès qu'un admin modifie une table sensible. Lecture seule pour tous :
-- aucune écriture possible depuis l'API, même pour un super_admin.
-- Le motif d'une action est transmis par les fonctions admin_* via le
-- réglage de transaction « margee.audit_reason ».
-- ══════════════════════════════════════════════════════════════════

-- ── Rôle de l'utilisateur courant (null si non admin) ────────────
create or replace function private.admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role from public.admins a where a.user_id = (select auth.uid());
$$;
revoke all on function private.admin_role() from public, anon;
grant execute on function private.admin_role() to authenticated;

-- ── Journal d'activité ───────────────────────────────────────────
create table public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references auth.users (id) on delete set null,
  admin_email  text,                          -- conservé si l'admin est supprimé
  action       text not null,
  account_id   uuid,                          -- pas de clé étrangère : l'entrée reste après suppression du compte
  before       jsonb,
  after        jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_account_idx on public.admin_audit_log (account_id, created_at desc);
create index admin_audit_log_admin_idx on public.admin_audit_log (admin_id, created_at desc);

alter table public.admin_audit_log enable row level security;
create policy admin_audit_log_select_admins on public.admin_audit_log for select to authenticated
  using ((select private.is_admin()));
-- Lecture seule pour tous : aucune écriture via l'API
revoke insert, update, delete, truncate on public.admin_audit_log from public, anon, authenticated;

-- Ajout d'une entrée (utilisé par les triggers et les fonctions admin)
create or replace function private.write_audit(
  p_action text, p_account_id uuid, p_before jsonb, p_after jsonb, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (admin_id, admin_email, action, account_id, before, after, reason)
  values (
    (select auth.uid()),
    (select u.email from auth.users u where u.id = (select auth.uid())),
    p_action, p_account_id, p_before, p_after,
    coalesce(p_reason, nullif(current_setting('margee.audit_reason', true), ''))
  );
end;
$$;
revoke all on function private.write_audit(text, uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- Trigger générique : journalise toute modification faite par un admin
create or replace function private.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     jsonb := to_jsonb(coalesce(new, old));
  v_account uuid;
  v_action  text;
begin
  if not private.is_admin() then
    return coalesce(new, old); -- seules les actions d'admin sont journalisées
  end if;
  v_account := coalesce(
    (v_row ->> 'account_id')::uuid,
    case when tg_table_name = 'admins' then (v_row ->> 'user_id')::uuid end
  );
  v_action := coalesce(nullif(current_setting('margee.audit_action', true), ''), tg_table_name || '.' || lower(tg_op));
  perform private.write_audit(
    v_action, v_account,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;
revoke all on function private.audit_admin_change() from public, anon, authenticated;

create trigger audit_subscriptions after insert or update or delete on public.subscriptions
  for each row execute function private.audit_admin_change();
create trigger audit_plans after insert or update or delete on public.plans
  for each row execute function private.audit_admin_change();
create trigger audit_platform_settings after insert or update or delete on public.platform_settings
  for each row execute function private.audit_admin_change();
create trigger audit_admins after insert or update or delete on public.admins
  for each row execute function private.audit_admin_change();
create trigger audit_admin_notes after insert or update or delete on public.admin_notes
  for each row execute function private.audit_admin_change();
create trigger audit_account_flags after insert or update or delete on public.account_flags
  for each row execute function private.audit_admin_change();

-- ── Écritures sensibles : uniquement via les fonctions admin_* ───
-- (elles vérifient le rôle et exigent un motif). Les notes internes et
-- les signalements restent modifiables directement par tout admin (RLS).
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.plans from authenticated;
revoke insert, update, delete on public.platform_settings from authenticated;
revoke insert, update, delete on public.admins from authenticated;

comment on table public.admin_audit_log is
  'Journal des actions admin (lecture seule, alimenté par triggers et fonctions admin_*).';
