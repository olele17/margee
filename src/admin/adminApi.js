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
