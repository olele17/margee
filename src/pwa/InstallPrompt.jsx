import { useEffect, useState } from 'react';
import useInstallPrompt from './useInstallPrompt';
import InstallGuide, { CopyLinkButton } from './InstallGuide';
import './pwa.css';

export const SALE_RECORDED_EVENT = 'margee:sale-recorded';
const DELAY_MS = 20000;

/** Démarrage de la session connectée (ne repart pas à zéro à chaque page) */
let startedAt = 0;
/** Carte déjà proposée et fermée pendant cette visite */
let handledThisVisit = false;

/** L'utilisateur est en train de remplir un formulaire ou une fenêtre est ouverte */
function isBusy() {
  const a = document.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
  // Formulaire ouvert (avec des champs), éditeur de document ou fenêtre
  if (document.querySelector('.form-card input, .form-card textarea, .form-card select, .doc-editor, [role="dialog"], [aria-modal="true"]')) return true;
  return false;
}

/**
 * Carte « Installe Margee+ » en bas de l'écran, dans l'espace connecté :
 * après 20 secondes ou après la première vente enregistrée, jamais
 * pendant la saisie d'un formulaire. « Plus tard » la masque 7 jours.
 */
export default function InstallPrompt() {
  const { platform, inAppName, snoozed, install, later } = useInstallPrompt();
  const [due, setDue] = useState(false);
  const [busy, setBusy] = useState(true);
  const [guide, setGuide] = useState(false);
  const [closed, setClosed] = useState(handledThisVisit);

  // Rien à proposer : déjà installée, « Plus tard » récent, ou navigateur
  // sans installation possible (on garde alors le bouton permanent).
  const eligible = platform !== 'installed' && platform !== 'unsupported' && !snoozed && !closed;

  // Déclencheurs : 20 s de session ou une vente enregistrée
  useEffect(() => {
    if (!eligible || due) return undefined;
    if (!startedAt) startedAt = Date.now();
    const t = setTimeout(() => setDue(true), Math.max(0, DELAY_MS - (Date.now() - startedAt)));
    const onSale = () => setDue(true);
    window.addEventListener(SALE_RECORDED_EVENT, onSale);
    return () => { clearTimeout(t); window.removeEventListener(SALE_RECORDED_EVENT, onSale); };
  }, [eligible, due]);

  // Jamais pendant un formulaire : on attend qu'il soit fermé
  useEffect(() => {
    if (!eligible || !due) return undefined;
    const check = () => setBusy(isBusy());
    check();
    const iv = setInterval(check, 1500);
    const onOut = () => setTimeout(check, 0);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', onOut);
    return () => { clearInterval(iv); document.removeEventListener('focusin', check); document.removeEventListener('focusout', onOut); };
  }, [eligible, due]);

  const close = () => { handledThisVisit = true; setClosed(true); };
  const onLater = () => { later(); close(); };
  const onInstall = async () => {
    if (platform === 'native') {
      const outcome = await install();
      if (outcome === 'unavailable') { setGuide(true); return; }
      close();
      return;
    }
    setGuide(true);
  };

  if (guide) return <InstallGuide open onClose={() => { setGuide(false); close(); }} />;
  if (!eligible || !due || busy) return null;

  const inApp = platform === 'in-app' || platform === 'ios-other';
  const title = 'Installe Margee+ sur ton téléphone';
  const text = platform === 'in-app'
    ? `Pour installer Margee+, ouvre ce lien dans Chrome (Android) ou Safari (iPhone)${inAppName && inAppName !== 'app' ? `, pas dans ${inAppName}` : ''}.`
    : platform === 'ios-other'
      ? 'Ouvre Margee+ dans Safari pour l\'installer sur ton écran d\'accueil.'
      : 'Ouvre ton business en un geste depuis ton écran d\'accueil, en plein écran.';

  return (
    <div className="pwa-install" role="region" aria-label="Installer l'application">
      <img src="/icons/pwa-192.png" alt="" width="44" height="44" className="pwa-install-logo" />
      <div className="pwa-install-text">
        <b>{title}</b>
        <span>{text}</span>
      </div>
      <div className="pwa-install-actions">
        <button type="button" className="pwa-btn pwa-btn--ghost" onClick={onLater}>Plus tard</button>
        {inApp
          ? <CopyLinkButton />
          : <button type="button" className="pwa-btn pwa-btn--gold" onClick={onInstall}><i className="ti ti-download" aria-hidden="true" /> Installer</button>}
      </div>
    </div>
  );
}
