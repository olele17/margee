// ══════════════════════════════════════════════════════════════════
// Edge Function « bictorys-verify » : vérifie un paiement AUPRÈS DE
// BICTORYS (en plus du webhook)
//
// Appelée par la page de retour (/abonnement/retour) : le serveur
// demande lui-même à Bictorys le statut de la transaction, avec la clé
// API (permission TransactionsRd). Si Bictorys confirme un paiement
// réussi du bon montant, l'abonnement est activé par la même fonction
// de base que le webhook (payment_webhook_apply : idempotente, montant
// contrôlé). Le navigateur ne peut rien imposer : il ne fournit qu'une
// référence, et seul le propriétaire du paiement (ou un super admin)
// peut la faire vérifier.
// ══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, error: string) => reply(status, { error });

function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (/(cancel|annule)/.test(s)) return 'cancelled';
  if (/(revers|refund|rembours)/.test(s)) return 'reversed';
  if (/(fail|echou|error|expired|declin|refus|unsuccess|non[ _-]?reussi|unpaid)/.test(s)) return 'failed';
  if (/(succeeded|successful|success|reussi|paid|completed)/.test(s)) return 'succeeded';
  if (/(processing|authorized|pending|attente)/.test(s)) return s.includes('authorized') ? 'authorized' : 'pending';
  return s.slice(0, 30) || 'unknown';
}

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Méthode non autorisée.');

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('BICTORYS_SECRET_KEY')?.trim();
  if (!url || !serviceKey || !apiKey) return fail(503, 'Vérification indisponible pour le moment.');
  const apiUrl = (Deno.env.get('BICTORYS_API_URL') || 'https://api.test.bictorys.com').replace(/\/+$/, '');
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Connexion requise.');
  const { data: userData } = await db.auth.getUser(token);
  const user = userData?.user;
  if (!user) return fail(401, 'Session expirée : reconnecte-toi.');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, 'Requête invalide.'); }
  const reference = String(body.reference || '').trim();
  if (!/^MRG-[0-9A-F]{16}$/.test(reference)) return fail(400, 'Référence invalide.');

  const { data: pay } = await db.from('payments')
    .select('id, account_id, status, amount, currency, provider_charge_id').eq('provider_ref', reference).maybeSingle();
  if (!pay) return fail(404, 'Paiement introuvable.');
  if (pay.account_id !== user.id) {
    const { data: adm } = await db.from('admins').select('role, disabled_at').eq('user_id', user.id).maybeSingle();
    if (!adm || adm.disabled_at || adm.role !== 'super_admin') return fail(404, 'Paiement introuvable.');
  }
  if (pay.status === 'success') return reply(200, { status: 'success' });
  if (!pay.provider_charge_id) return reply(200, { status: pay.status });

  // Statut auprès de Bictorys : recherche par notre référence de paiement
  // (GET /transactions/search?payment_reference=…, documentée), puis par
  // identifiant direct en secours.
  let tx: Record<string, unknown> | null = null;
  let httpStatus = 0;
  const get = async (path: string) => {
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    httpStatus = res.status;
    return res.ok ? await res.json().catch(() => null) : null;
  };
  try {
    const found = await get(`/pay/v1/transactions/search?payment_reference=${encodeURIComponent(reference)}`);
    const list = (Array.isArray(found) ? found : Array.isArray(found?.data) ? found.data : Array.isArray(found?.content) ? found.content : []) as Record<string, unknown>[];
    // Priorité : une transaction réussie de ce paiement, sinon la plus récente
    const mine = list.filter((t) => !t.paymentReference || t.paymentReference === reference);
    tx = mine.find((t) => normalizeStatus(String(t.status ?? '')) === 'succeeded') || mine[0] || null;
  } catch { /* on tente l'accès direct */ }
  if (!tx) {
    try { tx = await get(`/pay/v1/transactions/${pay.provider_charge_id}`); } catch { /* rien */ }
  }
  if (!tx) {
    console.error('bictorys-verify : statut introuvable', reference, httpStatus);
    return reply(200, { status: pay.status, checked: false, http_status: httpStatus });
  }
  const data = (tx.data && typeof tx.data === 'object' ? tx.data : tx) as Record<string, unknown>;
  const statusRaw = String(pick(data, 'status', 'paymentStatus', 'state') ?? '');
  const amountRaw = pick(data, 'amount');
  const amount = amountRaw === undefined ? null : Math.round(Number(amountRaw));
  const method = String(pick(data, 'paymentMeans', 'payment_type', 'paymentType', 'paymentMethod', 'pspName') ?? '');
  const normalized = normalizeStatus(statusRaw);

  const { data: result, error } = await db.rpc('payment_webhook_apply', {
    p_reference: reference,
    p_charge_id: pay.provider_charge_id,
    p_status: normalized,
    p_amount: Number.isFinite(amount) ? amount : null,
    p_currency: String(pick(data, 'currency') ?? pay.currency ?? 'XOF'),
    p_method: method || null,
    p_raw: { source: 'verify', transaction: tx },
  });
  if (error) {
    console.error('bictorys-verify apply', error.message);
    return fail(500, 'Vérification impossible. Réessaie dans un instant.');
  }
  const r = result?.result;
  const status = r === 'applied' || r === 'already_applied' ? 'success' : r === 'failed' ? 'failed' : 'pending';
  const summary = {
    status: statusRaw || null, amount: data.amount ?? null, currency: data.currency ?? null,
    merchantFees: data.merchantFees ?? null, customerFees: data.customerFees ?? null, type: data.type ?? null,
  };
  if (status !== 'success') console.log('bictorys-verify', reference, r, JSON.stringify(summary));
  return reply(200, { status, checked: true, bictorys_status: statusRaw || null, result: r ?? null, ...(pay.account_id !== user.id ? { summary } : {}) });
});
