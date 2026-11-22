// ══════════════════════════════════════════════════════════════════
// Edge Function « bictorys-checkout » : démarre un paiement Pro / Elite
//
//   1. Vérifie le jeton de session de l'e-commerçant.
//   2. checkout_create_payment (base) : ligne « pending », montant
//      calculé depuis la table plans. Le navigateur n'envoie que le plan
//      et la période, jamais un montant.
//   3. Crée la charge chez Bictorys (page de paiement hébergée :
//      Wave, Orange Money, Free Money, carte…) et renvoie son lien.
//
// L'abonnement n'est PAS activé ici : seulement par le webhook
// (bictorys-webhook) une fois le paiement confirmé par Bictorys.
//
// Secrets (Supabase → Edge Functions → Secrets), jamais dans le front :
//   BICTORYS_SECRET_KEY   clé secrète API (mode Test ou Live)
//   BICTORYS_API_URL      optionnel, défaut https://api.test.bictorys.com
//   BICTORYS_COUNTRY      optionnel, défaut SN
// ══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
const fail = (status: number, error: string) => reply(status, { error });

// Origine du site pour les pages de retour : localhost (dev) ou https
function siteOrigin(req: Request, body: Record<string, unknown>): string | null {
  const candidate = typeof body.origin === 'string' ? body.origin : req.headers.get('Origin') || '';
  if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(candidate)) return candidate;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(candidate)) return candidate;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Méthode non autorisée.');

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return fail(500, 'Configuration serveur manquante.');
  const apiKey = Deno.env.get('BICTORYS_SECRET_KEY');
  if (!apiKey) return fail(503, 'Le paiement en ligne n\'est pas encore configuré. Réessaie plus tard.');
  const apiUrl = (Deno.env.get('BICTORYS_API_URL') || 'https://api.test.bictorys.com').replace(/\/+$/, '');
  const country = (Deno.env.get('BICTORYS_COUNTRY') || 'SN').toUpperCase();
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── Qui paie ? ──────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Connexion requise.');
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return fail(401, 'Session expirée : reconnecte-toi.');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, 'Requête invalide.'); }
  const plan = String(body.plan || '');
  const billing = String(body.billing || 'monthly');
  const origin = siteOrigin(req, body);
  if (!origin) return fail(400, 'Adresse du site invalide.');

  // ── Paiement « en attente » créé par la base ───────────────────
  const { data: pay, error: payErr } = await db.rpc('checkout_create_payment', {
    p_account_id: user.id, p_plan: plan, p_billing: billing,
  });
  if (payErr || !pay) {
    const known = ['P0001', 'P0002', '22023', '42501'].includes(String(payErr?.code));
    return fail(known ? 400 : 500, known ? payErr!.message : 'Impossible de préparer le paiement. Réessaie.');
  }

  const back = `${origin}/abonnement/retour?ref=${encodeURIComponent(pay.reference)}`;
  const customer: Record<string, string> = {
    name: String(pay.owner_name || pay.business_name || 'Client Margee+').slice(0, 100),
    email: String(pay.email || user.email || ''),
    country,
  };
  const phone = String(pay.phone || '').replace(/[\s.-]/g, '');
  if (/^\+?\d{8,15}$/.test(phone)) customer.phone = phone;

  // ── Charge Bictorys ─────────────────────────────────────────────
  let res: Response;
  let out: Record<string, unknown> = {};
  try {
    res = await fetch(`${apiUrl}/pay/v1/charges`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        amount: pay.amount,
        currency: pay.currency,
        country,
        paymentReference: pay.reference,
        merchantReference: user.id,
        successRedirectUrl: back,
        errorRedirectUrl: `${back}&statut=echec`,
        customerObject: customer,
      }),
      signal: AbortSignal.timeout(20000),
    });
    out = await res.json().catch(() => ({}));
  } catch (e) {
    await db.from('payments').update({ status: 'failed', raw: { created_by: 'checkout', error: 'network', detail: String(e).slice(0, 300) } })
      .eq('provider_ref', pay.reference);
    return fail(502, 'Bictorys ne répond pas. Réessaie dans un instant.');
  }

  const link = String(out.link || out.redirectUrl || out.checkoutUrl || out.paymentUrl || '');
  const chargeId = out.chargeId || out.id ? String(out.chargeId || out.id) : null;
  if (!res.ok || !/^https:\/\//.test(link)) {
    await db.from('payments').update({
      status: 'failed',
      raw: { created_by: 'checkout', error: 'bictorys', http_status: res.status, response: out },
    }).eq('provider_ref', pay.reference);
    console.error('bictorys charge error', res.status, JSON.stringify(out).slice(0, 500));
    return fail(502, 'Bictorys n\'a pas pu créer le paiement. Réessaie dans un instant.');
  }

  await db.from('payments').update({
    provider_charge_id: chargeId,
    raw: { created_by: 'checkout', charge_created_at: new Date().toISOString(), charge_id: chargeId },
  }).eq('provider_ref', pay.reference);

  return reply(200, { url: link, reference: pay.reference });
});
