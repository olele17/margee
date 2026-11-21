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
  if (['P0001', 'P0002', '22023', '42501'].includes(error.code) && /[éèàçù]|^(Accès|Action|Motif|Compte|Plan|Le |La |Les )/.test(msg)) {
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
