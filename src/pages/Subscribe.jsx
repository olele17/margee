import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { annualPrice, subscribe } from '../services/api';
import usePlans from '../hooks/usePlans';
import { getPlanOffer } from '../utils/planOffer';
import { fmt } from '../utils/calc';
import AuthShell from '../components/AuthShell';

// « de Pro », « d'Elite » (élision devant une voyelle)
const de = (label) => (/^[aeiouyàâéèêëîïôöûü]/i.test(label || '') ? `d'${label}` : `de ${label}`);

export default function Subscribe() {
  const { account, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Plans actifs lus dans la base (modifiables depuis /admin/plans)
  const catalog = usePlans();
  const { plans, annualMonths } = catalog;
  const offer = getPlanOffer(account, catalog);
  // Plan visé : ?plan=elite (bouton « Passer à Elite »), sinon l'offre suggérée
  const [choice, setChoice] = useState(() => params.get('plan') || offer.action?.plan || 'pro');
  const [billing, setBilling] = useState('monthly'); // monthly | yearly
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // L'essai gratuit ne se fait qu'une fois : une fois utilisé (ou pendant
  // l'essai, ou avec un plan payant en cours), seuls les plans payants
  // sont proposés.
  const sub = account?.subscription || {};
  const trialUsed = !!sub.trialEndsAt && !(sub.status === 'trial' && new Date(sub.trialEndsAt) > new Date());
  const hideFree = trialUsed || offer.trialActive || offer.paidActive;
  const offered = Object.entries(plans).filter(([, p]) => !(hideFree && p.price === 0));
  // Plan choisi encore proposé ? Sinon le premier plan payant proposé.
  const plan = offered.some(([key]) => key === choice)
    ? choice
    : (offered.find(([, p]) => p.price > 0) || offered[0])[0];
  const setPlan = setChoice;
  const selected = plans[plan];
  const paid = selected.price > 0;

  const pay = async () => {
    setErr('');
    setLoading(true);
    try {
      // Free : activé tout de suite. Pro / Elite : redirection vers la
      // page de paiement Bictorys ; l'abonnement est activé par le
      // webhook côté serveur, puis constaté sur /abonnement/retour.
      const res = await subscribe(account.id, plan, billing);
      if (res?.redirectUrl) {
        window.location.assign(res.redirectUrl);
        return; // le bouton reste en « Redirection… » jusqu'au départ
      }
      await refresh();
      navigate('/app/dashboard');
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const billingOptions = [
    { key: 'monthly', title: 'Mensuel', price: `${fmt(selected.price)} / mois`, note: 'Sans engagement', old: selected.oldPrice ? fmt(selected.oldPrice) : null },
    {
      key: 'yearly',
      title: 'Annuel',
      price: `${fmt(annualPrice(selected, annualMonths))} / an`,
      note: `${fmt(selected.price)} × ${annualMonths} mois : ${12 - annualMonths} mois offerts`,
      old: fmt(selected.price * 12),
    },
  ];

  // Changement de plan payant : les jours restants sont convertis côté
  // serveur au prorata des prix (même règle que apply_payment_to_subscription)
  const currentPlan = offer.current ? catalog.all[offer.current] : null;
  const switching = offer.paidActive && plan !== offer.current && paid;
  const convertedDays = switching && offer.daysLeft && currentPlan?.price
    ? Math.floor((offer.daysLeft * currentPlan.price) / selected.price) : 0;
  const endLabel = offer.endsAt ? new Date(offer.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  const subtitle = offer.paidActive
    ? `Ton plan actuel : ${offer.currentLabel}, valable jusqu'au ${endLabel}.`
    : offer.trialActive
      ? `Essai gratuit en cours : encore ${offer.daysLeft} jour${offer.daysLeft > 1 ? 's' : ''}.`
      : trialUsed
        ? 'Ton essai gratuit est terminé : choisis Pro ou Elite pour continuer.'
        : 'Tu peux changer de plan à tout moment.';

  return (
    <AuthShell wide label="Abonnement" title={offer.paidActive ? 'Changer ou prolonger ton plan' : 'Choisis ton plan'} subtitle={subtitle}>
        <div style={{ marginTop: 28 }}>
          <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${offered.length}, 1fr)`, gap: 10 }}>
            {offered.map(([key, p]) => (
              <button
                type="button"
                key={key}
                className={`plan-card${plan === key ? ' selected' : ''}`}
                onClick={() => setPlan(key)}
                aria-pressed={plan === key}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: '#fff',
                  border: plan === key ? '2px solid var(--emerald-dark)' : '1.5px solid var(--border-light)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#777' }}>
                  {p.label}
                  {offer.paidActive && key === offer.current && (
                    <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: 'var(--cream-2)', color: 'var(--gold-dark-aa)', textTransform: 'none', fontSize: 10.5 }}>Plan actuel</span>
                  )}
                </div>
                <div className="plan-price" style={{ fontSize: 18, fontWeight: 800, margin: '4px 0' }}>
                  {p.price ? fmt(p.price) : 'Gratuit'}
                </div>
                <div style={{ fontSize: 11, color: '#777' }}>
                  {p.price ? 'par mois' : `${p.receiptLimit} essais offerts : reçus, factures ou devis`}
                </div>
              </button>
            ))}
          </div>

          {paid && (
            <div role="radiogroup" aria-label="Période de paiement" style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {billingOptions.map((o) => (
                <label
                  key={o.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    border: billing === o.key ? '2px solid var(--emerald-dark)' : '1.5px solid var(--border-light)',
                  }}
                >
                  <input type="radio" name="billing" value={o.key} checked={billing === o.key} onChange={() => setBilling(o.key)} />
                  <span style={{ flex: 1 }}>
                    <b>{o.title}</b>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#777' }}>{o.note}</span>
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap' }}>
                    {o.old && <s style={{ display: 'block', fontWeight: 400, fontSize: 11.5, color: '#999' }}>{o.old}</s>}
                    {o.price}
                  </span>
                </label>
              ))}
            </div>
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', fontSize: 13, display: 'grid', gap: 6 }}>
            {selected.features.map((f) => (
              <li key={f}><i className="ti ti-check" style={{ color: 'var(--emerald-dark)', marginRight: 6 }} />{f}</li>
            ))}
          </ul>

          {offer.paidActive && paid && (
            <div className="au-info" role="note" style={{ marginTop: 18 }}>
              <i className="ti ti-info-circle" aria-hidden="true" />
              <p style={{ margin: 0 }}>
                {switching
                  ? `Tes ${offer.daysLeft} jour${offer.daysLeft > 1 ? 's' : ''} restants ${de(offer.currentLabel)} deviennent ${convertedDays} jour${convertedDays > 1 ? 's' : ''} ${de(selected.label)}, ajoutés à ta nouvelle période.`
                  : `Ta période en cours est prolongée : les jours payés s'ajoutent après le ${endLabel}.`}
              </p>
            </div>
          )}

          {err && <div className="au-err" role="alert" style={{ marginTop: 18 }}>{err}</div>}
          <button className="au-btn au-btn--gold" style={{ marginTop: 22 }} onClick={pay} disabled={loading}>
            {loading
              ? (paid ? 'Redirection vers Bictorys…' : 'Activation…')
              : paid
                ? `Payer ${fmt(billing === 'yearly' ? annualPrice(selected, annualMonths) : selected.price)} avec Bictorys →`
                : 'Commencer gratuitement →'}
          </button>
          {paid && (
            <p style={{ fontSize: 12.5, color: 'var(--au-grey)', textAlign: 'center', marginTop: 12 }}>
              Wave · Orange Money · Carte bancaire, via Bictorys.
            </p>
          )}
          {(offer.paidActive || offer.trialActive) && (
            <div className="au-switch"><Link to="/app/dashboard">← Retour à mon espace</Link></div>
          )}
        </div>
    </AuthShell>
  );
}
