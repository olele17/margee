// ══════════════════════════════════════════════════════════════════
// Edge Function « admin-actions » : actions sensibles de l'espace admin
//
//   reset_password  (super_admin) : envoie l'email de réinitialisation
//   delete_account  (super_admin) : supprime le compte et toutes ses
//                                   données ; les paiements sont gardés
//                                   mais anonymisés (account_id → null)
//   invite_admin    (super_admin) : invite un membre de l'équipe (email
//                                   envoyé par Supabase, ou lien à partager)
//
// La clé service_role vient de l'environnement Supabase
// (SUPABASE_SERVICE_ROLE_KEY) : elle n'est jamais envoyée au navigateur.
// L'appelant est vérifié ICI : jeton de session valide + rôle dans la
// table admins. Chaque action exige un motif et est écrite au journal.
// ══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
const fail = (status: number, error: string) => reply(status, { error });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Méthode non autorisée.');

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return fail(500, 'Configuration serveur manquante.');
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── Qui appelle ? ───────────────────────────────────────────────
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Connexion requise.');
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  const caller = userData?.user;
  if (userErr || !caller) return fail(401, 'Session expirée : reconnecte-toi.');

  const { data: adminRow } = await db.from('admins').select('role, disabled_at').eq('user_id', caller.id).maybeSingle();
  if (!adminRow || adminRow.disabled_at) return fail(403, 'Accès réservé aux administrateurs.');
  if (adminRow.role !== 'super_admin') return fail(403, 'Action réservée au super admin.');

  // ── Paramètres ──────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, 'Requête invalide.'); }
  const action = String(body.action || '');
  const reason = String(body.reason || '').trim();
  if (reason.length < 3) return fail(400, 'Motif obligatoire : explique en quelques mots pourquoi (3 caractères minimum).');
  if (reason.length > 500) return fail(400, 'Motif trop long (500 caractères maximum).');

  // ── Invitation d'un membre de l'équipe ──────────────────────────
  // mode « email » : Supabase envoie l'invitation ;
  // mode « link »  : le lien est renvoyé au super admin, qui le transmet
  //                  lui-même (utile tant que l'envoi d'emails est limité).
  // L'email est d'abord inscrit dans admin_invitations : le compte passe
  // même quand les inscriptions sont fermées. Un email déjà utilisé par un e-commerçant
  // est refusé (les comptes de l'équipe restent séparés).
  if (action === 'invite_admin') {
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || '');
    const mode = body.mode === 'link' ? 'link' : 'email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return fail(400, 'Adresse email invalide.');
    if (role !== 'super_admin' && role !== 'support') return fail(400, 'Rôle invalide.');
    const redirectTo = typeof body.redirect_to === 'string' && /^https?:\/\/[^\s]+\/reinitialiser-mot-de-passe\?invitation=1$/.test(body.redirect_to)
      ? body.redirect_to : undefined;

    const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing) {
      const { data: member } = await db.from('admins').select('disabled_at').eq('user_id', existing.id).maybeSingle();
      if (member?.disabled_at) return fail(409, 'Cette personne fait déjà partie de l\'équipe (désactivée) : réactive-la dans la liste.');
      if (member) return fail(409, 'Cette personne fait déjà partie de l\'équipe.');
      return fail(409, 'Cet email est déjà celui d\'un compte e-commerçant. Utilise une autre adresse pour l\'équipe.');
    }

    // Laisse passer cet email même si les inscriptions sont fermées
    // (lu par le trigger d'inscription ; table réservée à la clé service_role)
    const { error: invErr } = await db.from('admin_invitations')
      .upsert({ email, role, invited_by: caller.id, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() });
    if (invErr) return fail(500, 'Invitation impossible. Réessaie.');
    const clearInvitation = () => db.from('admin_invitations').delete().eq('email', email);

    const meta = { business_name: 'Équipe Margee+' };
    let userId: string | undefined;
    let link: string | undefined;
    if (mode === 'link') {
      const { data, error } = await db.auth.admin.generateLink({ type: 'invite', email, options: { data: meta, redirectTo } });
      if (error) {
        console.error('generateLink', error.message);
        await clearInvitation();
        return fail(502, /already|registered|exists/i.test(error.message) ? 'Cet email a déjà un compte.' : 'Lien d\'invitation impossible à créer. Réessaie.');
      }
      userId = data.user?.id;
      link = data.properties?.action_link;
    } else {
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, { data: meta, redirectTo });
      if (error) {
        console.error('inviteUserByEmail', error.message);
        await clearInvitation();
        const msg = /rate|limit|seconds/i.test(error.message)
          ? 'Trop d\'emails envoyés : réessaie plus tard, ou crée un lien à partager.'
          : /already|registered|exists/i.test(error.message)
            ? 'Cet email a déjà un compte.'
            : 'Email d\'invitation non envoyé. Crée plutôt un lien à partager.';
        return fail(502, msg);
      }
      userId = data.user?.id;
    }
    await clearInvitation();
    if (!userId) return fail(500, 'Invitation impossible. Réessaie.');

    const { error: insErr } = await db.from('admins').insert({ user_id: userId, role, invited_by: caller.id });
    if (insErr) {
      await db.auth.admin.deleteUser(userId); // pas de compte orphelin
      return fail(500, 'Invitation impossible. Réessaie.');
    }
    await db.from('admin_audit_log').insert({
      admin_id: caller.id, admin_email: caller.email, action: 'admin.invite',
      account_id: userId, before: null, after: { email, role, mode }, reason,
    });
    return reply(200, { ok: true, user_id: userId, email, role, mode, ...(link ? { link } : {}) });
  }

  const accountId = String(body.account_id || '');
  if (!UUID.test(accountId)) return fail(400, 'Compte invalide.');

  // Cible : un e-commerçant existant, jamais un compte admin
  const { data: target } = await db.from('profiles').select('id, business_name, email').eq('id', accountId).maybeSingle();
  if (!target) return fail(404, 'Compte e-commerçant introuvable.');
  const { data: targetAdmin } = await db.from('admins').select('user_id').eq('user_id', accountId).maybeSingle();
  if (targetAdmin) return fail(403, 'Ce compte est un compte administrateur : action impossible ici.');

  const audit = (act: string, before: unknown, after: unknown) =>
    db.from('admin_audit_log').insert({
      admin_id: caller.id, admin_email: caller.email, action: act,
      account_id: accountId, before, after, reason,
    });

  // ── Réinitialisation du mot de passe ────────────────────────────
  if (action === 'reset_password') {
    const redirectTo = typeof body.redirect_to === 'string' && /^https?:\/\/[^\s]+\/reinitialiser-mot-de-passe$/.test(body.redirect_to)
      ? body.redirect_to : undefined;
    const { error } = await db.auth.resetPasswordForEmail(target.email, redirectTo ? { redirectTo } : undefined);
    if (error) {
      const msg = /rate|limit|seconds/i.test(error.message)
        ? 'Trop d\'emails envoyés : réessaie dans quelques minutes.'
        : 'Email non envoyé. Réessaie plus tard.';
      return fail(502, msg);
    }
    await audit('merchant.reset_password', null, { email_sent_to: target.email });
    return reply(200, { ok: true, email: target.email });
  }

  // ── Suppression du compte ───────────────────────────────────────
  if (action === 'delete_account') {
    const confirmName = String(body.confirm_name || '').trim();
    if (confirmName !== target.business_name.trim()) {
      return fail(400, 'Le nom de la boutique ne correspond pas : suppression annulée.');
    }
    const { data: sub } = await db.from('subscriptions').select('plan_id, status').eq('account_id', accountId).maybeSingle();
    const { count: paymentsCount } = await db.from('payments').select('id', { count: 'exact', head: true }).eq('account_id', accountId);

    // 1. Paiements conservés pour la comptabilité, sans données personnelles
    const { error: anonErr } = await db.from('payments')
      .update({ raw: { anonymized: true, account_deleted_at: new Date().toISOString() } })
      .eq('account_id', accountId);
    if (anonErr) return fail(500, 'Anonymisation des paiements impossible : suppression annulée.');

    // 2. Suppression de l'utilisateur : le profil et toutes ses données
    //    suivent (on delete cascade) ; payments.account_id passe à null.
    const { error: delErr } = await db.auth.admin.deleteUser(accountId);
    if (delErr) return fail(500, 'Suppression impossible. Réessaie plus tard.');

    // 3. Journal : seulement le nom de la boutique (plus d'email)
    await audit('merchant.delete',
      { business_name: target.business_name, plan_id: sub?.plan_id ?? null, status: sub?.status ?? null },
      { deleted: true, payments_kept_anonymized: paymentsCount ?? 0 });
    return reply(200, { ok: true });
  }

  return fail(400, 'Action inconnue.');
});
