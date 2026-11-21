/**
 * Badges de statut de l'admin (classes .badge de global.css, couleurs
 * de la palette existante).
 */
const SUBSCRIPTION = {
  active: { label: 'Actif', cls: 'ok', icon: 'ti-circle-check' },
  trial: { label: 'Essai', cls: 'pending', icon: 'ti-hourglass' },
  expired: { label: 'Expiré', cls: 'off', icon: 'ti-clock-x' },
  suspended: { label: 'Suspendu', cls: 'dark', icon: 'ti-ban' },
  pending: { label: 'En attente', cls: 'progress', icon: 'ti-dots' },
};

const PAYMENT = {
  success: { label: 'Réussi', cls: 'ok', icon: 'ti-circle-check' },
  pending: { label: 'En attente', cls: 'pending', icon: 'ti-hourglass' },
  failed: { label: 'Échoué', cls: 'off', icon: 'ti-alert-triangle' },
};

export function SubscriptionBadge({ status }) {
  const s = SUBSCRIPTION[status] || { label: status || '—', cls: 'progress', icon: 'ti-point' };
  return <span className={`badge ${s.cls}`}><i className={`ti ${s.icon}`} aria-hidden="true" />{s.label}</span>;
}

export function PaymentBadge({ status }) {
  const s = PAYMENT[status] || { label: status || '—', cls: 'progress', icon: 'ti-point' };
  return <span className={`badge ${s.cls}`}><i className={`ti ${s.icon}`} aria-hidden="true" />{s.label}</span>;
}

export const SUBSCRIPTION_STATUSES = SUBSCRIPTION;
export const PAYMENT_STATUSES = PAYMENT;
