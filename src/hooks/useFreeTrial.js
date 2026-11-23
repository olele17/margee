import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import usePlans from './usePlans';
import * as api from '../services/api';

/**
 * Essais gratuits du plan Free : un seul compteur pour les reçus, les
 * factures et les devis (contrôlé par la base, voir la migration
 * « essais_partages »). Ce hook ne sert qu'à l'affichage.
 * `refreshKey` : change pour recharger le décompte (ex. nombre de ventes).
 */
export default function useFreeTrial(refreshKey) {
  const { account } = useAuth();
  const { all } = usePlans();
  const plan = all[account?.subscription?.plan];
  const isFree = !!plan && plan.receiptLimit != null && !plan.days;
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (!isFree) return undefined;
    let alive = true;
    api.getTrialUsage().then((u) => { if (alive) setUsage(u); }).catch(() => {});
    return () => { alive = false; };
  }, [isFree, account?.id, refreshKey]);

  const limit = isFree ? plan.receiptLimit : 0;
  const used = usage ? usage.receipts + usage.quotes + usage.invoices : 0;
  return {
    isFree,
    ready: !isFree || !!usage,
    usage,
    limit,
    used,
    remaining: Math.max(limit - used, 0),
    reached: isFree && !!usage && used >= limit,
  };
}
