import { Link } from 'react-router-dom';
import useFreeTrial from '../hooks/useFreeTrial';

/**
 * Encart « essais gratuits » (plan Free uniquement) : combien il en reste,
 * à utiliser au choix en reçus, factures ou devis.
 */
export default function FreeTrialNotice({ refreshKey }) {
  const t = useFreeTrial(refreshKey);
  if (!t.isFree || !t.ready) return null;

  if (t.reached) {
    return (
      <div className="trial-notice trial-notice--reached" role="status">
        <i className="ti ti-lock" aria-hidden="true" />
        <div>
          <strong>Tu as utilisé tes {t.limit} essais gratuits.</strong>
          <span> Passe à un plan payant pour continuer à créer des reçus, des factures et des devis.</span>
        </div>
        <Link to="/abonnement" className="btn btn-primary">Choisir un plan</Link>
      </div>
    );
  }

  const u = t.usage;
  const detail = [
    u.receipts && `${u.receipts} reçu${u.receipts > 1 ? 's' : ''}`,
    u.quotes && `${u.quotes} devis`,
    u.invoices && `${u.invoices} facture${u.invoices > 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ');

  return (
    <div className="trial-notice" role="status">
      <i className="ti ti-gift" aria-hidden="true" />
      <div>
        <strong>Essai gratuit : {t.remaining} essai{t.remaining > 1 ? 's' : ''} restant{t.remaining > 1 ? 's' : ''} sur {t.limit}.</strong>
        <span> À utiliser comme tu veux : reçus, factures ou devis.{detail ? ` Déjà utilisés : ${detail}.` : ''}</span>
      </div>
    </div>
  );
}
