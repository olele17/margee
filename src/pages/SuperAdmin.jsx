import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../services/api';
import { fmt, fmtN } from '../utils/calc';
import AuthShell from '../components/AuthShell';
import ConfirmDialog from '../components/ConfirmDialog';
import '../styles/dashboard.css';

/**
 * Espace super admin.
 * Accès : compte Supabase présent dans la table « admins » (vérifié aussi
 * côté base par la RLS et les fonctions SQL). Plus aucun mot de passe
 * écrit dans le code.
 * Confidentialité : l'admin voit les comptes, abonnements et totaux,
 * jamais les notes ni l'épargne des e-commerçants.
 */

const STATUS = {
  pending: { label: 'En attente', cls: 'pending' },
  trial: { label: 'Essai', cls: 'progress' },
  active: { label: 'Actif', cls: 'ok' },
  expired: { label: 'Expiré', cls: 'off' },
  suspended: { label: 'Suspendu', cls: 'off' },
};

// Statut réel : un abonnement actif dont la date est passée est expiré
function effectiveStatus(sub) {
  if (sub.status === 'active' && sub.expiresAt && new Date(sub.expiresAt) <= new Date()) return 'expired';
  return sub.status || 'pending';
}

const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');

function AdminLogin({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.login(email, password);
      onLoggedIn();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell label="Administration" title="Espace administrateur" subtitle="Connexion réservée à l'équipe Margee+.">
      <form className="au-form" onSubmit={submit}>
        <div className="au-field">
          <label htmlFor="ad-email">Email</label>
          <input id="ad-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="au-field">
          <label htmlFor="ad-password">Mot de passe</label>
          <input id="ad-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div className="au-err" role="alert">{err}</div>}
        <button className="au-btn au-btn--gold" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </AuthShell>
  );
}

export default function SuperAdmin() {
  const [state, setState] = useState('checking'); // checking | login | denied | ready
  const [stats, setStats] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [overviews, setOverviews] = useState({});
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [err, setErr] = useState('');
  const [toSuspend, setToSuspend] = useState(null);

  const check = useCallback(async () => {
    setErr('');
    const logged = await api.hasSession().catch(() => false);
    if (!logged) { setState('login'); return; }
    const admin = await api.isCurrentUserAdmin();
    if (!admin) { setState('denied'); return; }
    try {
      const [s, list] = await Promise.all([api.getAdminStats(), api.listAllAccounts()]);
      setStats(s);
      setAccounts(list);
      setState('ready');
    } catch (e) {
      setErr(e.message);
      setState('ready');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const reloadAccounts = async () => {
    const [s, list] = await Promise.all([api.getAdminStats(), api.listAllAccounts()]);
    setStats(s); setAccounts(list);
  };

  const setStatus = async (id, status) => {
    setErr('');
    try {
      await api.setSubscriptionStatus(id, status);
      await reloadAccounts();
    } catch (e) {
      setErr(e.message);
    }
  };

  const showOverview = async (id) => {
    if (overviews[id]) { setOverviews((o) => ({ ...o, [id]: null })); return; }
    try {
      const o = await api.getMerchantOverview(id);
      setOverviews((prev) => ({ ...prev, [id]: o }));
    } catch (e) {
      setErr(e.message);
    }
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts
      .filter((a) => !statusFilter || effectiveStatus(a.subscription) === statusFilter)
      .filter((a) => !needle || [a.businessName, a.ownerName, a.email, a.phone].some((v) => v?.toLowerCase().includes(needle)));
  }, [accounts, q, statusFilter]);

  if (state === 'checking') return null;
  if (state === 'login') return <AdminLogin onLoggedIn={check} />;
  if (state === 'denied') {
    return (
      <AuthShell label="Administration" title="Accès refusé" subtitle="Ce compte n'a pas accès à l'espace administrateur.">
        <button className="au-btn au-btn--gold" onClick={async () => { await api.logout(); setState('login'); }}>Changer de compte</button>
        <div className="au-switch"><Link to="/">Retour à l'accueil</Link></div>
      </AuthShell>
    );
  }

  const rev = stats ? Number(stats.revenue_this_month) : 0;
  const revPrev = stats ? Number(stats.revenue_last_month) : 0;
  const revTrend = revPrev ? Math.round(((rev - revPrev) / revPrev) * 100) : null;

  return (
    <div className="page-content db" style={{ maxWidth: 1240 }}>
      <div className="section-header">
        <div>
          <h1 className="section-title">Espace administrateur — Margee+</h1>
          <div className="section-sub">Comptes, abonnements et revenus. Les notes et l'épargne des e-commerçants restent privées.</div>
        </div>
        <button className="btn btn-outline" onClick={async () => { await api.logout(); setState('login'); }}>
          <i className="ti ti-logout" /> Déconnexion
        </button>
      </div>

      {err && <div className="db-filter-err" role="alert">{err}</div>}

      {stats && (
        <div className="db-kpis">
          <div className="db-kpi">
            <div className="db-kpi-top">
              <span className="db-kpi-icon" aria-hidden="true"><i className="ti ti-users" /></span>
              <div className="db-kpi-text"><div className="db-kpi-value">{fmtN(stats.accounts_total)}</div><div className="db-kpi-label">E-commerçants</div></div>
            </div>
            <div className="db-kpi-trend">{fmtN(stats.paying_active)} payants · {fmtN(stats.free_active)} Free</div>
          </div>
          <div className="db-kpi">
            <div className="db-kpi-top">
              <span className="db-kpi-icon" aria-hidden="true"><i className="ti ti-repeat" /></span>
              <div className="db-kpi-text"><div className="db-kpi-value">{fmt(stats.mrr)}</div><div className="db-kpi-label">MRR</div></div>
            </div>
            <div className="db-kpi-trend">Revenu mensuel récurrent</div>
          </div>
          <div className="db-kpi">
            <div className="db-kpi-top">
              <span className="db-kpi-icon" aria-hidden="true"><i className="ti ti-cash-banknote" /></span>
              <div className="db-kpi-text"><div className="db-kpi-value">{fmt(rev)}</div><div className="db-kpi-label">Revenu du mois</div></div>
            </div>
            <div className={`db-kpi-trend ${revTrend === null ? '' : revTrend >= 0 ? 'up' : 'down'}`}>
              {revTrend === null ? `Mois précédent : ${fmt(revPrev)}` : `${revTrend >= 0 ? '+' : ''}${revTrend}% vs mois précédent`}
            </div>
          </div>
          <div className="db-kpi">
            <div className="db-kpi-top">
              <span className="db-kpi-icon" aria-hidden="true"><i className="ti ti-arrow-big-up-lines" /></span>
              <div className="db-kpi-text"><div className="db-kpi-value">{stats.conversion?.rate_percent ?? 0}%</div><div className="db-kpi-label">Conversion vers payant</div></div>
            </div>
            <div className="db-kpi-trend">{fmtN(stats.conversion?.converted)} sur {fmtN(stats.conversion?.accounts)} comptes</div>
          </div>
        </div>
      )}

      {stats && (
        <section className="db-card" aria-label="Répartition">
          <div className="db-card-head"><h2 className="db-card-title">Répartition</h2></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(stats.accounts_by_status || {}).map(([k, n]) => (
              <span key={k} className={`badge ${STATUS[k]?.cls || ''}`}>{STATUS[k]?.label || k} : {n}</span>
            ))}
            {Object.entries(stats.by_plan || {}).map(([k, n]) => (
              <span key={k} className="badge progress">Plan {api.PLANS[k]?.label || k} : {n}</span>
            ))}
            <span className="badge progress">
              Inscriptions sur 30 jours : {fmtN((stats.signups_last_30_days || []).reduce((a, d) => a + Number(d.count), 0))}
            </span>
          </div>
        </section>
      )}

      <section className="db-card db-recent" aria-labelledby="ad-accounts">
        <div className="db-recent-head">
          <h2 id="ad-accounts" className="db-recent-title">E-commerçants</h2>
          <div className="db-recent-tools">
            <label className="db-search">
              <span className="sr-only">Rechercher un e-commerçant</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Boutique, email, téléphone…" />
              <i className="ti ti-search" aria-hidden="true" />
            </label>
            <label className="db-select">
              <span className="sr-only">Filtrer par statut</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="db-table-scroll">
          <table className="db-table">
            <thead>
              <tr><th>Boutique</th><th>Contact</th><th>Plan</th><th>Statut</th><th>Expire le</th><th>Inscrit le</th><th>Dernière connexion</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={8}><div className="db-empty">{accounts.length ? 'Aucun compte ne correspond.' : 'Aucun e-commerçant inscrit pour l\'instant.'}</div></td></tr>
              )}
              {visible.map((a) => {
                const st = effectiveStatus(a.subscription);
                const o = overviews[a.id];
                return (
                  <tr key={a.id}>
                    <td className="db-strong">
                      {a.businessName}
                      <div style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted-text)' }}>{a.ownerName}</div>
                      {o && (
                        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 4, color: 'var(--ink)' }}>
                          CA {fmt(o.revenue_total)} · {fmtN(o.sales_count)} ventes · {fmtN(o.products_count)} produits
                        </div>
                      )}
                    </td>
                    <td>{a.phone || '—'}<div style={{ fontSize: 12 }}>{a.email}</div></td>
                    <td>{api.PLANS[a.subscription.plan]?.label || '—'}{a.subscription.billing === 'yearly' ? ' (annuel)' : ''}</td>
                    <td><span className={`badge ${STATUS[st]?.cls || ''}`}>{STATUS[st]?.label || st}</span></td>
                    <td className="db-nowrap">{dateFr(a.subscription.expiresAt)}</td>
                    <td className="db-nowrap">{dateFr(a.createdAt)}</td>
                    <td className="db-nowrap">{dateFr(a.lastLoginAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => showOverview(a.id)} title="Totaux de l'e-commerçant">
                          <i className={`ti ${o ? 'ti-eye-off' : 'ti-chart-bar'}`} />
                        </button>
                        {st === 'suspended' || st === 'expired' ? (
                          <button className="btn btn-outline btn-sm" onClick={() => setStatus(a.id, 'active')}>Réactiver</button>
                        ) : (
                          <button className="btn btn-danger btn-sm" onClick={() => setToSuspend(a)} disabled={st === 'pending'}>Suspendre</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={!!toSuspend}
        danger
        icon="ti-ban"
        title="Suspendre ce compte ?"
        message={toSuspend ? `« ${toSuspend.businessName} » ne pourra plus enregistrer de données jusqu'à sa réactivation. Ses données sont conservées.` : ''}
        confirmLabel="Suspendre"
        onCancel={() => setToSuspend(null)}
        onConfirm={async () => { const a = toSuspend; setToSuspend(null); await setStatus(a.id, 'suspended'); }}
      />
    </div>
  );
}
