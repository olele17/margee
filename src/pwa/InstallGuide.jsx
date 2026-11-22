import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useInstallPrompt from './useInstallPrompt';
import './pwa.css';

/** Icône « Partager » d'iOS (carré + flèche vers le haut), tracée en SVG */
export function IosShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3" /><path d="M8 7l4-4 4 4" /><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

/** Copie l'adresse de la page (pour l'ouvrir dans un autre navigateur) */
export function CopyLinkButton({ className = 'pwa-btn pwa-btn--gold' }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname === '/' ? '/' : window.location.pathname}`;
  const copy = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {
      // Navigateurs intégrés : presse-papiers parfois bloqué → sélection manuelle
      try {
        const ta = document.createElement('textarea');
        ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch { ok = false; }
    }
    setCopied(ok ? 'ok' : 'ko');
    setTimeout(() => setCopied(false), 3000);
  };
  return (
    <>
      <button type="button" className={className} onClick={copy}>
        <i className={`ti ${copied === 'ok' ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" /> {copied === 'ok' ? 'Lien copié' : 'Copier le lien'}
      </button>
      {copied === 'ko' && <p className="pwa-guide-url">Copie ce lien : <b>{url}</b></p>}
    </>
  );
}

/**
 * Fenêtre « Comment installer Margee+ » adaptée à l'appareil :
 * iPhone Safari (3 étapes), iPhone autre navigateur (ouvrir dans Safari),
 * navigateur intégré (TikTok, WhatsApp…) ou navigateur sans installation.
 */
export default function InstallGuide({ open, onClose }) {
  const { platform, inAppName } = useInstallPrompt();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    setTimeout(() => ref.current?.querySelector('button')?.focus(), 0);
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const els = ref.current?.querySelectorAll('button, a[href]');
        if (!els?.length) return;
        const first = els[0]; const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;

  let title = 'Installe Margee+';
  let body = null;
  if (platform === 'ios-safari') {
    title = 'Installe Margee+ sur ton iPhone';
    body = (
      <>
        <ol className="pwa-steps">
          <li><span className="pwa-step-icon"><IosShareIcon /></span><span><b>1.</b> Touche le bouton <b>Partager</b><small>en bas de Safari (en haut sur iPad)</small></span></li>
          <li><span className="pwa-step-icon"><i className="ti ti-square-plus" aria-hidden="true" /></span><span><b>2.</b> Choisis <b>« Sur l'écran d'accueil »</b><small>fais défiler la liste si besoin</small></span></li>
          <li><span className="pwa-step-icon"><i className="ti ti-check" aria-hidden="true" /></span><span><b>3.</b> Touche <b>« Ajouter »</b><small>l'icône Margee+ apparaît sur ton écran d'accueil</small></span></li>
        </ol>
        <button type="button" className="pwa-btn pwa-btn--gold" onClick={onClose}>J'ai compris</button>
      </>
    );
  } else if (platform === 'ios-other') {
    title = 'Ouvre Margee+ dans Safari pour l\'installer';
    body = (
      <>
        <p className="pwa-guide-text">Sur iPhone, seul Safari permet d'ajouter Margee+ à l'écran d'accueil. Copie le lien, ouvre Safari et colle-le dans la barre d'adresse.</p>
        <CopyLinkButton />
      </>
    );
  } else if (platform === 'in-app') {
    title = 'Ouvre Margee+ dans ton navigateur';
    body = (
      <>
        <p className="pwa-guide-text">
          Pour installer Margee+, ouvre ce lien dans <b>Chrome</b> (Android) ou <b>Safari</b> (iPhone).
          {inAppName && inAppName !== 'app' && <> Dans {inAppName}, touche le menu <b>⋯</b> puis « Ouvrir dans le navigateur ».</>}
        </p>
        <CopyLinkButton />
      </>
    );
  } else if (platform === 'installed') {
    title = 'Margee+ est déjà installée';
    body = (
      <>
        <p className="pwa-guide-text">Ouvre-la depuis l'icône Margee+ de ton écran d'accueil.</p>
        <button type="button" className="pwa-btn pwa-btn--gold" onClick={onClose}>Fermer</button>
      </>
    );
  } else {
    title = 'Installer Margee+';
    body = (
      <>
        <p className="pwa-guide-text">Ce navigateur ne permet pas d'installer l'application. Ouvre Margee+ dans <b>Chrome</b> ou <b>Edge</b> (Android, ordinateur) ou dans <b>Safari</b> (iPhone).</p>
        <CopyLinkButton />
      </>
    );
  }

  return createPortal(
    <div className="pwa-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pwa-guide" ref={ref} role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title">
        <button type="button" className="pwa-close" onClick={onClose} aria-label="Fermer"><i className="ti ti-x" aria-hidden="true" /></button>
        <img src="/icons/pwa-192.png" alt="" width="56" height="56" className="pwa-guide-logo" />
        <h2 id="pwa-guide-title" className="pwa-guide-title">{title}</h2>
        {body}
      </div>
    </div>,
    document.body,
  );
}
