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

/** Libellés des actions du journal (admin_audit_log.action) */
export const ACTION_LABELS = {
  'merchant.suspend': 'Compte suspendu',
  'merchant.reactivate': 'Compte réactivé',
  'merchant.change_plan': 'Plan changé',
  'merchant.extend_trial': 'Essai prolongé',
  'merchant.extend_subscription': 'Abonnement prolongé',
  'merchant.reset_password': 'Email de réinitialisation envoyé',
  'merchant.delete': 'Compte supprimé',
  'payment.manual_activate': 'Paiement activé manuellement',
  'subscription.from_payment': 'Abonnement activé par un paiement',
  'admin_notes.insert': 'Note interne ajoutée',
  'admin_notes.update': 'Note interne modifiée',
  'admin_notes.delete': 'Note interne supprimée',
  'account_flags.insert': 'Compte signalé',
  'account_flags.update': 'Signalement mis à jour',
  'account_flags.delete': 'Signalement supprimé',
  'subscriptions.update': 'Abonnement modifié',
  'subscriptions.insert': 'Abonnement créé',
  'plans.update': 'Plan modifié',
  'plan.update': 'Plan et tarif modifiés',
  'platform_settings.update': 'Paramètre modifié',
  'admins.insert': 'Admin ajouté',
  'admins.update': 'Rôle admin modifié',
  'admins.delete': 'Admin retiré',
};
/** Moyens de paiement Bictorys */
export const PAYMENT_METHODS = {
  wave_money: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money', maxit: 'Maxit',
  card: 'Carte bancaire', mtn_money: 'MTN Money', moov_money: 'Moov Money',
};
export const methodLabel = (m) => (m ? PAYMENT_METHODS[m] || m : '—');

export const actionLabel = (a) => ACTION_LABELS[a] || a;
