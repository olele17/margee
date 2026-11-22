// ══════════════════════════════════════════════════════════════════
// Edge Function « bictorys-webhook » : notifications de paiement
//
// URL à déclarer dans Bictorys (Développeurs → Webhooks) :
//   https://<projet>.supabase.co/functions/v1/bictorys-webhook
//
// Sécurité : Bictorys envoie la clé secrète du webhook dans l'en-tête
// X-Secret-Key. Elle est comparée (temps constant) au secret
// BICTORYS_WEBHOOK_SECRET ; sans elle, rien n'est lu.
// L'application au compte se fait dans la base (payment_webhook_apply) :
// idempotente (un paiement réussi n'est jamais appliqué deux fois) et
// le montant reçu doit être exactement celui du paiement créé.
// ══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function sameSecret(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

// Statuts Bictorys (anglais ou français selon les exemples) → valeurs connues de la base
function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  // Les échecs d'abord : « unsuccessful » ou « non reussi » ne sont pas des réussites
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
  if (req.method !== 'POST') return json(405, { error: 'method' });

  // trim : un espace ou un retour à la ligne collé avec le secret ne bloque pas tout
  const secret = Deno.env.get('BICTORYS_WEBHOOK_SECRET')?.trim();
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !url || !serviceKey) return json(503, { error: 'not_configured' });

  const given = (req.headers.get('X-Secret-Key') || req.headers.get('x-secret-key') || '').trim();
  if (!given || !sameSecret(given, secret)) return json(401, { error: 'unauthorized' });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }
  // Certains exemples enveloppent la transaction dans « data »
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : payload) as Record<string, unknown>;

  const reference = String(pick(data, 'paymentReference', 'payment_reference') ?? pick(payload, 'paymentReference') ?? '');
  const chargeId = String(pick(data, 'chargeId', 'id', 'transactionId') ?? '');
  const statusRaw = String(pick(data, 'status') ?? pick(payload, 'status', 'type', 'event') ?? '');
  const amountRaw = pick(data, 'amount');
  const amount = amountRaw === undefined ? null : Math.round(Number(amountRaw));
  const currency = String(pick(data, 'currency') ?? 'XOF');
  const method = String(pick(data, 'paymentMeans', 'payment_type', 'paymentType', 'paymentMethod', 'pspName') ?? '');

  if (!reference && !chargeId) return json(200, { received: true, result: 'no_reference' });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: result, error } = await db.rpc('payment_webhook_apply', {
    p_reference: reference || null,
    p_charge_id: chargeId || null,
    p_status: normalizeStatus(statusRaw),
    p_amount: Number.isFinite(amount) ? amount : null,
    p_currency: currency,
    p_method: method || null,
    p_raw: payload,
  });
  if (error) {
    console.error('payment_webhook_apply', error.message);
    return json(500, { error: 'db' }); // Bictorys réessaiera
  }
  if (result?.result !== 'applied' && result?.result !== 'already_applied') {
    console.log('bictorys webhook', reference || chargeId, statusRaw, result?.result);
  }
  return json(200, { received: true, result: result?.result ?? null });
});
