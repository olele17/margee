/**
 * ══════════════════════════════════════════════════════════════════
 * COUCHE DE DONNÉES — SIMULATION LOCALE (à remplacer par le backend)
 * ══════════════════════════════════════════════════════════════════
 * Toutes les fonctions ici sont déjà `async` et retournent des Promises,
 * exactement comme le fera un vrai appel `fetch()` vers l'API backend.
 * Pour brancher le vrai backend plus tard (Node/Express + DB + Bictorys),
 * il suffit de remplacer le CORPS de chaque fonction par un fetch() —
 * aucun composant React n'a besoin de changer.
 *
 * Exemple de migration :
 *   export async function login(email, password) {
 *     const res = await fetch(`${API_URL}/auth/login`, {
 *       method: 'POST', headers: {'Content-Type':'application/json'},
 *       body: JSON.stringify({ email, password })
 *     });
 *     if (!res.ok) throw new Error((await res.json()).message);
 *     return res.json(); // { account, token }
 *   }
 * ══════════════════════════════════════════════════════════════════
 */

import { buildDemoData, DEMO_EMAIL, DEMO_PASSWORD } from './demoData';
import { CHALLENGE_TYPES } from '../utils/calc';

const DB_KEY = 'easyswap_db_v1';
const SESSION_KEY = 'easyswap_session';

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

// ── AUTH / COMPTES ───────────────────────────────────────────────
export async function signup({ ownerName, businessName, phone, email, password }) {
  await delay();
  const db = loadDB();
  if (db.accounts.some((a) => a.email === email)) {
    throw new Error('Un compte existe déjà avec cet email.');
  }
  const account = {
    id: uid(),
    ownerName,
    businessName,
    phone,
    email,
    password, // ⚠️ démo uniquement — le backend doit hasher (bcrypt/argon2)
    role: 'owner',
    createdAt: new Date().toISOString(),
    subscription: { status: 'pending', plan: null, expiresAt: null }, // pending | active | expired
  };
  db.accounts.push(account);
  db.products[account.id] = [];
  db.sales[account.id] = [];
  db.ads[account.id] = [];
  db.investments[account.id] = [];
  db.expenses = db.expenses || {};
  db.expenses[account.id] = [];
  db.receiptSeq[account.id] = 0;
  saveDB(db);
  return sanitize(account);
}

export async function login(email, password) {
  await delay();
  const db = loadDB();
  const account = db.accounts.find((a) => a.email === email && a.password === password);
  if (!account) throw new Error('Email ou mot de passe incorrect.');
  const session = { accountId: account.id, token: uid() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return sanitize(account);
}

/**
 * Compte de démonstration : crée (ou remet à zéro) un compte Elite rempli
 * de données d'exemple, puis renvoie ses identifiants pour se connecter.
 */
export async function resetDemoAccount() {
  await delay();
  const db = loadDB();
  const existing = db.accounts.find((a) => a.email === DEMO_EMAIL);
  const id = existing ? existing.id : uid();
  const demo = buildDemoData(id);
  db.accounts = [...db.accounts.filter((a) => a.id !== id), demo.account];
  db.products[id] = demo.products;
  db.sales[id] = demo.sales;
  db.ads[id] = demo.ads;
  db.investments[id] = demo.investments;
  db.expenses = db.expenses || {};
  db.expenses[id] = demo.expenses;
  db.receiptSeq[id] = demo.receiptSeq;
  db.notes = db.notes || {};
  db.notes[id] = demo.notes || [];
  db.challenges = db.challenges || {};
  db.challenges[id] = demo.challenges || [];
  saveDB(db);
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export async function getCurrentAccount() {
  await delay(50);
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (!session) return null;
  const db = loadDB();
  const account = db.accounts.find((a) => a.id === session.accountId);
  return account ? sanitize(account) : null;
}

function sanitize(account) {
  const { password, ...rest } = account;
  return rest;
}

// ── PARAMÈTRES DE FACTURATION (logo, signature, infos reçu) ─────
export async function updateReceiptSettings(accountId, settings) {
  await delay();
  const db = loadDB();
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Compte introuvable.');
  account.receiptSettings = { ...(account.receiptSettings || {}), ...settings };
  saveDB(db);
  return sanitize(account);
}

// ── INFORMATIONS DE L'ENTREPRISE (nom, propriétaire, téléphone) ──
// L'email de connexion n'est pas modifié ici : l'email affiché sur les
// reçus est stocké à part dans receiptSettings.email.
export async function updateBusinessInfo(accountId, info) {
  await delay();
  const db = loadDB();
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Compte introuvable.');
  if ('businessName' in info) {
    if (!String(info.businessName).trim()) throw new Error('Le nom de l\'entreprise est obligatoire.');
    account.businessName = String(info.businessName).trim();
  }
  if ('ownerName' in info) account.ownerName = String(info.ownerName).trim();
  if ('phone' in info) account.phone = String(info.phone).trim();
  saveDB(db);
  return sanitize(account);
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
 * TODO BACKEND : cette fonction doit appeler ton endpoint backend
 * (ex: POST /api/subscribe) qui lui-même appelle l'API Bictorys pour
 * créer une session de paiement (checkout hébergé) et renvoie l'URL
 * de redirection. La clé secrète Bictorys ne doit JAMAIS être ici.
 * Une fois le paiement confirmé via webhook côté backend, le backend
 * met à jour account.subscription = { status:'active', plan, expiresAt }.
 *
 * En attendant le backend, cette version simule une activation
 * immédiate pour pouvoir tester tout le frontend.
 */
export async function subscribe(accountId, planKey, billing = 'monthly') {
  await delay(300);
  const db = loadDB();
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Compte introuvable.');
  const plan = PLANS[planKey];
  if (!plan) throw new Error('Plan invalide.');
  const yearly = billing === 'yearly' && plan.price > 0;
  const days = yearly ? ANNUAL_DAYS : plan.days;
  const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
  account.subscription = {
    status: 'active',
    plan: planKey,
    billing: yearly ? 'yearly' : 'monthly',
    amountPaid: yearly ? annualPrice(plan) : plan.price,
    expiresAt,
  };
  saveDB(db);
  return sanitize(account);
}

export function isSubscriptionActive(account) {
  if (!account) return false;
  const { status, expiresAt } = account.subscription || {};
  if (status !== 'active') return false;
  if (expiresAt && new Date(expiresAt) < new Date()) return false;
  return true;
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
