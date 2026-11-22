-- ══════════════════════════════════════════════════════════════════
-- 0021 · Couleurs du reçu personnalisables (Paramètres)
--
-- receipt_color_primary : bandeau du tableau (noir Margee+ par défaut)
-- receipt_color_accent  : bande « Total payé » (or Margee+ par défaut)
-- Format #RRGGBB (minuscules ou majuscules) ; null = couleurs Margee+.
-- Modifiables par l'e-commerçant sur son propre profil, comme le logo.
-- ══════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists receipt_color_primary text,
  add column if not exists receipt_color_accent  text;

alter table public.profiles
  add constraint profiles_receipt_color_primary_hex check (receipt_color_primary is null or receipt_color_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint profiles_receipt_color_accent_hex  check (receipt_color_accent  is null or receipt_color_accent  ~ '^#[0-9A-Fa-f]{6}$');

grant update (receipt_color_primary, receipt_color_accent) on public.profiles to authenticated;
