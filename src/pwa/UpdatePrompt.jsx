import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './pwa.css';

const CHECK_EVERY_MS = 60 * 60 * 1000; // vérifie une nouvelle version toutes les heures

/**
 * Enregistre le service worker et propose la mise à jour quand une
 * nouvelle version est déployée : bandeau « Nouvelle version disponible »
 * → « Mettre à jour » active la nouvelle version et recharge l'app.
 * Rien n'est rechargé sans l'accord de l'utilisateur (pas de saisie
 * perdue), et une ancienne version ne reste jamais bloquée : la
 * vérification a lieu au démarrage, toutes les heures et à chaque retour
 * sur l'application.
 */
export default function UpdatePrompt() {
  const [hidden, setHidden] = useState(false);
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      const check = () => {
        if (registration.installing || !navigator.onLine) return;
        registration.update().catch(() => {});
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });

  // Une nouvelle version arrive après un « Plus tard » : on la repropose
  useEffect(() => { if (needRefresh) setHidden(false); }, [needRefresh]);

  if (!needRefresh || hidden) return null;
  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <span className="pwa-update-icon" aria-hidden="true"><i className="ti ti-refresh" /></span>
      <span className="pwa-update-text">
        <b>Nouvelle version disponible</b>
        <span>Mets à jour pour profiter des dernières améliorations.</span>
      </span>
      <button type="button" className="pwa-update-later" onClick={() => setHidden(true)}>Plus tard</button>
      <button
        type="button"
        className="pwa-update-btn"
        disabled={updating}
        onClick={() => { setUpdating(true); updateServiceWorker(true); }}
      >
        {updating ? 'Mise à jour…' : 'Mettre à jour'}
      </button>
    </div>
  );
}
