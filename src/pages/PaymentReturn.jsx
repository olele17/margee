import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPaymentStatus } from '../services/api';
import usePlans from '../hooks/usePlans';
import AuthShell from '../components/AuthShell';

const POLL_MS = 3000;
const MAX_WAIT_MS = 90000;

/**
 * Retour de la page de paiement Bictorys (/abonnement/retour?ref=…).
 * Rien n'est activé ici : on attend que le webhook ait confirmé le
 * paiement côté serveur, en relisant le statut toutes les 3 secondes.
 */
export default function PaymentReturn() {
  const { refresh } = useAuth();
  const { all } = usePlans();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reference = params.get('ref') || '';
  const errorReturn = params.get('statut') === 'echec';
  const [state, setState] = useState(reference ? 'checking' : 'missing'); // checking | success | failed | slow | missing
  const [payment, setPayment] = useState(null);
  const started = useRef(Date.now());

  useEffect(() => {
    if (!reference) return undefined;
    let alive = true;
    let timer;
    const check = async () => {
      try {
        const p = await getPaymentStatus(reference);
        if (!alive) return;
        setPayment(p);
        if (!p) { setState('missing'); return; }
        if (p.status === 'success') {
          await refresh();
          if (alive) setState('success');
          return;
        }
        if (p.status === 'failed') { setState('failed'); return; }
      } catch {
        /* réseau : on réessaie au prochain tour */
      }
      if (!alive) return;
      if (Date.now() - started.current > MAX_WAIT_MS) { setState(errorReturn ? 'failed' : 'slow'); return; }
      timer = setTimeout(check, POLL_MS);
    };
    check();
    return () => { alive = false; clearTimeout(timer); };
  }, [reference, errorReturn, refresh]);

  const planName = payment?.plan_id ? all[payment.plan_id]?.label : '';

  if (state === 'success') {
    return (
      <AuthShell label="PAIEMENT" title="Paiement confirmé" subtitle={`Ton plan ${planName}${payment?.billing === 'yearly' ? ' annuel' : ''} est actif. Merci !`}>
        <div className="au-info" role="status">
          <i className="ti ti-circle-check" aria-hidden="true" />
          <span>Ton abonnement est activé. Tu peux reprendre là où tu en étais.</span>
        </div>
        <button type="button" className="au-btn au-btn--gold" style={{ marginTop: 22 }} onClick={() => navigate('/app/dashboard', { replace: true })}>
          Aller à mon espace →
        </button>
      </AuthShell>
    );
  }

  if (state === 'failed' || state === 'missing') {
    return (
      <AuthShell
        label="PAIEMENT"
        title={state === 'missing' ? 'Paiement introuvable' : "Le paiement n'a pas abouti"}
        subtitle={state === 'missing' ? "Nous ne retrouvons pas ce paiement sur ton compte." : "Aucun montant n'a été validé. Tu peux réessayer."}
      >
        <div className="au-err" role="alert">
          {state === 'missing'
            ? 'Si de l\'argent a été débité, contacte le support avec ta référence de paiement.'
            : 'Paiement refusé ou annulé. Vérifie ton solde ou choisis un autre moyen de paiement.'}
        </div>
        <Link to="/abonnement" replace className="au-btn au-btn--gold" style={{ marginTop: 22, textAlign: 'center', textDecoration: 'none' }}>
          Réessayer le paiement
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      label="PAIEMENT"
      title={state === 'slow' ? 'Confirmation en attente' : 'Confirmation du paiement…'}
      subtitle={state === 'slow'
        ? 'Bictorys n\'a pas encore confirmé ton paiement. Ça peut prendre quelques minutes.'
        : 'Nous attendons la confirmation de Bictorys. Ne ferme pas cette page.'}
    >
      <div className="au-info" role="status" aria-live="polite">
        <i className={`ti ${state === 'slow' ? 'ti-clock' : 'ti-loader-2 au-spin'}`} aria-hidden="true" />
        <span>
          {state === 'slow'
            ? 'Ton abonnement sera activé automatiquement dès la confirmation. Reviens dans un instant.'
            : 'Vérification en cours…'}
          {reference && <><br /><small>Référence : <span className="au-mono">{reference}</span></small></>}
        </span>
      </div>
      {state === 'slow' && (
        <button type="button" className="au-btn" style={{ marginTop: 22 }} onClick={() => { started.current = Date.now(); setState('checking'); window.location.reload(); }}>
          Vérifier à nouveau
        </button>
      )}
    </AuthShell>
  );
}
