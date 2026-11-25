/**
 * ══════════════════════════════════════════════════════════════════
 * COUCHE DE DONNÉES
 * ══════════════════════════════════════════════════════════════════
 * Tout passe par Supabase (Auth + Postgres), protégé par la RLS :
 * comptes, profil, abonnement, produits, ventes, pubs, dépenses,
 * investissements, notes, challenges et administration.
 * Conversion snake_case (base) ↔ camelCase (app) uniquement ici.
 * Les pages React n'appellent que ces fonctions : mêmes noms, mêmes
 * paramètres et même forme de données qu'avant.
 * ══════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import { CHALLENGE_TYPES } from '../utils/calc';
import { getReferral, clearReferral } from '../utils/referral';

// ── ERREURS : messages clairs en français ───────────────────────
function isNetworkError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.name === 'AuthRetryableFetchError' ||
    error?.status === 0 ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed')
  );
}

const AUTH_ERRORS = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: "Confirme d'abord ton email : clique sur le lien reçu dans ta boîte mail.",
  user_already_exists: 'Un compte existe déjà avec cet email.',
  email_exists: 'Un compte existe déjà avec cet email.',
  weak_password: 'Mot de passe trop faible : 8 caractères minimum.',
  over_email_send_rate_limit: 'Trop de demandes en peu de temps. Réessaie dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives. Réessaie dans quelques minutes.',
  email_address_invalid: 'Adresse email invalide.',
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  signup_disabled: 'Les inscriptions sont fermées pour le moment.',
};

// Transforme une erreur Supabase en Error avec un message lisible.
function toError(error, fallback = 'Une erreur est survenue. Réessaie.') {
  if (!error) return new Error(fallback);
  if (isNetworkError(error)) return new Error('Connexion impossible, réessaie.');
  if (error.code && AUTH_ERRORS[error.code]) return new Error(AUTH_ERRORS[error.code]);
  const msg = String(error.message || '');
  if (/invalid login credentials/i.test(msg)) return new Error(AUTH_ERRORS.invalid_credentials);
  if (/email not confirmed/i.test(msg)) return new Error(AUTH_ERRORS.email_not_confirmed);
  if (/already registered/i.test(msg)) return new Error(AUTH_ERRORS.user_already_exists);
  if (/signup_closed|database error saving new user/i.test(msg)) return new Error(AUTH_ERRORS.signup_disabled);
  // Messages déjà en français levés par nos fonctions SQL
  if (msg && /[éèàçù]|^(Ton|Connecte|Abonnement|Choisis|Le |La |Les )/.test(msg)) return new Error(msg);
  return new Error(fallback);
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Configuration manquante : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.');
  }
  return supabase;
}

// ── COMPTE : base (snake_case) → app (camelCase) ─────────────────
function mapAccount(profile, sub) {
  return {
    id: profile.id,
    ownerName: profile.owner_name || '',
    businessName: profile.business_name || '',
    phone: profile.phone || '',
    email: profile.email,
    role: 'owner',
    createdAt: profile.created_at,
    lastLoginAt: profile.last_login_at,
    savingsRulePercent: profile.savings_rule_percent,
    subscription: {
      status: sub?.status || 'pending',
      plan: sub?.plan_id || null,
      billing: sub?.billing || null,
      expiresAt: sub?.expires_at || null,
      trialEndsAt: sub?.trial_ends_at || null,
    },
    receiptSettings: {
      logo: profile.receipt_logo || null,
      address: profile.receipt_address || '',
      city: profile.receipt_city || '',
      note: profile.receipt_note || '',
      email: profile.receipt_email || '',
      signatureType: profile.receipt_signature_type || 'draw',
      signatureImage: profile.receipt_signature || null,
      colorPrimary: profile.receipt_color_primary || null,
      colorAccent: profile.receipt_color_accent || null,
    },
  };
}

async function fetchAccount(userId) {
  const sb = requireSupabase();
  const [{ data: profile, error: e1 }, { data: sub, error: e2 }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
    sb.from('subscriptions').select('*').eq('account_id', userId).maybeSingle(),
  ]);
  if (e1 || e2) throw toError(e1 || e2, 'Impossible de charger ton compte. Réessaie.');
  if (!profile) throw new Error('Profil introuvable. Contacte le support.');
  return mapAccount(profile, sub);
}

// ── AUTH / COMPTES (Supabase Auth) ───────────────────────────────
// Lecture publique : les inscriptions sont-elles ouvertes ? Et le message
// à afficher quand elles sont fermées (réglés dans /admin/parametres).
export async function getSignupStatus() {
  const { data, error } = await requireSupabase()
    .from('platform_settings').select('key, value').in('key', ['signup_open', 'signup_closed_message']);
  if (error) throw toError(error);
  const open = data?.find((r) => r.key === 'signup_open');
  const message = data?.find((r) => r.key === 'signup_closed_message')?.value;
  return {
    open: open ? open.value !== false : true,
    message: typeof message === 'string' && message.trim() ? message.trim() : AUTH_ERRORS.signup_disabled,
  };
}


/**
 * Crée le compte. Le profil et l'abonnement « pending » sont créés par
 * la base (trigger). Si la confirmation d'email est activée dans
 * Supabase, aucune session n'est ouverte : needsEmailConfirmation = true.
 */
export async function signup({ ownerName, businessName, phone, email, password }) {
  const sb = requireSupabase();
  if (String(password || '').length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
  const status = await getSignupStatus();
  if (!status.open) throw new Error(status.message);

  const { data, error } = await sb.auth.signUp({
    email: String(email).trim(),
    password,
    options: {
      data: { business_name: businessName, owner_name: ownerName, phone, ...(getReferral() ? { ref: getReferral() } : {}) },
      emailRedirectTo: `${window.location.origin}/connexion`,
    },
  });
  if (error) throw toError(error, 'Inscription impossible. Réessaie.');
  clearReferral();
  // Email déjà utilisé : Supabase renvoie un utilisateur sans identité
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error(AUTH_ERRORS.user_already_exists);
  }
  return {
    id: data.user?.id,
    ownerName, businessName, phone, email,
    role: 'owner',
    subscription: { status: 'pending', plan: null, expiresAt: null },
    needsEmailConfirmation: !data.session,
  };
}

export async function login(email, password) {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
  if (error) throw toError(error, 'Connexion impossible. Réessaie.');
  // Date de dernière connexion (sans bloquer la connexion en cas d'échec)
  sb.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id).then(() => {});
  return fetchAccount(data.user.id);
}

export async function logout() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentAccount() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return fetchAccount(session.user.id);
}

/**
 * Écoute les changements de session (connexion, déconnexion, autre onglet,
 * lien de réinitialisation). Renvoie une fonction pour arrêter l'écoute.
 */
export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

// ── MOT DE PASSE OUBLIÉ ──────────────────────────────────────────
// Remplacé par : Supabase Auth (email de réinitialisation)
export async function requestPasswordReset(email) {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(String(email).trim(), {
    redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
  });
  if (error) throw toError(error, "Impossible d'envoyer l'email. Réessaie.");
}

export async function hasSession() {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

export async function updatePassword(newPassword) {
  if (String(newPassword || '').length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
  const { error } = await requireSupabase().auth.updateUser({ password: newPassword });
  if (error) throw toError(error, 'Impossible de changer le mot de passe. Réessaie.');
}

// ── PARAMÈTRES DE FACTURATION (logo, signature, infos reçu) ─────
const RECEIPT_COLUMNS = {
  logo: 'receipt_logo',
  address: 'receipt_address',
  city: 'receipt_city',
  note: 'receipt_note',
  email: 'receipt_email',
  signatureType: 'receipt_signature_type',
  signatureImage: 'receipt_signature',
  colorPrimary: 'receipt_color_primary',
  colorAccent: 'receipt_color_accent',
};

export async function updateReceiptSettings(accountId, settings) {
  const row = {};
  Object.entries(RECEIPT_COLUMNS).forEach(([key, col]) => {
    if (key in settings) row[col] = settings[key] === '' ? null : settings[key];
  });
  if (row.receipt_signature_type == null) delete row.receipt_signature_type;
  const { error } = await requireSupabase().from('profiles').update(row).eq('id', accountId);
  if (error) throw toError(error, "Impossible d'enregistrer les réglages. Réessaie.");
  return fetchAccount(accountId);
}

// ── INFORMATIONS DE L'ENTREPRISE (nom, propriétaire, téléphone) ──
// L'email de connexion n'est pas modifié ici : l'email affiché sur les
// reçus est stocké à part (receipt_email).
export async function updateBusinessInfo(accountId, info) {
  const row = {};
  if ('businessName' in info) {
    if (!String(info.businessName).trim()) throw new Error("Le nom de l'entreprise est obligatoire.");
    row.business_name = String(info.businessName).trim();
  }
  if ('ownerName' in info) row.owner_name = String(info.ownerName).trim() || null;
  if ('phone' in info) row.phone = String(info.phone).trim() || null;
  const { error } = await requireSupabase().from('profiles').update(row).eq('id', accountId);
  if (error) throw toError(error, "Impossible d'enregistrer les informations. Réessaie.");
  return fetchAccount(accountId);
}

// ── ABONNEMENT / PAIEMENT (Bictorys — à brancher côté backend) ──
// Source unique des plans : la landing, l'abonnement, les paramètres et
// l'admin lisent tous cet objet. price = prix mensuel en F CFA.
// receiptLimit = reçus autorisés (par mois pour les plans payants),
// null = illimité.
export const PLANS = {
  free: {
    label: 'Free', price: 0, days: null, receiptLimit: 3, trialDays: 3,
    features: [
      'Essai gratuit de 3 jours',
      '3 essais : reçus, factures ou devis',
      'Produits et coût de revient',
      'Ventes avec calcul du bénéfice',
      'Tableau de bord',
    ],
  },
  pro: {
    label: 'Pro', price: 2400, days: 30, receiptLimit: 30,
    features: [
      '30 reçus PDF par mois',
      'Produits, ventes et marge',
      'Pubs dépensées et dépenses',
      'Investissements et ROI',
      'Comparaison mois par mois',
    ],
  },
  elite: {
    label: 'Elite', price: 4500, days: 30, receiptLimit: null, highlight: true,
    features: [
      'Reçus PDF illimités',
      'Tout le plan Pro',
      'Reçus personnalisés : logo et signature',
      'Analyses de ton tableau de bord',
    ],
  },
};

// Paiement à l'année : 12 mois pour le prix de 10 (2 mois offerts).
export const ANNUAL_MONTHS_PAID = 10;
export const ANNUAL_DAYS = 365;
export const annualPrice = (plan, months = ANNUAL_MONTHS_PAID) => plan.price * months;

// ── CATALOGUE DES PLANS (lu dans la base) ────────────────────────
// La table plans (modifiée depuis /admin/plans) est la source de
// vérité. PLANS ci-dessus ne sert que de valeur de départ et de repli si
// la base ne répond pas : la page s'affiche toujours.
//   plans : plans ACTIFS, dans l'ordre d'affichage (landing, abonnement)
//   all   : tous les plans, actifs ou non (abonnement en cours, quotas)
function withTrialLine(features, trialDays) {
  const line = `Essai gratuit de ${trialDays} jour${trialDays > 1 ? 's' : ''}`;
  return [line, ...features.filter((f) => !/^Essai gratuit de \d+ jours?$/.test(f))];
}

export const FALLBACK_CATALOG = {
  plans: PLANS,
  all: PLANS,
  annualMonths: ANNUAL_MONTHS_PAID,
  trialDays: PLANS.free.trialDays,
  fromDb: false,
};

export function mapPlanRow(row, trialDays = PLANS.free.trialDays) {
  const free = Number(row.price) === 0;
  const features = Array.isArray(row.features) ? row.features.map(String) : [];
  return {
    label: row.name,
    price: Number(row.price) || 0,
    oldPrice: row.old_price == null ? null : Number(row.old_price),
    days: row.duration_days == null ? null : Number(row.duration_days),
    receiptLimit: row.receipt_limit == null ? null : Number(row.receipt_limit),
    highlight: !!row.highlight,
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order) || 0,
    features: free ? withTrialLine(features, trialDays) : features,
    ...(free ? { trialDays } : {}),
  };
}

export async function fetchPlanCatalog() {
  const sb = requireSupabase();
  const [plansRes, settingsRes] = await Promise.all([
    sb.from('plans')
      .select('id, name, price, old_price, duration_days, receipt_limit, highlight, features, is_active, sort_order')
      .order('sort_order', { ascending: true })
      .order('price', { ascending: true }),
    sb.from('platform_settings').select('key, value').in('key', ['annual_months_paid', 'trial_days']),
  ]);
  if (plansRes.error || !plansRes.data?.length) throw toError(plansRes.error, 'Plans indisponibles.');
  const setting = (key, fallback) => {
    const v = Number(settingsRes.data?.find((s) => s.key === key)?.value);
    return Number.isFinite(v) && v >= 1 ? v : fallback;
  };
  const trialDays = setting('trial_days', PLANS.free.trialDays);
  const all = {};
  const plans = {};
  plansRes.data.forEach((row) => {
    const p = mapPlanRow(row, trialDays);
    all[row.id] = p;
    if (p.isActive) plans[row.id] = p;
  });
  return { plans, all, annualMonths: setting('annual_months_paid', ANNUAL_MONTHS_PAID), trialDays, fromDb: true };
}

/**
 * Choix du plan.
 * - Free : activé tout de suite par la fonction SQL choose_free_plan()
 *   (seule écriture d'abonnement permise à l'e-commerçant).
 * - Pro / Elite : le paiement Bictorys passe par une Edge Function
 *   (create-checkout) branchée à l'étape 6 ; l'abonnement est activé par
 *   le webhook côté serveur, jamais depuis le navigateur.
 */
// ── ACCÈS PARTENAIRE (droit en plus sur un compte normal) ─────────
export async function getMyPartnerAccess() {
  const { data, error } = await requireSupabase().rpc('my_partner_access');
  if (error) throw toError(error);
  return data === true;
}

// ── PAIEMENT DIRECT (Wave / Orange Money, hors Bictorys) ─────────
// Numéro et nom affichés aux e-commerçants (réglages publics).
export async function getManualPaymentInfo() {
  const { data, error } = await requireSupabase().from('platform_settings').select('key, value')
    .in('key', ['manual_payment_enabled', 'manual_payment_number', 'manual_payment_name']);
  if (error) throw toError(error);
  const get = (k) => data.find((r) => r.key === k)?.value;
  return { enabled: get('manual_payment_enabled') === true, number: String(get('manual_payment_number') || ''), name: String(get('manual_payment_name') || '') };
}

// Déclaration du paiement : vérifiée puis validée par l'équipe Margee+
export async function declareManualPayment({ plan, billing, method, payerPhone, transactionRef }) {
  const { data, error } = await requireSupabase().rpc('declare_manual_payment', {
    p_plan: plan, p_billing: billing, p_method: method, p_payer_phone: payerPhone, p_transaction_ref: transactionRef,
  });
  if (error) throw toError(error, 'Déclaration impossible. Réessaie.');
  return data;
}

// Dernière déclaration du compte (null s'il n'y en a pas)
export async function getMyManualPayment() {
  const { data, error } = await requireSupabase().rpc('my_manual_payment');
  if (error) throw toError(error);
  return data || null;
}

export async function subscribe(accountId, planKey, billing = 'monthly') {
  const plan = PLANS[planKey];
  if (!plan) throw new Error('Plan invalide.');
  if (plan.price === 0) {
    const { error } = await requireSupabase().rpc('choose_free_plan');
    if (error) throw toError(error, "Impossible d'activer le plan Free. Réessaie.");
    return fetchAccount(accountId);
  }
  // Pro / Elite : l'Edge Function crée le paiement (montant calculé par la
  // base) puis la charge Bictorys, et renvoie le lien de la page de paiement.
  const { data, error } = await requireSupabase().functions.invoke('bictorys-checkout', {
    body: { plan: planKey, billing, origin: window.location.origin },
  });
  if (error) {
    let msg = '';
    try { msg = (await error.context?.json?.())?.error || ''; } catch { /* réponse illisible */ }
    if (!msg && isNetworkError(error)) msg = 'Connexion impossible, réessaie.';
    throw new Error(msg || 'Impossible de démarrer le paiement. Réessaie.');
  }
  if (!data?.url || !/^https:\/\//.test(data.url)) throw new Error('Impossible de démarrer le paiement. Réessaie.');
  return { redirectUrl: data.url, reference: data.reference };
}

/**
 * Statut d'un paiement de l'e-commerçant connecté (page de retour
 * Bictorys). La RLS ne laisse lire que ses propres paiements.
 */
/**
 * Demande au serveur de vérifier le paiement directement auprès de
 * Bictorys (Edge Function bictorys-verify). Sert quand le webhook tarde
 * ou échoue ; l'activation reste décidée côté serveur. Les erreurs sont
 * ignorées : la page relit simplement le statut ensuite.
 */
export async function verifyPayment(reference) {
  try {
    const { data } = await requireSupabase().functions.invoke('bictorys-verify', { body: { reference } });
    return data?.status || null;
  } catch {
    return null;
  }
}

export async function getPaymentStatus(reference) {
  const { data, error } = await requireSupabase()
    .from('payments')
    .select('status, plan_id, billing, amount')
    .eq('provider_ref', reference)
    .maybeSingle();
  if (error) throw toError(error, 'Impossible de vérifier le paiement.');
  return data;
}

export function isSubscriptionActive(account) {
  if (!account) return false;
  const { status, expiresAt, trialEndsAt } = account.subscription || {};
  const now = new Date();
  if (status === 'active') return !expiresAt || new Date(expiresAt) > now;
  if (status === 'trial') return !!trialEndsAt && new Date(trialEndsAt) > now;
  return false;
}

// ══════════════════════════════════════════════════════════════════
// DONNÉES MÉTIER (Supabase, protégées par la RLS)
// Chaque table filtre déjà par compte côté base (account_id = auth.uid()).
// Le filtre .eq('account_id', …) ci-dessous est une défense en plus.
// ══════════════════════════════════════════════════════════════════

// Messages des erreurs de données (RLS, contraintes, fonctions SQL)
function toDataError(error, fallback = 'Enregistrement impossible. Réessaie.') {
  if (!error) return new Error(fallback);
  if (isNetworkError(error)) return new Error('Connexion impossible, réessaie.');
  const msg = String(error.message || '');
  // Erreurs levées en français par nos fonctions SQL (record_sale…)
  if (['P0001', 'P0002', '22023'].includes(error.code) && msg) return new Error(msg);
  if (error.code === '42501') {
    if (/row-level security|permission denied/i.test(msg)) {
      return new Error("Action impossible : ton abonnement n'est pas actif ou ces données ne t'appartiennent pas.");
    }
    return new Error(msg || fallback);
  }
  if (error.code === '23514') return new Error('Valeur invalide : vérifie les montants et les champs du formulaire.');
  if (error.code === '23503') return new Error('Élément lié introuvable ou encore utilisé ailleurs.');
  return new Error(fallback);
}

// Supabase renvoie au plus 1 000 lignes par requête : on charge par pages
// pour ne jamais tronquer silencieusement (ventes, pubs…).
const PAGE_SIZE = 1000;
async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw toDataError(error, 'Impossible de charger tes données. Réessaie.');
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

// Dates : l'app manipule des jours "AAAA-MM-JJ", la base des timestamptz.
// Africa/Dakar = UTC+0 toute l'année (pas d'heure d'été) : un jour J est
// stocké à J 12:00 heure de Dakar, et relu dans ce même fuseau.
const toDay = (ts) => (ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Africa/Dakar' }) : null);
const fromDay = (day) => (day ? new Date(`${day}T12:00:00Z`).toISOString() : new Date().toISOString());
const toAmount = (v) => Math.round(Number(v) || 0);

// ── PRODUITS ─────────────────────────────────────────────────────
// Remplacé par : table products (les produits archivés ne sont plus listés)
const mapProduct = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category || '',
  costPrice: Number(r.cost_price),
  price: Number(r.price),
});

export async function listProducts(accountId) {
  const rows = await fetchAll(() => requireSupabase().from('products').select('*')
    .eq('account_id', accountId).eq('is_archived', false).order('created_at').order('id'));
  return rows.map(mapProduct);
}

export async function saveProduct(accountId, product) {
  const row = {
    name: String(product.name || '').trim(),
    category: String(product.category || '').trim() || null,
    cost_price: toAmount(product.costPrice),
    price: toAmount(product.price),
  };
  const sb = requireSupabase();
  const { error } = product.id
    ? await sb.from('products').update(row).eq('id', product.id).eq('account_id', accountId)
    : await sb.from('products').insert(row);
  if (error) throw toDataError(error, "Impossible d'enregistrer le produit. Réessaie.");
  return listProducts(accountId);
}

// Un produit déjà vendu (ou suivi par un challenge) n'est pas supprimé :
// il est archivé, pour garder l'historique des ventes intact.
export async function deleteProduct(accountId, productId) {
  const sb = requireSupabase();
  const { error } = await sb.from('products').delete().eq('id', productId).eq('account_id', accountId);
  if (error) {
    if (error.code !== '23503') throw toDataError(error, 'Impossible de supprimer le produit. Réessaie.');
    const { error: e2 } = await sb.from('products').update({ is_archived: true }).eq('id', productId).eq('account_id', accountId);
    if (e2) throw toDataError(e2, 'Impossible de supprimer le produit. Réessaie.');
  }
  return listProducts(accountId);
}

// ── VENTES + REÇUS ────────────────────────────────────────────────
const mapSale = (r) => ({
  id: r.id,
  date: toDay(r.sold_at),
  productId: r.product_id,
  productName: r.product_name,
  qty: Number(r.qty),
  costPrice: Number(r.unit_cost),
  price: Number(r.unit_price),
  clientName: r.client_name || '',
  clientPhone: r.client_phone || '',
  clientAddress: r.client_address || '',
  deliveryCost: Number(r.delivery_cost || 0),
  deliveryPaidByClient: !!r.delivery_paid_by_client,
  receiptNumber: r.receipt_number,
  createdAt: r.created_at,
});

export async function listSales(accountId) {
  const rows = await fetchAll(() => requireSupabase().from('sales').select('*')
    .eq('account_id', accountId).order('sold_at').order('created_at'));
  return rows.map(mapSale);
}

// Remplacé par : fonction SQL record_sale (prix et coût copiés côté base,
// numéro de reçu sans doublon, quota du plan). Le prix envoyé par le
// navigateur n'est jamais utilisé.
export async function recordSale(accountId, sale) {
  const { data, error } = await requireSupabase().rpc('record_sale', {
    p_product_id: sale.productId,
    p_qty: Number(sale.qty),
    p_client_name: sale.clientName || null,
    p_client_phone: sale.clientPhone || null,
    p_client_address: sale.clientAddress || null,
    p_delivery_cost: toAmount(sale.deliveryCost),
    p_delivery_paid_by_client: !!sale.deliveryPaidByClient,
    p_sold_on: sale.date || null,
  });
  if (error) throw toDataError(error, "Impossible d'enregistrer la vente. Réessaie.");
  return mapSale(data);
}

export async function deleteSale(accountId, saleId) {
  const { error } = await requireSupabase().from('sales').delete().eq('id', saleId).eq('account_id', accountId);
  if (error) throw toDataError(error, 'Impossible de supprimer la vente. Réessaie.');
  return listSales(accountId);
}

// ── PUBS DÉPENSÉES ───────────────────────────────────────────────
const mapAd = (r) => ({ id: r.id, date: toDay(r.spent_at), platform: r.platform, amount: Number(r.amount), note: r.note || '' });

export async function listAds(accountId) {
  const rows = await fetchAll(() => requireSupabase().from('ads').select('*')
    .eq('account_id', accountId).order('spent_at').order('created_at'));
  return rows.map(mapAd);
}
export async function saveAdSpend(accountId, ad) {
  const row = { spent_at: fromDay(ad.date), platform: ad.platform || 'Autre', amount: toAmount(ad.amount), note: String(ad.note || '').trim() || null };
  const sb = requireSupabase();
  const { error } = ad.id
    ? await sb.from('ads').update(row).eq('id', ad.id).eq('account_id', accountId)
    : await sb.from('ads').insert(row);
  if (error) throw toDataError(error, "Impossible d'enregistrer la dépense pub. Réessaie.");
  return listAds(accountId);
}
export async function deleteAdSpend(accountId, adId) {
  const { error } = await requireSupabase().from('ads').delete().eq('id', adId).eq('account_id', accountId);
  if (error) throw toDataError(error, 'Impossible de supprimer la dépense pub. Réessaie.');
  return listAds(accountId);
}

// ── INVESTISSEMENTS ──────────────────────────────────────────────
const mapInvestment = (r) => ({ id: r.id, date: toDay(r.invested_at), description: r.description, amount: Number(r.amount) });

export async function listInvestments(accountId) {
  const rows = await fetchAll(() => requireSupabase().from('investments').select('*')
    .eq('account_id', accountId).order('invested_at').order('created_at'));
  return rows.map(mapInvestment);
}
export async function saveInvestment(accountId, inv) {
  const row = { invested_at: fromDay(inv.date), description: String(inv.description || '').trim(), amount: toAmount(inv.amount) };
  const sb = requireSupabase();
  const { error } = inv.id
    ? await sb.from('investments').update(row).eq('id', inv.id).eq('account_id', accountId)
    : await sb.from('investments').insert(row);
  if (error) throw toDataError(error, "Impossible d'enregistrer l'investissement. Réessaie.");
  return listInvestments(accountId);
}
export async function deleteInvestment(accountId, invId) {
  const { error } = await requireSupabase().from('investments').delete().eq('id', invId).eq('account_id', accountId);
  if (error) throw toDataError(error, "Impossible de supprimer l'investissement. Réessaie.");
  return listInvestments(accountId);
}

// ── DÉPENSES (actif / passif) ────────────────────────────────────
const mapExpense = (r) => ({ id: r.id, date: toDay(r.spent_at), description: r.description, amount: Number(r.amount), type: r.type });

export async function listExpenses(accountId) {
  const rows = await fetchAll(() => requireSupabase().from('expenses').select('*')
    .eq('account_id', accountId).order('spent_at').order('created_at'));
  return rows.map(mapExpense);
}
export async function saveExpense(accountId, expense) {
  const row = {
    spent_at: fromDay(expense.date),
    description: String(expense.description || '').trim(),
    amount: toAmount(expense.amount),
    type: expense.type === 'actif' ? 'actif' : 'passif',
  };
  const sb = requireSupabase();
  const { error } = expense.id
    ? await sb.from('expenses').update(row).eq('id', expense.id).eq('account_id', accountId)
    : await sb.from('expenses').insert(row);
  if (error) throw toDataError(error, "Impossible d'enregistrer la dépense. Réessaie.");
  return listExpenses(accountId);
}
export async function deleteExpense(accountId, expenseId) {
  const { error } = await requireSupabase().from('expenses').delete().eq('id', expenseId).eq('account_id', accountId);
  if (error) throw toDataError(error, 'Impossible de supprimer la dépense. Réessaie.');
  return listExpenses(accountId);
}

// ── NOTES (carnet privé de l'e-commerçant) ─────────────────────
// Table notes : un compte ne voit que ses notes ; aucune règle d'accès
// admin (confidentialité, même pour le super admin).
export const NOTE_CATEGORIES = {
  idee: { label: 'Idée', icon: 'ti-bulb' },
  fournisseur: { label: 'Fournisseur', icon: 'ti-truck' },
  client: { label: 'Client', icon: 'ti-user' },
  afaire: { label: 'À faire', icon: 'ti-checkbox' },
  autre: { label: 'Autre', icon: 'ti-note' },
};
const NOTE_TITLE_MAX = 120;
const NOTE_CONTENT_MAX = 5000;

const mapNote = (r) => ({
  id: r.id,
  accountId: r.account_id,
  title: r.title,
  content: r.content || '',
  category: r.category,
  productId: r.product_id,
  pinned: !!r.pinned,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listNotes(accountId) {
  const rows = await fetchAll(() => requireSupabase().from('notes').select('*')
    .eq('account_id', accountId).order('created_at').order('id'));
  return rows.map(mapNote);
}

export async function saveNote(accountId, note) {
  const title = String(note.title || '').trim();
  const content = String(note.content || '').trim();
  if (!title) throw new Error('Le titre de la note est obligatoire.');
  if (title.length > NOTE_TITLE_MAX) throw new Error(`Le titre ne doit pas dépasser ${NOTE_TITLE_MAX} caractères.`);
  if (content.length > NOTE_CONTENT_MAX) throw new Error(`Le contenu ne doit pas dépasser ${NOTE_CONTENT_MAX} caractères.`);
  const category = NOTE_CATEGORIES[note.category] ? note.category : 'autre';
  // Le produit lié doit appartenir au compte, sinon on l'ignore
  let productId = null;
  if (note.productId) {
    const products = await listProducts(accountId);
    productId = products.some((p) => p.id === note.productId) ? note.productId : null;
  }
  const row = { title, content, category, product_id: productId };
  const sb = requireSupabase();
  const { error } = note.id
    ? await sb.from('notes').update(row).eq('id', note.id).eq('account_id', accountId)
    : await sb.from('notes').insert({ ...row, pinned: !!note.pinned });
  if (error) throw toDataError(error, "Impossible d'enregistrer la note. Réessaie.");
  return listNotes(accountId);
}

export async function deleteNote(accountId, noteId) {
  const { error } = await requireSupabase().from('notes').delete().eq('id', noteId).eq('account_id', accountId);
  if (error) throw toDataError(error, 'Impossible de supprimer la note. Réessaie.');
  return listNotes(accountId);
}

// Épingler ne modifie pas la date « Modifiée le » (trigger côté base).
export async function togglePinNote(accountId, noteId) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('notes').select('pinned').eq('id', noteId).eq('account_id', accountId).maybeSingle();
  if (error) throw toDataError(error);
  if (!data) throw new Error('Note introuvable.');
  const { error: e2 } = await sb.from('notes').update({ pinned: !data.pinned }).eq('id', noteId).eq('account_id', accountId);
  if (e2) throw toDataError(e2, "Impossible d'épingler la note. Réessaie.");
  return listNotes(accountId);
}

// ── CHALLENGES (objectifs) ───────────────────────────────────
// Seule la définition est stockée : progression et statut sont
// recalculés à chaque affichage (computeChallengeProgress dans calc.js).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const mapChallenge = (r) => ({
  id: r.id,
  accountId: r.account_id,
  title: r.title,
  type: r.type,
  target: Number(r.target),
  productId: r.product_id,
  startDate: r.start_date,
  endDate: r.end_date,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listChallenges(accountId) {
  const rows = await fetchAll(() => requireSupabase().from('challenges').select('*')
    .eq('account_id', accountId).order('created_at').order('id'));
  return rows.map(mapChallenge);
}

export async function saveChallenge(accountId, challenge) {
  const type = challenge.type;
  if (!CHALLENGE_TYPES[type]) throw new Error("Choisis un type d'objectif.");
  const target = Number(challenge.target);
  if (!Number.isFinite(target) || target <= 0) throw new Error("L'objectif doit être supérieur à 0.");
  if (CHALLENGE_TYPES[type].unit === 'count' && !Number.isInteger(target)) throw new Error("L'objectif doit être un nombre entier.");
  const { startDate, endDate } = challenge;
  if (!ISO_DATE.test(startDate || '') || !ISO_DATE.test(endDate || '')) throw new Error('Choisis une date de début et une date de fin.');
  if (endDate <= startDate) throw new Error('La date de fin doit être après la date de début.');
  let productId = null;
  if (type === 'product_units') {
    if (!challenge.productId) throw new Error('Choisis le produit concerné.');
    const products = await listProducts(accountId);
    if (!products.some((pr) => pr.id === challenge.productId)) throw new Error('Produit introuvable.');
    productId = challenge.productId;
  }
  const title = String(challenge.title || '').trim().slice(0, 120);
  if (!title) throw new Error('Donne un titre à ton challenge.');

  const row = { title, type, target: Math.round(target), product_id: productId, start_date: startDate, end_date: endDate };
  const sb = requireSupabase();
  const { error } = challenge.id
    ? await sb.from('challenges').update(row).eq('id', challenge.id).eq('account_id', accountId)
    : await sb.from('challenges').insert(row);
  if (error) throw toDataError(error, "Impossible d'enregistrer le challenge. Réessaie.");
  return listChallenges(accountId);
}

export async function deleteChallenge(accountId, challengeId) {
  const { error } = await requireSupabase().from('challenges').delete().eq('id', challengeId).eq('account_id', accountId);
  if (error) throw toDataError(error, 'Impossible de supprimer le challenge. Réessaie.');
  return listChallenges(accountId);
}

// ── ESSAIS GRATUITS (plan Free) ──────────────────────────────────
// Reçus + devis + factures déjà créés par le compte connecté (RPC
// my_trial_usage). Le contrôle lui-même est fait par la base.
export async function getTrialUsage() {
  const { data, error } = await requireSupabase().rpc('my_trial_usage');
  if (error) throw error;
  return { receipts: Number(data?.receipts || 0), quotes: Number(data?.quotes || 0), invoices: Number(data?.invoices || 0) };
}

// ── QUOTA DE REÇUS ───────────────────────────────────────────────
// Reçus émis par mois (table receipt_usage, lecture seule pour le
// compte). Le calcul du quota se fait dans calc.js (computeReceiptQuota).
export async function getReceiptUsage(accountId) {
  const rows = await fetchAll(() => requireSupabase().from('receipt_usage').select('period, issued')
    .eq('account_id', accountId).order('period'));
  return rows.map((r) => ({ period: r.period, issued: Number(r.issued) }));
}

// L'espace admin a ses propres appels : voir src/admin/adminApi.js

// ══════════════════════════════════════════════════════════════════
// MESSAGERIE AVEC L'ÉQUIPE MARGEE+ (support)
// Une conversation par compte. Lecture protégée par la RLS (ses propres
// messages uniquement) ; écriture par la fonction send_support_message.
// Le nom de l'admin qui répond n'est jamais exposé : « Équipe Margee+ ».
// ══════════════════════════════════════════════════════════════════
export async function getSupportConversation() {
  const sb = requireSupabase();
  const [{ data: messages, error: e1 }, { data: thread, error: e2 }] = await Promise.all([
    sb.from('support_messages').select('id, sender, body, created_at').order('created_at', { ascending: true }).limit(500),
    sb.from('support_threads').select('status, last_message_at, last_sender, merchant_read_at').maybeSingle(),
  ]);
  if (e1 || e2) throw toDataError(e1 || e2, 'Impossible de charger la conversation.');
  return { messages: messages || [], thread };
}

/** Réponse de l'équipe pas encore lue ? */
export async function getSupportUnread() {
  const { data, error } = await requireSupabase()
    .from('support_threads').select('last_sender, last_message_at, merchant_read_at').maybeSingle();
  if (error || !data) return false;
  // Comparer des dates, pas des textes (le nombre de décimales varie)
  return data.last_sender === 'admin'
    && (!data.merchant_read_at || new Date(data.merchant_read_at).getTime() < new Date(data.last_message_at).getTime());
}

export async function sendSupportMessage(body) {
  const { error } = await requireSupabase().rpc('send_support_message', { p_body: body });
  if (error) throw toDataError(error, 'Message non envoyé. Réessaie.');
}

export async function markSupportRead() {
  await requireSupabase().rpc('mark_support_read');
}

// ══════════════════════════════════════════════════════════════════
// FACTURES ET DEVIS (table documents, protégée par la RLS)
// La base attribue le numéro (DEV-/FAC-AAAA-0001) et calcule tous les
// montants : le navigateur n'envoie que les lignes, la remise et la TVA.
// ══════════════════════════════════════════════════════════════════
function mapDocument(r) {
  return {
    id: r.id,
    kind: r.kind,
    number: r.number,
    status: r.status,
    clientName: r.client_name,
    clientPhone: r.client_phone || '',
    clientEmail: r.client_email || '',
    clientAddress: r.client_address || '',
    issueDate: r.issue_date,
    dueDate: r.due_date || '',
    items: (r.items || []).map((it) => ({ description: it.description, qty: Number(it.qty), unitPrice: Number(it.unit_price), total: Number(it.total) })),
    discountPercent: Number(r.discount_percent) || 0,
    taxRate: Number(r.tax_rate) || 0,
    subtotal: Number(r.subtotal),
    discountAmount: Number(r.discount_amount),
    taxAmount: Number(r.tax_amount),
    total: Number(r.total),
    notes: r.notes || '',
    sourceQuoteId: r.source_quote_id,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}

export async function listDocuments() {
  const { data, error } = await requireSupabase()
    .from('documents').select('*').order('issue_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
  if (error) throw toDataError(error, 'Impossible de charger les factures et devis.');
  return (data || []).map(mapDocument);
}

export async function getDocument(id) {
  const { data, error } = await requireSupabase().from('documents').select('*').eq('id', id).maybeSingle();
  if (error) throw toDataError(error, 'Impossible de charger le document.');
  return data ? mapDocument(data) : null;
}

/** Crée ou met à jour (id présent) ; renvoie le document enregistré. */
export async function saveDocument(doc) {
  const row = {
    status: doc.status,
    client_name: doc.clientName.trim(),
    client_phone: doc.clientPhone.trim() || null,
    client_email: doc.clientEmail.trim() || null,
    client_address: doc.clientAddress.trim() || null,
    issue_date: doc.issueDate,
    due_date: doc.dueDate || null,
    items: doc.items.map((it) => ({
      description: String(it.description || '').trim(),
      qty: Number(String(it.qty).replace(',', '.')),
      unit_price: Math.round(Number(String(it.unitPrice).replace(/\s/g, ''))),
    })),
    discount_percent: Number(String(doc.discountPercent || 0).replace(',', '.')) || 0,
    tax_rate: Number(String(doc.taxRate || 0).replace(',', '.')) || 0,
    notes: doc.notes.trim() || null,
  };
  const sb = requireSupabase();
  const q = doc.id
    ? sb.from('documents').update(row).eq('id', doc.id)
    : sb.from('documents').insert({ ...row, kind: doc.kind, number: 'DEV-0000-0000' });
  const { data, error } = await q.select('*').single();
  if (error) throw toDataError(error, 'Impossible d\'enregistrer le document.');
  return mapDocument(data);
}

export async function setDocumentStatus(id, status) {
  const { data, error } = await requireSupabase().from('documents').update({ status }).eq('id', id).select('*').single();
  if (error) throw toDataError(error, 'Impossible de changer le statut.');
  return mapDocument(data);
}

export async function deleteDocument(id) {
  const { error } = await requireSupabase().from('documents').delete().eq('id', id);
  if (error) throw toDataError(error, 'Suppression impossible.');
}

/** Devis → facture (mêmes lignes, remise, TVA) ; renvoie l'id de la facture */
export async function convertQuoteToInvoice(quoteId) {
  const { data, error } = await requireSupabase().rpc('convert_quote_to_invoice', { p_quote_id: quoteId });
  if (error) throw toDataError(error, 'Impossible de créer la facture.');
  return data;
}
