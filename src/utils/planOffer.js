/**
 * Offre d'abonnement à proposer à l'e-commerçant connecté (barre latérale,
 * Paramètres, page Abonnement). Une seule source pour toutes les pages.
 *
 *   plan Free (sans fin)  → Passer à Pro
 *   Pro actif             → Passer à Elite
 *   Elite actif           → Prolonger Elite
 *   plan payant expiré    → Renouveler le plan payant
 *
 * Seuls les plans actifs du catalogue (table plans) sont proposés.
 * Le changement de plan est décidé et appliqué côté serveur au paiement :
 * les jours restants d'un plan payant sont convertis au prorata.
 */
const DAY = 86400000;

export function getPlanOffer(account, catalog) {
  const sub = account?.subscription || {};
  const plans = catalog?.plans || {};
  const all = catalog?.all || {};
  const now = Date.now();
  const current = sub.plan || null;
  const currentPlan = current ? all[current] : null;
  const paid = !!currentPlan && currentPlan.price > 0;
  // Plan Free : jamais expiré (seule limite : les 3 essais)
  const trialActive = sub.status === 'trial';
  const paidActive = sub.status === 'active' && paid && (!sub.expiresAt || new Date(sub.expiresAt).getTime() > now);
  const legacyFree = sub.status === 'active' && current === 'free';
  const endsAt = paidActive ? sub.expiresAt : null;
  const daysLeft = endsAt ? Math.max(Math.ceil((new Date(endsAt).getTime() - now) / DAY), 0) : null;

  // Plans payants proposés, du moins cher au plus cher
  const paidKeys = Object.entries(plans).filter(([, p]) => p.price > 0).sort((a, b) => a[1].price - b[1].price).map(([k]) => k);
  const higher = paid ? paidKeys.filter((k) => plans[k].price > currentPlan.price) : paidKeys;

  let action = null;
  if (trialActive || legacyFree) {
    if (paidKeys[0]) action = { plan: paidKeys[0], label: `Passer à ${plans[paidKeys[0]].label}`, kind: 'upgrade' };
  } else if (paidActive) {
    if (higher[0]) action = { plan: higher[0], label: `Passer à ${plans[higher[0]].label}`, kind: 'upgrade' };
    else if (plans[current]) action = { plan: current, label: `Prolonger ${currentPlan.label}`, kind: 'renew' };
  } else if (sub.status !== 'suspended') {
    const target = paid && plans[current] ? current : paidKeys[0];
    if (target) action = { plan: target, label: paid ? `Renouveler ${plans[target].label}` : 'Choisir un plan', kind: 'renew' };
  }

  return {
    current,
    currentLabel: currentPlan?.label || null,
    paid,
    paidActive,
    trialActive,
    endsAt,
    daysLeft,
    expired: !trialActive && !paidActive && !legacyFree && sub.status !== 'suspended',
    action,
    href: action ? `/abonnement?plan=${action.plan}` : '/abonnement',
  };
}
