/**
 * État d'installation de l'application (PWA), partagé par toute l'app.
 * Importé dès main.jsx : l'événement « beforeinstallprompt » arrive très
 * tôt, avant l'affichage de React, il faut le capter tout de suite.
 *
 * Situations (platform) :
 *   installed   app déjà installée (ouverte en plein écran, ou installée
 *               depuis ce navigateur) → on ne propose plus rien
 *   native      Android / ordinateur (Chrome, Edge, Samsung Internet) :
 *               bouton d'installation natif disponible
 *   ios-safari  iPhone / iPad dans Safari : ajout manuel (3 étapes)
 *   ios-other   iPhone / iPad dans Chrome, Firefox… : ouvrir dans Safari
 *   in-app      navigateur intégré (TikTok, WhatsApp, Instagram,
 *               Facebook…) : installation impossible, ouvrir ailleurs
 *   unsupported navigateur sans installation (ex. Firefox ordinateur)
 */
const INSTALLED_KEY = 'margee.pwa.installed';
const SNOOZE_KEY = 'margee.pwa.snoozeUntil';

const safeGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* stockage bloqué */ } };

let deferredPrompt = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}

/** Navigateur intégré à une application (installation impossible) */
export function detectInAppBrowser(ua = navigator.userAgent) {
  if (/FBAN|FBAV|FB_IAB|FBIOS|MessengerForiOS/i.test(ua)) return 'Facebook';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/musical_ly|BytedanceWebview|TikTok|trill_/i.test(ua)) return 'TikTok';
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  if (/\bLine\//i.test(ua)) return 'Line';
  if (/Twitter|TwitterAndroid/i.test(ua)) return 'X';
  // Vue web Android générique (« ; wv) ») : application qui affiche le lien
  if (/Android/i.test(ua) && /; wv\)/i.test(ua)) return 'app';
  return null;
}

export function isIOS(ua = navigator.userAgent) {
  return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function isIOSSafari(ua = navigator.userAgent) {
  return isIOS(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Brave/i.test(ua);
}

export function getPlatform() {
  if (typeof window === 'undefined') return 'unsupported';
  if (isStandalone() || safeGet(INSTALLED_KEY) === '1') return 'installed';
  if (detectInAppBrowser()) return 'in-app';
  if (isIOS()) return isIOSSafari() ? 'ios-safari' : 'ios-other';
  if (deferredPrompt) return 'native';
  return 'unsupported';
}

/** Type d'appareil (pour les statistiques d'installation) */
export function deviceKind() {
  if (isIOS()) return 'ios';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  return 'desktop';
}

export function hasNativePrompt() { return !!deferredPrompt; }

/** Ouvre la fenêtre d'installation native ; renvoie 'accepted' | 'dismissed' | 'unavailable' */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const evt = deferredPrompt;
  try {
    await evt.prompt();
  } catch {
    // Refusé par le navigateur (ex. sans geste de l'utilisateur) : on
    // garde l'événement pour un prochain clic et on montre le guide.
    return 'unavailable';
  }
  deferredPrompt = null;
  const { outcome } = await evt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  emit();
  return outcome;
}

export function snoozeInstall(days = 7) { safeSet(SNOOZE_KEY, String(Date.now() + days * 86400000)); emit(); }
export function isSnoozed() { return Number(safeGet(SNOOZE_KEY) || 0) > Date.now(); }

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Hook pour l'étape 3 (statistiques) : appelé une fois l'app installée */
const installedHandlers = new Set();
export function onAppInstalled(fn) { installedHandlers.add(fn); return () => installedHandlers.delete(fn); }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();      // on affiche notre propre carte au bon moment
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    safeSet(INSTALLED_KEY, '1');   // plus aucune proposition dans ce navigateur
    safeSet('margee.pwa.pendingInstall', deviceKind()); // statistique (recordInstall.js)
    installedHandlers.forEach((fn) => { try { fn(deviceKind()); } catch { /* ignoré */ } });
    emit();
  });
  // Classe « is-standalone » sur <html> : styles du mode installé
  // (encoche, barre de navigation du bas). Rien ne change dans un navigateur.
  const markMode = () => document.documentElement.classList.toggle('is-standalone', isStandalone());
  markMode();
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => { markMode(); emit(); });
}
