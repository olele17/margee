-- ══════════════════════════════════════════════════════════════════
-- 0004 · Données de référence : plans et paramètres de la plateforme
-- Les plans reprennent EXACTEMENT les valeurs de PLANS dans
-- src/services/api.js (Free 3 reçus, Pro 2 400 F / 30 reçus,
-- Elite 4 500 F illimité). Paiement annuel = 10 mois (calculé côté
-- code et côté Edge Function, pas stocké).
-- ══════════════════════════════════════════════════════════════════

insert into public.plans (id, name, price, old_price, duration_days, receipt_limit, highlight, features, is_active, sort_order)
values
  ('free',  'Free',  0,    null, null, 3,    false,
     '["3 reçus PDF pour tester", "Produits et coût de revient", "Ventes avec calcul du bénéfice", "Tableau de bord"]'::jsonb,
     true, 1),
  ('pro',   'Pro',   2400, null, 30,   30,   false,
     '["30 reçus PDF par mois", "Produits, ventes et marge", "Pubs dépensées et dépenses", "Investissements et ROI", "Comparaison mois par mois"]'::jsonb,
     true, 2),
  ('elite', 'Elite', 4500, null, 30,   null, true,
     '["Reçus PDF illimités", "Tout le plan Pro", "Reçus personnalisés : logo et signature", "Analyses de ton tableau de bord"]'::jsonb,
     true, 3)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, old_price = excluded.old_price,
  duration_days = excluded.duration_days, receipt_limit = excluded.receipt_limit,
  highlight = excluded.highlight, features = excluded.features,
  is_active = excluded.is_active, sort_order = excluded.sort_order;

insert into public.platform_settings (key, value, is_public)
values
  ('signup_open', 'true'::jsonb, true),   -- inscriptions ouvertes
  ('trial_days',  '7'::jsonb,    true),   -- réservé à un futur essai limité dans le temps
  ('annual_months_paid', '10'::jsonb, true)  -- paiement annuel = 10 mois (2 offerts)
on conflict (key) do nothing;
