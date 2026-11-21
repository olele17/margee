/**
 * Formats de l'espace admin : montants en F CFA avec une espace comme
 * séparateur de milliers (2 900 F), dates en français à l'heure de Dakar.
 */
const TZ = 'Africa/Dakar';

/** 2900 → « 2 900 F » */
export function fcfa(n) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${v < 0 ? '−' : ''}${s} F`;
}

/** 1234 → « 1 234 » */
export function num(n) {
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** « 21 nov. 2026 » */
export function dateFr(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}

/** « 21 nov. 2026, 14:05 » */
export function dateTimeFr(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** « 21/11 » (axes de graphique) */
export function dayShort(value) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
}

/** Jours restants avant une date (négatif si dépassée) */
export function daysUntil(value) {
  if (!value) return null;
  return Math.ceil((new Date(value) - new Date()) / 86400000);
}

export const PLAN_LABELS = { free: 'Free', pro: 'Pro', elite: 'Elite' };
