/**
 * ══════════════════════════════════════════════════════════════════
 * COUCHE DE DONNÉES
 * ══════════════════════════════════════════════════════════════════
 * Comptes, sessions, profil et abonnement : Supabase (Auth + Postgres,
 * protégés par la RLS). Les données métier (produits, ventes, pubs…)
 * passent à Supabase à l'étape 5 ; d'ici là elles restent dans le
 * localStorage, rangées par identifiant de compte Supabase.
 * Les pages React n'appellent que ces fonctions : mêmes noms, mêmes
 * paramètres et même forme de données qu'avant.
 * ══════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import { CHALLENGE_TYPES } from '../utils/calc';

const DB_KEY = 'easyswap_db_v1';

// ── STORE BRUT (localStorage) ───────────────────────────────────
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('DB read error', e); }
  return { accounts: [], products: {}, sales: {}, ads: {}, investments: {}, expenses: {}, receiptSeq: {} };
}
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));

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

// ── PRODUITS ─────────────────────────────────────────────────────
export async function listProducts(accountId) {
  await delay();
  return loadDB().products[accountId] || [];
}
export async function saveProduct(accountId, product) {
  await delay();
  const db = loadDB();
  const list = db.products[accountId] || [];
  if (product.id) {
    db.products[accountId] = list.map((p) => (p.id === product.id ? product : p));
  } else {
    db.products[accountId] = [...list, { ...product, id: uid() }];
  }
  saveDB(db);
  return db.products[accountId];
}
export async function deleteProduct(accountId, productId) {
  await delay();
  const db = loadDB();
  db.products[accountId] = (db.products[accountId] || []).filter((p) => p.id !== productId);
  saveDB(db);
  return db.products[accountId];
}

// ── VENTES + REÇUS ────────────────────────────────────────────────
export async function listSales(accountId) {
  await delay();
  return loadDB().sales[accountId] || [];
}
export async function recordSale(accountId, sale) {
  await delay();
  const db = loadDB();
  db.receiptSeq[accountId] = (db.receiptSeq[accountId] || 0) + 1;
  const receiptNumber = `ES-${new Date().getFullYear()}-${String(db.receiptSeq[accountId]).padStart(4, '0')}`;
  const record = {
    ...sale,
    id: uid(),
    receiptNumber,
    createdAt: new Date().toISOString(),
  };
  db.sales[accountId] = [...(db.sales[accountId] || []), record];
  saveDB(db);
  return record;
}
export async function deleteSale(accountId, saleId) {
  await delay();
  const db = loadDB();
  db.sales[accountId] = (db.sales[accountId] || []).filter((s) => s.id !== saleId);
  saveDB(db);
  return db.sales[accountId];
}

// ── PUBS DÉPENSÉES ───────────────────────────────────────────────
export async function listAds(accountId) {
  await delay();
  return loadDB().ads[accountId] || [];
}
export async function saveAdSpend(accountId, ad) {
  await delay();
  const db = loadDB();
  const list = db.ads[accountId] || [];
  db.ads[accountId] = ad.id ? list.map((a) => (a.id === ad.id ? ad : a)) : [...list, { ...ad, id: uid() }];
  saveDB(db);
  return db.ads[accountId];
}
export async function deleteAdSpend(accountId, adId) {
  await delay();
  const db = loadDB();
  db.ads[accountId] = (db.ads[accountId] || []).filter((a) => a.id !== adId);
  saveDB(db);
  return db.ads[accountId];
}

// ── INVESTISSEMENTS ──────────────────────────────────────────────
export async function listInvestments(accountId) {
  await delay();
  return loadDB().investments[accountId] || [];
}
export async function saveInvestment(accountId, inv) {
  await delay();
  const db = loadDB();
  const list = db.investments[accountId] || [];
  db.investments[accountId] = inv.id ? list.map((i) => (i.id === inv.id ? inv : i)) : [...list, { ...inv, id: uid() }];
  saveDB(db);
  return db.investments[accountId];
}
export async function deleteInvestment(accountId, invId) {
  await delay();
  const db = loadDB();
  db.investments[accountId] = (db.investments[accountId] || []).filter((i) => i.id !== invId);
  saveDB(db);
  return db.investments[accountId];
}

// ── DÉPENSES (actif / passif) ────────────────────────────────────
export async function listExpenses(accountId) {
  await delay();
  return loadDB().expenses?.[accountId] || [];
}
export async function saveExpense(accountId, expense) {
  await delay();
  const db = loadDB();
  db.expenses = db.expenses || {};
  const list = db.expenses[accountId] || [];
  db.expenses[accountId] = expense.id ? list.map((e) => (e.id === expense.id ? expense : e)) : [...list, { ...expense, id: uid() }];
  saveDB(db);
  return db.expenses[accountId];
}
export async function deleteExpense(accountId, expenseId) {
  await delay();
  const db = loadDB();
  db.expenses = db.expenses || {};
  db.expenses[accountId] = (db.expenses[accountId] || []).filter((e) => e.id !== expenseId);
  saveDB(db);
  return db.expenses[accountId];
}

// ── NOTES (carnet privé de l'e-commerçant) ─────────────────────
// Rangées par compte dans db.notes[accountId] : un compte ne voit que
// ses notes. Aucune fonction super-admin n'y accède (confidentialité).
export const NOTE_CATEGORIES = {
  idee: { label: 'Idée', icon: 'ti-bulb' },
  fournisseur: { label: 'Fournisseur', icon: 'ti-truck' },
  client: { label: 'Client', icon: 'ti-user' },
  afaire: { label: 'À faire', icon: 'ti-checkbox' },
  autre: { label: 'Autre', icon: 'ti-note' },
};
const NOTE_TITLE_MAX = 120;
const NOTE_CONTENT_MAX = 5000;

// Remplacé par : GET /api/notes
export async function listNotes(accountId) {
  await delay();
  return loadDB().notes?.[accountId] || [];
}

// Remplacé par : POST /api/notes (création) et PUT /api/notes/:id (modification)
export async function saveNote(accountId, note) {
  await delay();
  const title = String(note.title || '').trim();
  const content = String(note.content || '').trim();
  if (!title) throw new Error('Le titre de la note est obligatoire.');
  if (title.length > NOTE_TITLE_MAX) throw new Error(`Le titre ne doit pas dépasser ${NOTE_TITLE_MAX} caractères.`);
  if (content.length > NOTE_CONTENT_MAX) throw new Error(`Le contenu ne doit pas dépasser ${NOTE_CONTENT_MAX} caractères.`);
  const category = NOTE_CATEGORIES[note.category] ? note.category : 'autre';

  const db = loadDB();
  db.notes = db.notes || {};
  const list = db.notes[accountId] || [];
  // Le produit lié doit appartenir au compte, sinon on l'ignore
  const productId = note.productId && (db.products[accountId] || []).some((p) => p.id === note.productId) ? note.productId : null;
  const now = new Date().toISOString();

  if (note.id) {
    const existing = list.find((n) => n.id === note.id);
    if (!existing) throw new Error('Note introuvable.');
    db.notes[accountId] = list.map((n) => (n.id === note.id ? { ...n, title, content, category, productId, updatedAt: now } : n));
  } else {
    db.notes[accountId] = [...list, { id: uid(), accountId, title, content, category, productId, pinned: !!note.pinned, createdAt: now, updatedAt: now }];
  }
  saveDB(db);
  return db.notes[accountId];
}

// Remplacé par : DELETE /api/notes/:id
export async function deleteNote(accountId, noteId) {
  await delay();
  const db = loadDB();
  db.notes = db.notes || {};
  db.notes[accountId] = (db.notes[accountId] || []).filter((n) => n.id !== noteId);
  saveDB(db);
  return db.notes[accountId];
}

// Remplacé par : PATCH /api/notes/:id/pin
// N'actualise pas updatedAt : épingler ne modifie pas le contenu.
export async function togglePinNote(accountId, noteId) {
  await delay();
  const db = loadDB();
  db.notes = db.notes || {};
  db.notes[accountId] = (db.notes[accountId] || []).map((n) => (n.id === noteId ? { ...n, pinned: !n.pinned } : n));
  saveDB(db);
  return db.notes[accountId];
}

// ── CHALLENGES (objectifs) ───────────────────────────────────
// Rangés par compte dans db.challenges[accountId]. Seule la définition
// est stockée : la progression et le statut sont recalculés à chaque
// affichage (computeChallengeProgress dans utils/calc.js).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Remplacé par : GET /api/challenges
export async function listChallenges(accountId) {
  await delay();
  return loadDB().challenges?.[accountId] || [];
}

// Remplacé par : POST /api/challenges (création) et PUT /api/challenges/:id (modification)
export async function saveChallenge(accountId, challenge) {
  await delay();
  const type = challenge.type;
  if (!CHALLENGE_TYPES[type]) throw new Error("Choisis un type d'objectif.");
  const target = Number(challenge.target);
  if (!Number.isFinite(target) || target <= 0) throw new Error("L'objectif doit être supérieur à 0.");
  if (CHALLENGE_TYPES[type].unit === 'count' && !Number.isInteger(target)) throw new Error("L'objectif doit être un nombre entier.");
  const { startDate, endDate } = challenge;
  if (!ISO_DATE.test(startDate || '') || !ISO_DATE.test(endDate || '')) throw new Error('Choisis une date de début et une date de fin.');
  if (endDate <= startDate) throw new Error('La date de fin doit être après la date de début.');

  const db = loadDB();
  db.challenges = db.challenges || {};
  const list = db.challenges[accountId] || [];
  let productId = null;
  if (type === 'product_units') {
    if (!challenge.productId) throw new Error('Choisis le produit concerné.');
    if (!(db.products[accountId] || []).some((pr) => pr.id === challenge.productId)) throw new Error('Produit introuvable.');
    productId = challenge.productId;
  }
  const title = String(challenge.title || '').trim().slice(0, 120);
  if (!title) throw new Error('Donne un titre à ton challenge.');
  const now = new Date().toISOString();
  const data = { title, type, target, productId, startDate, endDate };

  if (challenge.id) {
    if (!list.some((c) => c.id === challenge.id)) throw new Error('Challenge introuvable.');
    db.challenges[accountId] = list.map((c) => (c.id === challenge.id ? { ...c, ...data, updatedAt: now } : c));
  } else {
    db.challenges[accountId] = [...list, { id: uid(), accountId, ...data, createdAt: now, updatedAt: now }];
  }
  saveDB(db);
  return db.challenges[accountId];
}

// Remplacé par : DELETE /api/challenges/:id
export async function deleteChallenge(accountId, challengeId) {
  await delay();
  const db = loadDB();
  db.challenges = db.challenges || {};
  db.challenges[accountId] = (db.challenges[accountId] || []).filter((c) => c.id !== challengeId);
  saveDB(db);
  return db.challenges[accountId];
}

function sanitize(account) {
  const { password, ...rest } = account;
  return rest;
}

// ── SUPER-ADMIN (toi) ────────────────────────────────────────────
export async function listAllAccounts() {
  await delay();
  return loadDB().accounts.map(sanitize);
}
export async function setSubscriptionStatus(accountId, status) {
  await delay();
  const db = loadDB();
  const account = db.accounts.find((a) => a.id === accountId);
  if (account) {
    account.subscription.status = status;
    saveDB(db);
  }
  return sanitize(account);
}
