import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PLANS, subscribe } from '../services/api';
import { fmt } from '../utils/calc';

export default function Subscribe() {
  const { account, refresh } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState('mensuel');
  const [loading, setLoading] = useState(false);

  const pay = async () => {
    setLoading(true);
    try {
      // TODO BACKEND : remplacer ce subscribe() par un appel qui crée
      // une session de paiement Bictorys côté backend, puis redirige
      // vers l'URL de checkout retournée. L'activation réelle du compte
      // doit se faire via le webhook Bictorys, pas ici.
      await subscribe(account.id, plan);
      await refresh();
      navigate('/app/dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-head">
          <div className="auth-logo">⚡ EASY SWAP</div>
          <div className="auth-tagline">Choisis ton abonnement</div>
        </div>
        <div className="auth-body">
          <div className="plan-grid">
            {Object.entries(PLANS).map(([key, p]) => (
              <div
                key={key}
                className={`plan-card${plan === key ? ' selected' : ''}`}
                onClick={() => setPlan(key)}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#999' }}>{p.label}</div>
                <div className="plan-price">{fmt(p.price)}</div>
                <div style={{ fontSize: 11, color: '#999' }}>
                  {key === 'mensuel' ? 'par mois' : 'par an'}
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 22 }} onClick={pay} disabled={loading}>
            {loading ? 'Redirection vers le paiement…' : 'Payer avec Bictorys →'}
          </button>
          <p style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 12 }}>
            Wave · Orange Money · Carte bancaire, via Bictorys.
          </p>
        </div>
      </div>
    </div>
  );
}
