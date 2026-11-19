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
// Lecture publique : les inscriptions sont-elles ouvertes ?
async function isSignupOpen() {
  const { data, error } = await requireSupabase()
    .from('platform_settings').select('value').eq('key', 'signup_open').maybeSingle();
  if (error) throw toError(error);
  return data ? data.value !== false : true;
}

/**
 * Crée le compte. Le profil et l'abonnement « pending » sont créés par
 * la base (trigger). Si la confirmation d'email est activée dans
 * Supabase, aucune session n'est ouverte : needsEmailConfirmation = true.
 */
export async function signup({ ownerName, businessName, phone, email, password }) {
  const sb = requireSupabase();
  if (String(password || '').length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
  let open;
  try { open = await isSignupOpen(); } catch (e) { throw e; }
  if (!open) throw new Error(AUTH_ERRORS.signup_disabled);

  const { data, error } = await sb.auth.signUp({
    email: String(email).trim(),
    password,
    options: {
      data: { business_name: businessName, owner_name: ownerName, phone },
      emailRedirectTo: `${window.location.origin}/connexion`,
    },
  });
  if (error) throw toError(error, 'Inscription impossible. Réessaie.');
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
    label: 'Free', price: 0, days: null, receiptLimit: 3,
    features: [
      '3 reçus PDF pour tester',
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
export const annualPrice = (plan) => plan.price * ANNUAL_MONTHS_PAID;

/**
 * Choix du plan.
 * - Free : activé tout de suite par la fonction SQL choose_free_plan()
 *   (seule écriture d'abonnement permise à l'e-commerçant).
 * - Pro / Elite : le paiement Bictorys passe par une Edge Function
 *   (create-checkout) branchée à l'étape 6 ; l'abonnement est activé par
 *   le webhook côté serveur, jamais depuis le navigateur.
 */
export async function subscribe(accountId, planKey, billing = 'monthly') {
  const plan = PLANS[planKey];
  if (!plan) throw new Error('Plan invalide.');
  if (plan.price === 0) {
    const { error } = await requireSupabase().rpc('choose_free_plan');
    if (error) throw toError(error, "Impossible d'activer le plan Free. Réessaie.");
    return fetchAccount(accountId);
  }
  // Remplacé à l'étape 6 par : Edge Function create-checkout → redirection Bictorys
  throw new Error('Le paiement en ligne (Wave, Orange Money, carte) arrive très bientôt. En attendant, choisis le plan Free.');
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

// ══════════════════════════════════════════════════════════════════
// SUPER-ADMIN (réservé aux comptes présents dans la table admins)
// Les règles RLS et les fonctions SQL vérifient le rôle côté base :
// un e-commerçant qui appellerait ces fonctions ne verrait rien.
// ══════════════════════════════════════════════════════════════════

// Le compte connecté est-il administrateur ?
export async function isCurrentUserAdmin() {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data, error } = await supabase.from('admins').select('role').eq('user_id', session.user.id).maybeSingle();
  if (error) return false;
  return !!data;
}

// Liste des comptes (profil + abonnement). Jamais les notes ni l'épargne.
export async function listAllAccounts() {
  const rows = await fetchAll(() => requireSupabase().from('profiles')
    .select('id, business_name, owner_name, phone, email, created_at, last_login_at, subscriptions(*)')
    .order('created_at', { ascending: false }));
  return rows.map((p) => {
    const sub = Array.isArray(p.subscriptions) ? p.subscriptions[0] : p.subscriptions;
    const a = mapAccount(p, sub);
    delete a.receiptSettings; // inutile côté admin
    return a;
  });
}

// Statut d'abonnement modifié par un admin (RLS : admins uniquement).
// Réactiver : plan conservé (Free si aucun), et prolongation si la
// période est échue.
export async function setSubscriptionStatus(accountId, status) {
  const sb = requireSupabase();
  const { data: sub, error: e1 } = await sb.from('subscriptions').select('*').eq('account_id', accountId).maybeSingle();
  if (e1) throw toDataError(e1);
  if (!sub) throw new Error('Abonnement introuvable.');
  const row = { status };
  if (status === 'active') {
    row.plan_id = sub.plan_id || 'free';
    const plan = PLANS[row.plan_id];
    if (plan?.days && (!sub.expires_at || new Date(sub.expires_at) <= new Date())) {
      row.expires_at = new Date(Date.now() + plan.days * 86400000).toISOString();
    }
    if (!plan?.days) row.expires_at = null;
  }
  const { data, error } = await sb.from('subscriptions').update(row).eq('account_id', accountId).select().maybeSingle();
  if (error) throw toDataError(error, "Impossible de modifier l'abonnement. Réessaie.");
  if (!data) throw new Error('Action réservée aux administrateurs.');
  return data;
}

// Statistiques de la plateforme (fonction SQL admin_dashboard_stats)
export async function getAdminStats() {
  const { data, error } = await requireSupabase().rpc('admin_dashboard_stats');
  if (error) throw toDataError(error, 'Impossible de charger les statistiques.');
  return data;
}

// Totaux d'un e-commerçant (fonction SQL admin_merchant_overview)
export async function getMerchantOverview(accountId) {
  const { data, error } = await requireSupabase().rpc('admin_merchant_overview', { p_account_id: accountId });
  if (error) throw toDataError(error, "Impossible de charger le résumé de l'e-commerçant.");
  return data;
}
