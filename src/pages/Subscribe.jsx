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
  const selected = PLANS[plan];
  const paid = selected.price > 0;

  const pay = async () => {
    setLoading(true);
    try {
      // TODO BACKEND : remplacer ce subscribe() par un appel qui crée
      // une session de paiement Bictorys côté backend, puis redirige
      // vers l'URL de checkout retournée. L'activation réelle du compte
      // doit se faire via le webhook Bictorys, pas ici.
      await subscribe(account.id, plan, billing);
      await refresh();
      navigate('/app/dashboard');
    } finally {
      setLoading(false);
    }
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
    <AuthShell wide label="Abonnement" title="Choisis ton plan" subtitle="Tu peux changer de plan à tout moment.">
        <div style={{ marginTop: 28 }}>
          <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {Object.entries(PLANS).map(([key, p]) => (
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

          <button className="au-btn au-btn--gold" style={{ marginTop: 22 }} onClick={pay} disabled={loading}>
            {loading
              ? 'Activation…'
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
