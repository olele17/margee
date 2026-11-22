import { useEffect, useState } from 'react';
import { fetchPlanCatalog, FALLBACK_CATALOG } from '../services/api';

/**
 * Catalogue des plans lu dans la base (table plans + paramètres
 * annual_months_paid / trial_days), partagé par toutes les pages.
 * Chargé une fois par visite ; reloadPlans() le relit (après une
 * modification dans /admin/plans). En cas d'erreur réseau, les valeurs
 * de départ restent affichées : aucune page ne casse.
 */
let cache = null;
let inflight = null;
const listeners = new Set();

export function reloadPlans() {
  inflight = fetchPlanCatalog()
    .then((catalog) => {
      cache = catalog;
      listeners.forEach((fn) => fn(catalog));
      return catalog;
    })
    .catch(() => cache || FALLBACK_CATALOG)
    .finally(() => { inflight = null; });
  return inflight;
}

export default function usePlans() {
  const [catalog, setCatalog] = useState(cache || FALLBACK_CATALOG);
  useEffect(() => {
    listeners.add(setCatalog);
    if (cache) setCatalog(cache);
    else if (!inflight) reloadPlans();
    return () => { listeners.delete(setCatalog); };
  }, []);
  return catalog;
}
