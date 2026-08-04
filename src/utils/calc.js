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
