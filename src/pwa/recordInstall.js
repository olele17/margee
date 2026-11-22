import { supabase } from '../lib/supabase';
import { isStandalone, deviceKind, subscribe } from './installState';

/**
 * Enregistre l'installation de l'application (table app_installs) :
 *  - à l'événement « appinstalled » (Android, ordinateur) ;
 *  - à la première ouverture en plein écran (iPhone n'envoie pas
 *    d'événement : on détecte l'ouverture depuis l'écran d'accueil).
 * Une seule ligne par compte et par type d'appareil ; si l'utilisateur
 * n'est pas encore connecté, l'installation est notée et envoyée à la
 * prochaine connexion.
 */
const PENDING_KEY = 'margee.pwa.pendingInstall';
const doneKey = (accountId) => `margee.pwa.recorded.${accountId}`;
const safeGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* stockage bloqué */ } };
const safeDel = (k) => { try { window.localStorage.removeItem(k); } catch { /* stockage bloqué */ } };

let inFlight = false;
async function recordFor(accountId) {
  if (!supabase || !accountId || inFlight) return;
  const platform = safeGet(PENDING_KEY) || (isStandalone() ? deviceKind() : null);
  if (!platform) return;
  const done = (safeGet(doneKey(accountId)) || '').split(',').filter(Boolean);
  if (done.includes(platform)) { safeDel(PENDING_KEY); return; }
  inFlight = true;
  try {
    const { error } = await supabase.from('app_installs').insert({ platform }, { returning: 'minimal' });
    // 23505 : déjà enregistrée pour ce compte et cet appareil
    if (!error || error.code === '23505') {
      safeSet(doneKey(accountId), [...done, platform].join(','));
      safeDel(PENDING_KEY);
    }
  } catch { /* réseau : on réessaiera à la prochaine ouverture */ } finally {
    inFlight = false;
  }
}

/** À appeler une fois connecté : enregistre maintenant puis à chaque changement */
export function watchInstall(accountId) {
  recordFor(accountId);
  return subscribe(() => recordFor(accountId));
}
