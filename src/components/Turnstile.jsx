import { useEffect, useRef } from 'react';

/**
 * Vérification anti-robots Cloudflare Turnstile.
 * La clé de site est PUBLIQUE (faite pour être dans la page) ; la clé
 * secrète reste dans Supabase (Authentication → Attack Protection).
 * Sans clé de site, rien n'est affiché et aucun jeton n'est envoyé.
 * Un jeton ne sert qu'une fois : après un échec, change `resetKey`.
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAGUHpwGdR6NcGNZZ';
export const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);

let scriptPromise;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { scriptPromise = null; reject(new Error('turnstile')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export default function Turnstile({ onToken, resetKey = 0 }) {
  const box = useRef(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!captchaEnabled) return undefined;
    let id;
    let alive = true;
    cb.current?.('');
    loadScript().then((ts) => {
      if (!alive || !box.current) return;
      id = ts.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: 'fr',
        theme: 'light',
        size: 'flexible',
        callback: (t) => cb.current?.(t),
        'expired-callback': () => cb.current?.(''),
        'error-callback': () => cb.current?.(''),
      });
    }).catch(() => { /* script bloqué : la base refusera sans jeton */ });
    return () => { alive = false; try { if (id !== undefined) window.turnstile?.remove(id); } catch { /* rien */ } };
  }, [resetKey]);

  if (!captchaEnabled) return null;
  return <div ref={box} className="au-captcha" />;
}

/** Message si l'utilisateur valide avant la fin de la vérification. */
export const CAPTCHA_WAIT = 'Patiente une seconde : la vérification anti-robots n\'est pas terminée.';
