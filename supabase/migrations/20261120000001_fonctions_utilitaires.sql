-- ══════════════════════════════════════════════════════════════════
-- 0001 · Fonctions utilitaires communes
-- ══════════════════════════════════════════════════════════════════

-- Met à jour automatiquement la colonne updated_at à chaque UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger : met à jour updated_at à chaque modification de ligne.';
