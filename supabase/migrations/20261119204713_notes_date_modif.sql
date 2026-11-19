-- ══════════════════════════════════════════════════════════════════
-- 0009 · Notes : épingler ne change pas la date de modification
--
-- Comportement de l'app conservé : « Modifiée le … » ne bouge que si
-- le titre, le contenu, la catégorie ou le produit lié changent.
-- (create or replace trigger : aucune suppression)
-- ══════════════════════════════════════════════════════════════════

create or replace function public.set_notes_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.title, new.content, new.category, new.product_id)
     is distinct from (old.title, old.content, old.category, old.product_id) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create or replace trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_notes_updated_at();
