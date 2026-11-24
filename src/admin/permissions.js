/**
 * ══════════════════════════════════════════════════════════════════
 * DROITS DE L'ESPACE ADMIN (source unique côté écran)
 * ══════════════════════════════════════════════════════════════════
 * Ces règles servent à afficher ou masquer boutons et pages. La VRAIE
 * protection est dans la base : chaque fonction admin_* et chaque règle
 * RLS vérifient le rôle de l'appelant. Toute modification ici doit être
 * reportée dans les migrations SQL (et inversement).
 *
 *   super_admin : tout.
 *   support     : lecture, notes internes, signalements, prolonger un
 *                 essai ou un abonnement. Pas de suppression, de
 *                 changement de plan ou de prix, de paramètres plateforme
 *                 ni de gestion de l'équipe.
 * ══════════════════════════════════════════════════════════════════
 */

export const ROLES = {
  super_admin: { label: 'Super admin', description: 'Accès complet à la plateforme.' },
  support: { label: 'Support', description: 'Lecture, notes internes, signalements et prolongations.' },
};

const BOTH = ['super_admin', 'support'];
const SUPER = ['super_admin'];

const RULES = {
  'overview.view': BOTH,
  'merchants.view': BOTH,
  'merchants.notes': BOTH,          // notes internes de l'équipe
  'merchants.flags': BOTH,          // signalements d'usage anormal
  'merchants.extend': BOTH,         // prolonger un essai / un abonnement
  'merchants.suspend': SUPER,       // suspendre / réactiver
  'merchants.changePlan': SUPER,
  'merchants.invite': SUPER,        // inviter un e-commerçant avec un plan offert
  'merchants.resetPassword': SUPER,
  'merchants.delete': SUPER,
  'merchants.export': BOTH,
  'payments.view': BOTH,
  'payments.activate': SUPER,       // activation manuelle d'un paiement reçu
  'plans.view': SUPER,
  'plans.edit': SUPER,
  'settings.view': SUPER,
  'settings.edit': SUPER,
  'team.manage': SUPER,
  'audit.view': BOTH,
  'messages.view': BOTH,           // messagerie avec les e-commerçants
};

/** Le rôle donne-t-il cette permission ? */
export function can(role, permission) {
  return !!role && (RULES[permission] || []).includes(role);
}

/** Menu de l'espace admin (chaque entrée n'apparaît que si le rôle y a droit). */
export const ADMIN_NAV = [
  { to: '/admin', end: true, icon: 'ti-layout-dashboard', label: "Vue d'ensemble", permission: 'overview.view' },
  { to: '/admin/marchands', icon: 'ti-building-store', label: 'E-commerçants', permission: 'merchants.view' },
  { to: '/admin/messages', icon: 'ti-messages', label: 'Messages', permission: 'messages.view' },
  { to: '/admin/paiements', icon: 'ti-credit-card', label: 'Paiements', permission: 'payments.view' },
  { to: '/admin/plans', icon: 'ti-tags', label: 'Plans et tarifs', permission: 'plans.view' },
  { to: '/admin/parametres', icon: 'ti-settings', label: 'Paramètres et équipe', permission: 'settings.view' },
  { to: '/admin/journal', icon: 'ti-history', label: "Journal d'activité", permission: 'audit.view' },
];
