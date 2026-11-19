export const fmt = (n) => Number(n || 0).toLocaleString('fr-FR') + ' Fr';
export const fmtN = (n) => Number(n || 0).toLocaleString('fr-FR');
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export function prevMonthKey(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const monthLabel = (m) => {
  const [y, mo] = m.split('-');
  const names = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
};

// Frais de livraison réellement à la charge du vendeur (non payés par le client)
export const selfPaidDelivery = (s) => (s.deliveryPaidByClient ? 0 : Number(s.deliveryCost || 0));

/**
 * CA du mois       = Σ (prix de vente × qté)
 * Coût produits     = Σ (coût de revient × qté)
 * Bénéfice brut     = CA − Coût produits
 * Bénéfice net      = Bénéfice brut − Pubs dépensées − Livraisons non payées par le client
 * ROI               = Bénéfice net cumulé / Argent investi cumulé
 */
export function computeStats(sales, ads, investments, month = null) {
  const inMonth = (dateStr) => !month || dateStr?.slice(0, 7) === month;

  const periodSales = sales.filter((s) => inMonth(s.date));
  const periodAds = ads.filter((a) => inMonth(a.date));

  const ca = periodSales.reduce((a, s) => a + s.qty * s.price, 0);
  const cost = periodSales.reduce((a, s) => a + s.qty * s.costPrice, 0);
  const grossProfit = ca - cost;
  const adSpend = periodAds.reduce((a, x) => a + Number(x.amount), 0);
  const deliveryCost = periodSales.reduce((a, s) => a + selfPaidDelivery(s), 0);
  const netProfit = grossProfit - adSpend - deliveryCost;
  const totalInvested = investments.reduce((a, i) => a + Number(i.amount), 0);
  const roi = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;

  return { ca, cost, grossProfit, adSpend, deliveryCost, netProfit, totalInvested, roi, nbSales: periodSales.length };
}

/**
 * Dépenses générales de l'entreprise, hors Pubs/Investissements déjà suivis
 * ailleurs — classées en Actif (garde/crée de la valeur, ex: matériel, stock)
 * ou Passif (charge consommée sans valeur durable, ex: loyer, taxes).
 */
export function computeExpenseStats(expenses, month = null) {
  const inMonth = (dateStr) => !month || dateStr?.slice(0, 7) === month;
  const period = expenses.filter((e) => inMonth(e.date));
  const actif = period.filter((e) => e.type === 'actif').reduce((a, e) => a + Number(e.amount), 0);
  const passif = period.filter((e) => e.type === 'passif').reduce((a, e) => a + Number(e.amount), 0);
  return { actif, passif, total: actif + passif, count: period.length };
}

export function groupExpensesByMonth(expenses) {
  const months = {};
  expenses.forEach((e) => {
    const m = e.date.slice(0, 7);
    months[m] = months[m] || { actif: 0, passif: 0, count: 0 };
    if (e.type === 'actif') months[m].actif += Number(e.amount);
    else months[m].passif += Number(e.amount);
    months[m].count += 1;
  });
  return months;
}

export function groupByMonth(sales, ads) {
  const months = {};
  sales.forEach((s) => {
    const m = s.date.slice(0, 7);
    months[m] = months[m] || { ca: 0, cost: 0, nb: 0, ads: 0, delivery: 0 };
    months[m].ca += s.qty * s.price;
    months[m].cost += s.qty * s.costPrice;
    months[m].nb += s.qty;
    months[m].delivery += selfPaidDelivery(s);
  });
  ads.forEach((a) => {
    const m = a.date.slice(0, 7);
    months[m] = months[m] || { ca: 0, cost: 0, nb: 0, ads: 0, delivery: 0 };
    months[m].ads += Number(a.amount);
  });
  return months;
}

/* ══════════════════════════════════════════════════════════════════
   CHALLENGES : objectifs suivis automatiquement
   La progression n'est jamais saisie : elle est recalculée à chaque
   affichage à partir des ventes et des pubs de la période.
   ══════════════════════════════════════════════════════════════════ */

export const CHALLENGE_TYPES = {
  ca: { label: "Chiffre d'affaires à atteindre", short: "Chiffre d'affaires", unit: 'money', icon: 'ti-cash-banknote' },
  profit: { label: 'Bénéfice à atteindre', short: 'Bénéfice', unit: 'money', icon: 'ti-trending-up' },
  sales_count: { label: 'Nombre de ventes', short: 'Ventes', unit: 'count', icon: 'ti-receipt' },
  product_units: { label: "Ventes d'un produit précis", short: 'Ventes du produit', unit: 'count', icon: 'ti-package' },
  ad_budget: { label: 'Budget pub à ne pas dépasser', short: 'Budget pub', unit: 'money', icon: 'ti-speakerphone' },
};

// Dates au format AAAA-MM-JJ (même référence que les ventes : today())
const _pad = (n) => String(n).padStart(2, '0');
const _iso = (d) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
const _parse = (s) => new Date(`${s}T00:00:00`);
export const daysBetweenIso = (a, b) => Math.round((_parse(b) - _parse(a)) / 86400000);

/** Raccourcis de période : semaine (lundi → dimanche) et mois (1er → dernier jour). */
export function periodPreset(kind, ref = today()) {
  const d = _parse(ref);
  if (kind === 'week') {
    const offset = (d.getDay() + 6) % 7; // lundi = 0
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { startDate: _iso(monday), endDate: _iso(sunday) };
  }
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { startDate: _iso(first), endDate: _iso(last) };
}

/**
 * Progression d'un challenge.
 * - ca            : Σ (prix × quantité) des ventes de la période
 * - profit        : bénéfice net, même calcul que le tableau de bord
 *                   (CA − coût de revient − pubs − livraisons à ta charge)
 * - sales_count   : nombre de ventes (1 vente = 1 reçu)
 * - product_units : pièces vendues du produit choisi
 * - ad_budget     : pubs dépensées ; réussir = rester sous la cible
 * Statut calculé : upcoming | ongoing | success | failed
 */
export function computeChallengeProgress(challenge, sales, ads, products = [], now = today()) {
  const { type, startDate, endDate } = challenge;
  const target = Number(challenge.target) || 0;
  const inPeriod = (date) => date >= startDate && date <= endDate;
  const periodSales = sales.filter((s) => inPeriod(s.date));
  const periodAds = ads.filter((a) => inPeriod(a.date));

  let realized = 0;
  let productMissing = false;
  if (type === 'ca') realized = periodSales.reduce((a, s) => a + s.qty * s.price, 0);
  else if (type === 'profit') realized = computeStats(periodSales, periodAds, []).netProfit;
  else if (type === 'sales_count') realized = periodSales.length;
  else if (type === 'product_units') {
    productMissing = !products.some((p) => p.id === challenge.productId);
    realized = periodSales.filter((s) => s.productId === challenge.productId).reduce((a, s) => a + Number(s.qty), 0);
  } else if (type === 'ad_budget') realized = periodAds.reduce((a, x) => a + Number(x.amount), 0);

  const isBudget = type === 'ad_budget';
  const started = now >= startDate;
  const ended = now > endDate;
  const reached = isBudget ? false : realized >= target;
  const overBudget = isBudget && realized > target;

  let status;
  if (!started) status = 'upcoming';
  else if (isBudget) status = overBudget ? 'failed' : ended ? 'success' : 'ongoing';
  else status = reached ? 'success' : ended ? 'failed' : 'ongoing';

  const percent = target > 0 ? Math.max(0, (realized / target) * 100) : 0;
  const remaining = isBudget ? target - realized : Math.max(target - realized, 0);
  // Jours restants, aujourd'hui compris (0 si la période est finie)
  const daysLeft = ended ? 0 : started ? daysBetweenIso(now, endDate) + 1 : daysBetweenIso(startDate, endDate) + 1;
  const daysUntilStart = started ? 0 : daysBetweenIso(now, startDate);
  const totalDays = daysBetweenIso(startDate, endDate) + 1;
  // Rythme nécessaire par jour pour réussir (ou dépense max par jour pour le budget)
  const perDay = daysLeft > 0 ? Math.max(remaining, 0) / daysLeft : 0;

  return {
    realized, target, percent, remaining, daysLeft, daysUntilStart, totalDays, perDay,
    status, isBudget, productMissing, unit: CHALLENGE_TYPES[type]?.unit || 'money',
  };
}
