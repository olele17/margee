import { useCallback, useEffect, useState } from 'react';
import { fmt } from './calc';

/**
 * Mode discret : masque les montants du tableau de bord (comme dans une
 * appli bancaire), par exemple pour montrer son écran à quelqu'un.
 * Le choix est mémorisé sur l'appareil (localStorage protégé) et partagé
 * entre tous les composants affichés.
 */
const KEY = 'margee.hideAmounts';
const listeners = new Set();

const read = () => { try { return window.localStorage.getItem(KEY) === '1'; } catch { return false; } };
let hidden = typeof window !== 'undefined' ? read() : false;

/** Texte affiché à la place d'un montant */
export const MASK = '•••••• F';

export function setAmountsHidden(value) {
  hidden = !!value;
  try { window.localStorage.setItem(KEY, hidden ? '1' : '0'); } catch { /* stockage bloqué */ }
  listeners.forEach((fn) => fn(hidden));
}

/** [masqué ?, basculer] */
export function useAmountsHidden() {
  const [state, setState] = useState(hidden);
  useEffect(() => {
    listeners.add(setState);
    setState(hidden);
    return () => { listeners.delete(setState); };
  }, []);
  const toggle = useCallback(() => setAmountsHidden(!hidden), []);
  return [state, toggle];
}

/**
 * Montant affiché à l'écran (masqué en mode discret). Les composants qui
 * l'utilisent appellent useAmountsHidden() pour se réafficher au
 * changement. Ne pas utiliser pour les PDF ni les données enregistrées.
 */
export function money(n) { return hidden ? MASK : fmt(n); }
