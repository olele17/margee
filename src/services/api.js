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

// ── ABONNEMENT / PAIEMENT (Bictorys — à brancher côté backend) ──
export const PLANS = {
  mensuel: { label: 'Mensuel', price: 5000, days: 30 },
  annuel: { label: 'Annuel', price: 50000, days: 365 },
};

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
export async function subscribe(accountId, planKey) {
  await delay(300);
  const db = loadDB();
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Compte introuvable.');
  const plan = PLANS[planKey];
  if (!plan) throw new Error('Plan invalide.');
  const expiresAt = new Date(Date.now() + plan.days * 86400000).toISOString();
  account.subscription = { status: 'active', plan: planKey, expiresAt };
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
