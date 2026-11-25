/**
 * Lien de parrainage : https://www.margeeplus.com/?ref=CODE
 * Le code est gardé 60 jours dans ce navigateur, puis envoyé à
 * l'inscription (la base rattache le compte au partenaire).
 */
const KEY = 'margee.ref';
const TTL = 60 * 24 * 60 * 60 * 1000;
const VALID = /^[A-Z0-9]{4,20}$/;

export function captureReferral() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (!code) return;
    const c = code.trim().toUpperCase();
    if (VALID.test(c)) localStorage.setItem(KEY, JSON.stringify({ c, t: Date.now() }));
  } catch { /* stockage indisponible : pas de parrainage */ }
}

export function getReferral() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || !VALID.test(v.c) || Date.now() - v.t > TTL) return null;
    return v.c;
  } catch { return null; }
}

export function clearReferral() {
  try { localStorage.removeItem(KEY); } catch { /* rien */ }
}

export const referralLink = (code) => `${window.location.origin}/?ref=${code}`;
