/**
 * ══════════════════════════════════════════════════════════════════
 * APPELS DE L'ESPACE ADMIN
 * ══════════════════════════════════════════════════════════════════
 * Séparés de src/services/api.js (espace e-commerçant). Toutes les
 * vérifications de rôle sont refaites par la base : un e-commerçant qui
 * appellerait ces fonctions obtiendrait un refus.
 * Les actions sensibles (suppression de compte, réinitialisation du mot
 * de passe, invitation d'un admin) passeront par une Edge Function :
 * la clé service_role n'apparaît jamais ici.
 * ══════════════════════════════════════════════════════════════════
 */
import { supabase } from '../lib/supabase';

function isNetworkError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || error?.status === 0;
}

export function adminError(error, fallback = 'Action impossible. Réessaie.') {
  if (!error) return new Error(fallback);
  if (isNetworkError(error)) return new Error('Connexion impossible, réessaie.');
  const msg = String(error.message || '');
  if (['P0001', 'P0002', '22023', '42501'].includes(error.code) && /[éèàçù]|^(Accès|Action|Motif|Compte|Plan|Prix|Indique|Ordre|Impossible|Membre|Message|Rôle|Tu |Ce |Cette |Le |La |Les )/.test(msg)) {
    return new Error(msg);
  }
  if (error.code === '42501') return new Error('Action réservée à un autre rôle administrateur.');
  return new Error(fallback);
}

function sb() {
  if (!supabase) throw new Error('Configuration Supabase manquante.');
  return supabase;
}

/**
 * Rôle admin du compte connecté : 'super_admin', 'support' ou null.
 * (La table admins n'est lisible que par les admins : un e-commerçant
 * obtient toujours null.)
 */
export async function getAdminRole() {
  const { data: { session } } = await sb().auth.getSession();
  if (!session) return null;
  const { data, error } = await sb().from('admins').select('role').eq('user_id', session.user.id).maybeSingle();
  if (error) {
    if (isNetworkError(error)) throw adminError(error);
    return null;
  }
  return data?.role || null;
}

// ── VUE D'ENSEMBLE ───────────────────────────────────────────────
// Fonction SQL admin_overview (tout admin) : statuts réels, MRR,
// revenus, plans, inscriptions, conversion, listes rapides.
export async function getOverview() {
  const { data, error } = await sb().rpc('admin_overview');
  if (error) throw adminError(error, 'Impossible de charger la vue d\'ensemble.');
  return data;
}

// Applis installées (admin_app_install_stats) : totaux uniquement
export async function getAppInstallStats() {
  const { data, error } = await sb().rpc('admin_app_install_stats');
  if (error) throw adminError(error, 'Impossible de charger les installations.');
  return data;
}

// ── E-COMMERÇANTS ────────────────────────────────────────────────
// Liste paginée côté serveur (admin_list_merchants). Les comptes admins
// sont exclus par la base.
export async function listMerchants({ search = '', plan = '', status = '', flagged = '', sort = 'created_at', dir = 'desc', page = 1, pageSize = 25 } = {}) {
  const { data, error } = await sb().rpc('admin_list_merchants', {
    p_search: search || null,
    p_plan: plan || null,
    p_status: status || null,
    p_flagged: flagged === '' ? null : flagged === 'yes',
    p_sort: sort,
    p_dir: dir,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw adminError(error, 'Impossible de charger les e-commerçants.');
  return data;
}

/** Toutes les lignes correspondant aux filtres (export CSV), par pages de 1 000. */
export async function listAllMerchants(filters) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const res = await listMerchants({ ...filters, page, pageSize: 1000 });
    all.push(...res.rows);
    if (all.length >= Number(res.total) || res.rows.length === 0) break;
  }
  return all;
}

// Fiche : compte, abonnement, paiements, TOTAUX d'activité (aucun
// contenu), notes internes, signalements, historique des actions.
export async function getMerchantDetail(accountId) {
  const { data, error } = await sb().rpc('admin_merchant_detail', { p_account_id: accountId });
  if (error) throw adminError(error, 'Impossible de charger la fiche.');
  return data;
}

export async function setSuspended(accountId, suspend, reason) {
  const { data, error } = await sb().rpc('admin_set_suspended', { p_account_id: accountId, p_suspend: suspend, p_reason: reason });
  if (error) throw adminError(error);
  return data;
}

export async function changePlan(accountId, plan, billing, reason) {
  const { data, error } = await sb().rpc('admin_change_plan', { p_account_id: accountId, p_plan: plan, p_billing: billing || null, p_reason: reason });
  if (error) throw adminError(error);
  return data;
}

export async function extendAccount(accountId, days, reason) {
  const { data, error } = await sb().rpc('admin_extend', { p_account_id: accountId, p_days: Number(days), p_reason: reason });
  if (error) throw adminError(error);
  return data;
}

// Notes internes et signalements : écriture directe, autorisée par la
// RLS à tout admin ; l'auteur est rempli par la base ; journalisé.
export async function addAdminNote(accountId, content) {
  const { error } = await sb().from('admin_notes').insert({ account_id: accountId, content: String(content).trim() });
  if (error) throw adminError(error, 'Note non enregistrée.');
}

export async function addFlag(accountId, reason) {
  const { error } = await sb().from('account_flags').insert({ account_id: accountId, reason: String(reason).trim() });
  if (error) throw adminError(error, 'Signalement non enregistré.');
}

export async function resolveFlag(flagId) {
  const { data: { session } } = await sb().auth.getSession();
  const { error } = await sb().from('account_flags')
    .update({ resolved_at: new Date().toISOString(), resolved_by: session?.user?.id })
    .eq('id', flagId);
  if (error) throw adminError(error, 'Signalement non mis à jour.');
}

// Actions sensibles : Edge Function « admin-actions » (clé service_role
// côté serveur uniquement).
async function callAdminActions(payload, fallback) {
  const { data, error } = await sb().functions.invoke('admin-actions', { body: payload });
  if (error) {
    let msg = '';
    try { msg = (await error.context?.json?.())?.error || ''; } catch { /* réponse illisible */ }
    if (!msg && isNetworkError(error)) msg = 'Connexion impossible, réessaie.';
    throw new Error(msg || fallback);
  }
  return data;
}

export function sendPasswordReset(accountId, reason) {
  return callAdminActions({
    action: 'reset_password',
    account_id: accountId,
    reason,
    redirect_to: `${window.location.origin}/reinitialiser-mot-de-passe`,
  }, 'Email non envoyé. Réessaie.');
}

export function deleteMerchant(accountId, reason, confirmName) {
  return callAdminActions({ action: 'delete_account', account_id: accountId, reason, confirm_name: confirmName }, 'Suppression impossible. Réessaie.');
}

// ── PAIEMENTS ────────────────────────────────────────────────────
// Liste paginée côté serveur (admin_list_payments, tout admin) avec le
// total encaissé de la période. Dates au format AAAA-MM-JJ.
export async function listPayments({ from = '', to = '', status = '', search = '', page = 1, pageSize = 25 } = {}) {
  const { data, error } = await sb().rpc('admin_list_payments', {
    p_from: from || null,
    p_to: to || null,
    p_status: status || null,
    p_search: search || null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw adminError(error, 'Impossible de charger les paiements.');
  return data;
}

/** Tous les paiements correspondant aux filtres (export CSV), par pages de 1 000. */
export async function listAllPayments(filters) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const res = await listPayments({ ...filters, page, pageSize: 1000 });
    all.push(...res.rows);
    if (all.length >= Number(res.total) || res.rows.length === 0) break;
  }
  return all;
}

/**
 * Activation manuelle (super_admin) d'un paiement réellement reçu chez
 * Bictorys dont la notification a échoué : référence Bictorys et motif
 * obligatoires, inscrite au journal par la base.
 */
export async function activatePayment(paymentId, bictorysRef, reason) {
  const { data, error } = await sb().rpc('admin_activate_payment', { p_payment_id: paymentId, p_bictorys_ref: bictorysRef, p_reason: reason });
  if (error) throw adminError(error);
  return data;
}

// ── PLANS ET TARIFS ──────────────────────────────────────────────
// Lecture : table plans (publique). Modification : admin_update_plan
// (super_admin, motif obligatoire, journalisée). La limite de reçus n'est
// pas modifiable ici (elle toucherait les abonnements en cours).
export async function listPlansAdmin() {
  const { data, error } = await sb().from('plans')
    .select('id, name, price, old_price, duration_days, receipt_limit, highlight, features, is_active, sort_order, updated_at')
    .order('sort_order', { ascending: true });
  if (error) throw adminError(error, 'Impossible de charger les plans.');
  return data;
}

export async function getPlanStats() {
  const { data, error } = await sb().rpc('admin_plan_stats');
  if (error) throw adminError(error, 'Impossible de charger les abonnés par plan.');
  return data || {};
}

export async function updatePlan(id, form, reason) {
  const { data, error } = await sb().rpc('admin_update_plan', {
    p_id: id,
    p_name: form.name,
    p_price: form.price,
    p_old_price: form.oldPrice,
    p_duration_days: form.durationDays,
    p_features: form.features,
    p_sort_order: form.sortOrder,
    p_highlight: form.highlight,
    p_is_active: form.isActive,
    p_reason: reason,
  });
  if (error) throw adminError(error);
  return data;
}

// ── PARAMÈTRES DE LA PLATEFORME (super_admin) ────────────────────
const SETTING_KEYS = ['signup_open', 'signup_closed_message', 'trial_days'];

export async function getPlatformSettings() {
  const { data, error } = await sb().from('platform_settings').select('key, value, updated_at').in('key', SETTING_KEYS);
  if (error) throw adminError(error, 'Impossible de charger les paramètres.');
  const get = (k) => data.find((r) => r.key === k);
  return {
    signupOpen: get('signup_open')?.value !== false,
    closedMessage: String(get('signup_closed_message')?.value ?? ''),
    trialDays: Number(get('trial_days')?.value) || 3,
    updatedAt: data.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), ''),
  };
}

export async function updatePlatformSettings({ signupOpen, closedMessage, trialDays }, reason) {
  const { data, error } = await sb().rpc('admin_update_settings', {
    p_signup_open: signupOpen, p_closed_message: closedMessage, p_trial_days: trialDays, p_reason: reason,
  });
  if (error) throw adminError(error);
  return data;
}

// ── ÉQUIPE (super_admin) ─────────────────────────────────────────
export async function listTeam() {
  const { data, error } = await sb().rpc('admin_list_team');
  if (error) throw adminError(error, 'Impossible de charger l\'équipe.');
  return data || [];
}

export async function setTeamRole(userId, role, reason) {
  const { error } = await sb().rpc('admin_set_role', { p_user_id: userId, p_role: role, p_reason: reason });
  if (error) throw adminError(error);
}

export async function setTeamDisabled(userId, disabled, reason) {
  const { error } = await sb().rpc('admin_set_team_disabled', { p_user_id: userId, p_disabled: disabled, p_reason: reason });
  if (error) throw adminError(error);
}

/**
 * Invitation (Edge Function, clé service_role côté serveur) :
 * mode 'email' (Supabase envoie l'email) ou 'link' (lien renvoyé ici,
 * à transmettre soi-même).
 */
export function inviteTeamMember(email, role, mode, reason) {
  return callAdminActions({
    action: 'invite_admin', email, role, mode, reason,
    redirect_to: `${window.location.origin}/reinitialiser-mot-de-passe?invitation=1`,
  }, 'Invitation impossible. Réessaie.');
}

/**
 * Invitation d'un e-commerçant avec un plan offert (super admin) :
 * plan 'free' | 'pro' | 'elite', days parmi 7, 14, 30, 60, 90, 180, 365.
 */
export function inviteMerchant({ email, businessName, plan, days, mode, reason }) {
  return callAdminActions({
    action: 'invite_merchant', email, business_name: businessName, plan, days, mode, reason,
    redirect_to: `${window.location.origin}/reinitialiser-mot-de-passe?invitation=boutique`,
  }, 'Invitation impossible. Réessaie.');
}

// ── JOURNAL D'ACTIVITÉ (tout admin) ──────────────────────────────
export async function listAudit({ admin = '', action = '', account = '', from = '', to = '', search = '', page = 1, pageSize = 50 } = {}) {
  const { data, error } = await sb().rpc('admin_list_audit', {
    p_admin: admin || null,
    p_action: action || null,
    p_account: account || null,
    p_from: from || null,
    p_to: to || null,
    p_search: search || null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw adminError(error, 'Impossible de charger le journal.');
  return data;
}

// ── MESSAGES (super admin et support) ────────────────────────────
// Conversations e-commerçant ⇄ équipe. Chaque fonction vérifie dans la
// base que l'appelant est un admin actif.
export async function listThreads({ status = '', unread = '', search = '', page = 1, pageSize = 30 } = {}) {
  const { data, error } = await sb().rpc('admin_list_threads', {
    p_status: status || null,
    p_unread: unread === '' ? null : unread === 'yes',
    p_search: search || null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw adminError(error, 'Impossible de charger les conversations.');
  return data;
}

export async function getThread(accountId) {
  const { data, error } = await sb().rpc('admin_thread_messages', { p_account_id: accountId });
  if (error) throw adminError(error, 'Impossible de charger la conversation.');
  return data;
}

export async function sendTeamMessage(accountId, body) {
  const { error } = await sb().rpc('admin_send_support_message', { p_account_id: accountId, p_body: body });
  if (error) throw adminError(error, 'Message non envoyé. Réessaie.');
}

export async function setThreadStatus(accountId, status) {
  const { error } = await sb().rpc('admin_set_thread_status', { p_account_id: accountId, p_status: status });
  if (error) throw adminError(error);
}

export async function getUnreadThreads() {
  const { data, error } = await sb().rpc('admin_unread_threads');
  if (error) return 0;
  return Number(data) || 0;
}
