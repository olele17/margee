import { computeStats, fmt, thisMonth, prevMonthKey } from './calc';

/**
 * Génère des alertes/insights business à partir des vraies données du compte
 * (comparaison mois en cours vs mois précédent + quelques seuils simples).
 */
export function generateInsights(sales, ads, investments) {
  const cm = computeStats(sales, ads, investments, thisMonth());
  const pm = computeStats(sales, ads, investments, prevMonthKey(thisMonth()));
  const insights = [];

  const pct = (curr, prev) => (prev ? ((curr - prev) / prev) * 100 : null);

  const caPct = pct(cm.ca, pm.ca);
  if (caPct !== null && caPct <= -15) {
    insights.push({
      type: 'down',
      icon: 'ti-trending-down',
      title: `Le chiffre d'affaires a chuté de ${Math.abs(caPct).toFixed(0)}% ce mois`,
      detail: `${fmt(cm.ca)} ce mois contre ${fmt(pm.ca)} le mois dernier.`,
    });
  } else if (caPct !== null && caPct >= 15) {
    insights.push({
      type: 'up',
      icon: 'ti-trending-up',
      title: `Le chiffre d'affaires est en hausse de ${caPct.toFixed(0)}% ce mois`,
      detail: `${fmt(cm.ca)} ce mois contre ${fmt(pm.ca)} le mois dernier.`,
    });
  }

  const salesPct = pct(cm.nbSales, pm.nbSales);
  if (salesPct !== null && salesPct <= -20) {
    insights.push({
      type: 'down',
      icon: 'ti-arrow-down-right',
      title: 'Les ventes ralentissent',
      detail: `${cm.nbSales} vente(s) ce mois contre ${pm.nbSales} le mois dernier.`,
    });
  }

  const profitPct = pct(cm.netProfit, pm.netProfit);
  if (profitPct !== null && profitPct > 0) {
    insights.push({
      type: 'up',
      icon: 'ti-coin',
      title: `Le bénéfice net a augmenté de ${profitPct.toFixed(0)}% ce mois`,
      detail: `${fmt(cm.netProfit)} de bénéfice net ce mois-ci.`,
    });
  } else if (profitPct !== null && profitPct < 0) {
    insights.push({
      type: 'down',
      icon: 'ti-coin-off',
      title: `Le bénéfice net a baissé de ${Math.abs(profitPct).toFixed(0)}% ce mois`,
      detail: `${fmt(cm.netProfit)} de bénéfice net ce mois-ci.`,
    });
  }

  if (cm.ca > 0 && cm.adSpend > cm.ca * 0.5) {
    insights.push({
      type: 'warning',
      icon: 'ti-speakerphone',
      title: 'Dépenses pub élevées',
      detail: `Vos pubs représentent ${Math.round((cm.adSpend / cm.ca) * 100)}% de votre CA ce mois.`,
    });
  }

  const allTime = computeStats(sales, ads, investments);
  if (allTime.totalInvested > 0 && allTime.roi < 0) {
    insights.push({
      type: 'warning',
      icon: 'ti-alert-triangle',
      title: 'ROI négatif',
      detail: `Votre retour sur investissement global est de ${allTime.roi.toFixed(1)}%.`,
    });
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const salesThisWeek = sales.filter((s) => new Date(s.date) >= weekAgo).length;
  if (sales.length > 0 && salesThisWeek === 0) {
    insights.push({
      type: 'info',
      icon: 'ti-clock-exclamation',
      title: 'Aucune vente cette semaine',
      detail: "Pensez à relancer vos clients ou à booster vos pubs.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: 'info',
      icon: 'ti-check',
      title: 'Tout est stable',
      detail: "Aucune variation notable détectée sur votre activité.",
    });
  }

  return insights;
}

/**
 * Fil d'activité récent (dernières ventes, pubs, investissements réellement enregistrés).
 */
export function generateActivity(sales, ads, investments) {
  const items = [
    ...sales.map((s) => ({
      date: s.createdAt || s.date,
      icon: 'ti-receipt',
      title: `Vente : ${s.productName}`,
      detail: `${s.clientName || 'Client'} · ${fmt(s.qty * s.price)}`,
    })),
    ...ads.map((a) => ({
      date: a.date,
      icon: 'ti-speakerphone',
      title: `Pub ajoutée : ${a.platform || 'Plateforme'}`,
      detail: fmt(a.amount),
    })),
    ...investments.map((i) => ({
      date: i.date,
      icon: 'ti-building-bank',
      title: `Investissement : ${i.description}`,
      detail: fmt(i.amount),
    })),
  ];
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
}
