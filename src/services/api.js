/**
 * ══════════════════════════════════════════════════════════════════
 * COUCHE DE DONNÉES — SUPABASE (auth + Postgres + RLS)
 * ══════════════════════════════════════════════════════════════════
 * Chaque fonction garde le même nom, la même signature (accountId en
 * premier paramètre) et la même forme de retour que l'ancienne version
 * localStorage — aucun composant React n'a besoin de changer.
 *
 * L'isolation des données entre comptes est appliquée par la base
 * (Row Level Security, voir supabase/schema.sql), pas seulement par le
 * filtre `.eq('account_id', accountId)` ci-dessous — celui-ci reste une
 * défense en profondeur, pas la seule protection.
 * ══════════════════════════════════════════════════════════════════
 */

import { supabase } from './supabaseClient';

// ── MAPPING DB (snake_case) → APP (camelCase) ────────────────────
function mapProfile(row) {
  return {
    id: row.id,
    ownerName: row.owner_name,
    businessName: row.business_name,
    phone: row.phone,
    email: row.email,
    role: 'owner',
    createdAt: row.created_at,
    subscription: {
      status: row.subscription_status,
      plan: row.subscription_plan,
      expiresAt: row.subscription_expires_at,
    },
    receiptSettings: {
      logo: row.receipt_logo,
      address: row.receipt_address,
      city: row.receipt_city,
      note: row.receipt_note,
      signatureType: row.receipt_signature_type,
      signatureImage: row.receipt_signature_image,
    },
  };
}
function mapProduct(row) {
  return { id: row.id, name: row.name, category: row.category, costPrice: Number(row.cost_price), price: Number(row.price) };
}
function mapSale(row) {
  return {
    id: row.id,
    date: row.date,
    productId: row.product_id,
    productName: row.product_name,
    qty: Number(row.qty),
    costPrice: Number(row.cost_price),
    price: Number(row.price),
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientAddress: row.client_address,
    deliveryCost: Number(row.delivery_cost || 0),
    deliveryPaidByClient: row.delivery_paid_by_client,
    receiptNumber: row.receipt_number,
    createdAt: row.created_at,
  };
}
function mapAd(row) {
  return { id: row.id, date: row.date, platform: row.platform, amount: Number(row.amount), note: row.note };
}
function mapInvestment(row) {
  return { id: row.id, date: row.date, description: row.description, amount: Number(row.amount) };
}
function mapExpense(row) {
  return { id: row.id, date: row.date, description: row.description, amount: Number(row.amount), type: row.type };
}

function fail(error) {
  if (error) throw new Error(error.message);
}

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  fail(error);
  return mapProfile(data);
}

// ── AUTH / COMPTES ───────────────────────────────────────────────
export async function signup({ ownerName, businessName, phone, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { owner_name: ownerName, business_name: businessName, phone } },
  });
  fail(error);
  // Le trigger SQL (on_auth_user_created) crée la ligne `profiles` côté serveur.
  // Comme avant, signup() n'ouvre pas de session — c'est doLogin() juste après qui s'en charge.
  return {
    id: data.user?.id,
    ownerName, businessName, phone, email,
    role: 'owner',
    subscription: { status: 'pending', plan: null, expiresAt: null },
  };
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  fail(error);
  return fetchProfile(data.user.id);
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getCurrentAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return fetchProfile(session.user.id);
}

// ── PARAMÈTRES DE FACTURATION (logo, signature, infos reçu) ─────
export async function updateReceiptSettings(accountId, settings) {
  const payload = {};
  if ('logo' in settings) payload.receipt_logo = settings.logo;
  if ('address' in settings) payload.receipt_address = settings.address;
  if ('city' in settings) payload.receipt_city = settings.city;
  if ('note' in settings) payload.receipt_note = settings.note;
  if ('signatureType' in settings) payload.receipt_signature_type = settings.signatureType;
  if ('signatureImage' in settings) payload.receipt_signature_image = settings.signatureImage;

  const { data, error } = await supabase.from('profiles').update(payload).eq('id', accountId).select().single();
  fail(error);
  return mapProfile(data);
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
 * met à jour le statut d'abonnement.
 *
 * En attendant le backend, cette version simule une activation
 * immédiate pour pouvoir tester tout le frontend.
 */
export async function subscribe(accountId, planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error('Plan invalide.');
  const expiresAt = new Date(Date.now() + plan.days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update({ subscription_status: 'active', subscription_plan: planKey, subscription_expires_at: expiresAt })
    .eq('id', accountId)
    .select()
    .single();
  fail(error);
  return mapProfile(data);
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
  const { data, error } = await supabase.from('products').select('*').eq('account_id', accountId).order('created_at');
  fail(error);
  return data.map(mapProduct);
}
export async function saveProduct(accountId, product) {
  const row = { name: product.name, category: product.category, cost_price: Number(product.costPrice) || 0, price: Number(product.price) || 0 };
  if (product.id) {
    const { error } = await supabase.from('products').update(row).eq('id', product.id).eq('account_id', accountId);
    fail(error);
  } else {
    const { error } = await supabase.from('products').insert({ ...row, account_id: accountId });
    fail(error);
  }
  return listProducts(accountId);
}
export async function deleteProduct(accountId, productId) {
  const { error } = await supabase.from('products').delete().eq('id', productId).eq('account_id', accountId);
  fail(error);
  return listProducts(accountId);
}

// ── VENTES + REÇUS ────────────────────────────────────────────────
export async function listSales(accountId) {
  const { data, error } = await supabase.from('sales').select('*').eq('account_id', accountId).order('created_at');
  fail(error);
  return data.map(mapSale);
}
export async function recordSale(accountId, sale) {
  const { data: receiptNumber, error: rpcError } = await supabase.rpc('next_receipt_number', { p_account_id: accountId });
  fail(rpcError);

  const { data, error } = await supabase
    .from('sales')
    .insert({
      account_id: accountId,
      date: sale.date,
      product_id: sale.productId,
      product_name: sale.productName,
      qty: sale.qty,
      cost_price: sale.costPrice,
      price: sale.price,
      client_name: sale.clientName,
      client_phone: sale.clientPhone,
      client_address: sale.clientAddress,
      delivery_cost: sale.deliveryCost || 0,
      delivery_paid_by_client: !!sale.deliveryPaidByClient,
      receipt_number: receiptNumber,
    })
    .select()
    .single();
  fail(error);
  return mapSale(data);
}
export async function deleteSale(accountId, saleId) {
  const { error } = await supabase.from('sales').delete().eq('id', saleId).eq('account_id', accountId);
  fail(error);
  return listSales(accountId);
}

// ── PUBS DÉPENSÉES ───────────────────────────────────────────────
export async function listAds(accountId) {
  const { data, error } = await supabase.from('ads').select('*').eq('account_id', accountId).order('created_at');
  fail(error);
  return data.map(mapAd);
}
export async function saveAdSpend(accountId, ad) {
  const row = { date: ad.date, platform: ad.platform, amount: Number(ad.amount) || 0, note: ad.note };
  if (ad.id) {
    const { error } = await supabase.from('ads').update(row).eq('id', ad.id).eq('account_id', accountId);
    fail(error);
  } else {
    const { error } = await supabase.from('ads').insert({ ...row, account_id: accountId });
    fail(error);
  }
  return listAds(accountId);
}
export async function deleteAdSpend(accountId, adId) {
  const { error } = await supabase.from('ads').delete().eq('id', adId).eq('account_id', accountId);
  fail(error);
  return listAds(accountId);
}

// ── INVESTISSEMENTS ──────────────────────────────────────────────
export async function listInvestments(accountId) {
  const { data, error } = await supabase.from('investments').select('*').eq('account_id', accountId).order('created_at');
  fail(error);
  return data.map(mapInvestment);
}
export async function saveInvestment(accountId, inv) {
  const row = { date: inv.date, description: inv.description, amount: Number(inv.amount) || 0 };
  if (inv.id) {
    const { error } = await supabase.from('investments').update(row).eq('id', inv.id).eq('account_id', accountId);
    fail(error);
  } else {
    const { error } = await supabase.from('investments').insert({ ...row, account_id: accountId });
    fail(error);
  }
  return listInvestments(accountId);
}
export async function deleteInvestment(accountId, invId) {
  const { error } = await supabase.from('investments').delete().eq('id', invId).eq('account_id', accountId);
  fail(error);
  return listInvestments(accountId);
}

// ── DÉPENSES (actif / passif) ────────────────────────────────────
export async function listExpenses(accountId) {
  const { data, error } = await supabase.from('expenses').select('*').eq('account_id', accountId).order('created_at');
  fail(error);
  return data.map(mapExpense);
}
export async function saveExpense(accountId, expense) {
  const row = { date: expense.date, description: expense.description, amount: Number(expense.amount) || 0, type: expense.type || 'passif' };
  if (expense.id) {
    const { error } = await supabase.from('expenses').update(row).eq('id', expense.id).eq('account_id', accountId);
    fail(error);
  } else {
    const { error } = await supabase.from('expenses').insert({ ...row, account_id: accountId });
    fail(error);
  }
  return listExpenses(accountId);
}
export async function deleteExpense(accountId, expenseId) {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId).eq('account_id', accountId);
  fail(error);
  return listExpenses(accountId);
}

// ── SUPER-ADMIN ──────────────────────────────────────────────────
// ⚠️ Non fonctionnel avec la RLS actuelle : un utilisateur normal ne peut
// lire/modifier que sa propre ligne `profiles`. À revoir avec un vrai rôle
// admin (colonne + policy dédiée) avant de remettre cette page en service.
export async function listAllAccounts() {
  const { data, error } = await supabase.from('profiles').select('*');
  fail(error);
  return data.map(mapProfile);
}
export async function setSubscriptionStatus(accountId, status) {
  const payload = { subscription_status: status };
  if (status === 'active') {
    // Réactiver prolonge aussi l'expiration — sinon un compte déjà expiré
    // resterait bloqué malgré la réactivation (expiresAt resterait dans le passé).
    payload.subscription_expires_at = new Date(Date.now() + PLANS.mensuel.days * 86400000).toISOString();
  }
  const { data, error } = await supabase.from('profiles').update(payload).eq('id', accountId).select().single();
  fail(error);
  return mapProfile(data);
}
