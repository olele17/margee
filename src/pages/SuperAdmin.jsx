import { useEffect, useState } from 'react';
import * as api from '../services/api';
import { fmt } from '../utils/calc';

// TODO BACKEND : ce mot de passe en dur doit être remplacé par une vraie
// authentification super-admin côté backend (compte séparé + session).
const OPERATOR_PASS = 'EASYSWAP-ADMIN-2026';

export default function SuperAdmin() {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [accounts, setAccounts] = useState([]);

  useEffect(() => { if (unlocked) api.listAllAccounts().then(setAccounts); }, [unlocked]);

  const check = () => {
    if (pass === OPERATOR_PASS) { setUnlocked(true); setErr(''); }
    else setErr('Mot de passe incorrect.');
  };

  const setStatus = async (id, status) => {
    await api.setSubscriptionStatus(id, status);
    setAccounts(await api.listAllAccounts());
  };

  if (!unlocked) {
    return (
      <div className="auth-bg">
        <div className="auth-card" style={{ maxWidth: 380 }}>
          <div className="auth-head">
            <div className="auth-logo">⚡ EASY SWAP</div>
            <div className="auth-tagline">Espace opérateur</div>
          </div>
          <div className="auth-body">
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Mot de passe opérateur</label>
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && check()} />
            </div>
            <button className="btn btn-dark btn-lg btn-block" onClick={check}>Accéder</button>
            {err && <div className="auth-err">{err}</div>}
          </div>
        </div>
      </div>
    );
  }

  const activeCount = accounts.filter((a) => a.subscription.status === 'active').length;
  const revenue = accounts.reduce((sum, a) => {
    if (a.subscription.status !== 'active' || !a.subscription.plan) return sum;
    return sum + (api.PLANS[a.subscription.plan]?.price || 0);
  }, 0);

  return (
    <div className="page-content" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="section-header"><h2 className="section-title">Espace opérateur — EASY SWAP</h2></div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <div className="kpi-card" style={{ background: '#FFFDE7' }}>
          <div className="kpi-label">Comptes inscrits</div>
          <div className="kpi-value">{accounts.length}</div>
        </div>
        <div className="kpi-card" style={{ background: '#FDF3D0' }}>
          <div className="kpi-label">Abonnements actifs</div>
          <div className="kpi-value">{activeCount}</div>
        </div>
        <div className="kpi-card" style={{ background: '#F4F4F4' }}>
          <div className="kpi-label">Revenus estimés (période en cours)</div>
          <div className="kpi-value">{fmt(revenue)}</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Business</th><th>Propriétaire</th><th>Contact</th><th>Plan</th><th>Statut</th><th>Expire le</th><th></th></tr></thead>
            <tbody>
              {accounts.length === 0 && (
                <tr><td colSpan={7}><div className="empty-state"><i className="ti ti-users" /><p>Aucun inscrit pour l'instant.</p></div></td></tr>
              )}
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="bold">{a.businessName}</td>
                  <td>{a.ownerName}</td>
                  <td>{a.phone}<br /><span style={{ color: '#999' }}>{a.email}</span></td>
                  <td>{a.subscription.plan || '—'}</td>
                  <td>
                    <span className={`badge ${a.subscription.status === 'active' ? 'ok' : a.subscription.status === 'pending' ? 'pending' : 'off'}`}>
                      {a.subscription.status}
                    </span>
                  </td>
                  <td>{a.subscription.expiresAt ? new Date(a.subscription.expiresAt).toLocaleDateString('fr-FR') : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setStatus(a.id, 'active')}>Activer</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setStatus(a.id, 'expired')}>Suspendre</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
