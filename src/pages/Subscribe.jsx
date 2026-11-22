import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PLANS, ANNUAL_MONTHS_PAID, annualPrice, subscribe } from '../services/api';
import { fmt } from '../utils/calc';
import AuthShell from '../components/AuthShell';

export default function Subscribe() {
  const { account, refresh } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState('pro');
  const [billing, setBilling] = useState('monthly'); // monthly | yearly
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // L'essai gratuit ne se fait qu'une fois : une fois utilisé, seuls les
  // plans payants sont proposés.
  const sub = account?.subscription || {};
  const trialUsed = !!sub.trialEndsAt && !(sub.status === 'trial' && new Date(sub.trialEndsAt) > new Date());
  const offered = Object.entries(PLANS).filter(([key]) => !(trialUsed && key === 'free'));
  const selected = PLANS[plan];
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
    { key: 'monthly', title: 'Mensuel', price: `${fmt(selected.price)} / mois`, note: 'Sans engagement' },
    {
      key: 'yearly',
      title: 'Annuel',
      price: `${fmt(annualPrice(selected))} / an`,
      note: `${fmt(selected.price)} × ${ANNUAL_MONTHS_PAID} mois : ${12 - ANNUAL_MONTHS_PAID} mois offerts`,
      old: fmt(selected.price * 12),
    },
  ];

  return (
    <AuthShell wide label="Abonnement" title="Choisis ton plan" subtitle={trialUsed ? "Ton essai gratuit est terminé : choisis Pro ou Elite pour continuer." : "Tu peux changer de plan à tout moment."}>
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
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#777' }}>{p.label}</div>
                <div className="plan-price" style={{ fontSize: 18, fontWeight: 800, margin: '4px 0' }}>
                  {p.price ? fmt(p.price) : 'Gratuit'}
                </div>
                <div style={{ fontSize: 11, color: '#777' }}>
                  {p.price ? 'par mois' : `${p.receiptLimit} reçus offerts`}
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

          {err && <div className="au-err" role="alert" style={{ marginTop: 18 }}>{err}</div>}
          <button className="au-btn au-btn--gold" style={{ marginTop: 22 }} onClick={pay} disabled={loading}>
            {loading
              ? (paid ? 'Redirection vers Bictorys…' : 'Activation…')
              : paid
                ? `Payer ${fmt(billing === 'yearly' ? annualPrice(selected) : selected.price)} avec Bictorys →`
                : 'Commencer gratuitement →'}
          </button>
          {paid && (
            <p style={{ fontSize: 12.5, color: 'var(--au-grey)', textAlign: 'center', marginTop: 12 }}>
              Wave · Orange Money · Carte bancaire, via Bictorys.
            </p>
          )}
        </div>
    </AuthShell>
  );
}
