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
