import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOverview, getAppInstallStats } from '../adminApi';
import { fcfa, num, dateFr, dateTimeFr, dayShort, daysUntil, PLAN_LABELS } from '../format';
import { SubscriptionBadge, PaymentBadge } from '../components/StatusBadge';
import '../../styles/dashboard.css';

export function StatCard({ icon, label, value, tone, hint }) {
  return (
    <div className={`adm-stat${tone ? ` adm-stat--${tone}` : ''}`}>
      <span className="adm-stat-icon" aria-hidden="true"><i className={`ti ${icon}`} /></span>
      <div className="adm-stat-text">
        <div className="adm-stat-value">{value}</div>
        <div className="adm-stat-label">{label}</div>
        {hint && <div className="adm-stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function SignupsChart({ days }) {
  const max = Math.max(...days.map((d) => Number(d.count)), 1);
  const total = days.reduce((a, d) => a + Number(d.count), 0);
  return (
    <section className="db-card" aria-labelledby="adm-signups-title">
      <div className="db-card-head">
        <div>
          <h2 id="adm-signups-title" className="db-card-title">Inscriptions sur 30 jours</h2>
          <div className="db-card-sub">{num(total)} nouvel{total > 1 ? 'les' : 'le'} inscription{total > 1 ? 's' : ''}</div>
        </div>
      </div>
      <div className="adm-bars" role="img" aria-label={`Inscriptions par jour sur 30 jours : ${num(total)} au total`}>
        {days.map((d, i) => (
          <div key={d.day} className="adm-bar-col" title={`${dateFr(`${d.day}T12:00:00Z`)} : ${d.count} inscription(s)`}>
            <div className="adm-bar-track">
              <div className={`adm-bar${i === days.length - 1 ? ' adm-bar--today' : ''}`} style={{ height: `${(Number(d.count) / max) * 100}%` }} />
            </div>
            <span className="adm-bar-label">{i % 5 === 4 || i === days.length - 1 ? dayShort(d.day) : ''}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PlanSplit({ byPlan }) {
  const rows = [['free', 'Free (essai)'], ['pro', 'Pro'], ['elite', 'Elite']].map(([k, l]) => ({ key: k, label: l, n: Number(byPlan?.[k] || 0) }));
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <section className="db-card" aria-labelledby="adm-plans-title">
      <div className="db-card-head"><h2 id="adm-plans-title" className="db-card-title">Répartition par plan</h2></div>
      <ul className="adm-split">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="adm-split-head"><span>{r.label}</span><strong>{num(r.n)}</strong></div>
            <div className="nc-bar"><div className={`nc-bar-fill adm-split-${r.key}`} style={{ width: `${(r.n / total) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="adm-note">Comptes en essai ou abonnés actifs.</p>
    </section>
  );
}

function AppInstalls({ stats }) {
  const rows = [['android', 'Android', 'ti-brand-android'], ['ios', 'iPhone', 'ti-brand-apple'], ['desktop', 'Ordinateur', 'ti-device-desktop']]
    .map(([k, l, icon]) => ({ key: k, label: l, icon, n: Number(stats?.[k] || 0) }));
  const total = Number(stats?.total || 0);
  return (
    <section className="db-card" aria-labelledby="adm-installs-title">
      <div className="db-card-head">
        <div>
          <h2 id="adm-installs-title" className="db-card-title">Applis installées</h2>
          <div className="db-card-sub">
            {stats ? `${num(total)} installation${total > 1 ? 's' : ''} · ${num(stats.accounts)} compte${Number(stats.accounts) > 1 ? 's' : ''} · ${num(stats.last_30_days)} sur 30 jours` : 'Chargement…'}
          </div>
        </div>
      </div>
      <ul className="adm-split">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="adm-split-head"><span><i className={`ti ${r.icon}`} aria-hidden="true" /> {r.label}</span><strong>{num(r.n)}</strong></div>
            <div className="nc-bar"><div className="nc-bar-fill adm-split-pro" style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="adm-note">Une installation par compte et par type d'appareil.</p>
    </section>
  );
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [installs, setInstalls] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [overview, installs] = await Promise.all([getOverview(), getAppInstallStats().catch(() => null)]);
      setData(overview);
      setInstalls(installs);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const c = data?.counts || {};
  const rev = data?.revenue || {};
  const change = rev.change_percent;

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">Vue d'ensemble</h1>
          <div className="adm-page-sub">
            {data ? `Mis à jour le ${dateTimeFr(data.generated_at)} (heure de Dakar)` : 'Chargement…'}
          </div>
        </div>
        <button type="button" className="btn btn-outline" onClick={load} disabled={loading}>
          <i className={`ti ti-refresh${loading ? ' adm-spin' : ''}`} aria-hidden="true" /> Actualiser
        </button>
      </div>

      {err && <div className="db-filter-err" role="alert">{err}</div>}

      {data && (
        <>
          <div className="adm-stats">
            <StatCard icon="ti-users" label="Inscrits au total" value={num(c.total)} hint={c.pending ? `dont ${num(c.pending)} en attente` : null} />
            <StatCard icon="ti-hourglass" label="En essai" value={num(c.trial)} />
            <StatCard icon="ti-circle-check" label="Actifs" value={num(c.active)} tone="success" />
            <StatCard icon="ti-clock-x" label="Expirés" value={num(c.expired)} tone={c.expired ? 'danger' : null} />
            <StatCard icon="ti-ban" label="Suspendus" value={num(c.suspended)} />
          </div>

          <div className="adm-stats adm-stats--money">
            <StatCard icon="ti-repeat" label="MRR (revenu mensuel récurrent)" value={fcfa(data.mrr)} hint="Abonnements payants actifs, annuel ramené au mois" />
            <StatCard
              icon="ti-cash-banknote"
              label="Revenu du mois"
              value={fcfa(rev.this_month)}
              tone={change == null ? null : change >= 0 ? 'success' : 'danger'}
              hint={`Mois précédent : ${fcfa(rev.last_month)}${change == null ? '' : ` · ${change >= 0 ? '+' : ''}${String(change).replace('.', ',')} %`}`}
            />
            <StatCard
              icon="ti-arrow-big-up-lines"
              label="Conversion essai → payant"
              value={`${String(data.conversion?.rate_percent ?? 0).replace('.', ',')} %`}
              hint={`${num(data.conversion?.converted)} sur ${num(data.conversion?.trials)} comptes ayant fait l'essai`}
            />
          </div>

          <div className="adm-grid-2">
            <SignupsChart days={data.signups_30_days || []} />
            <PlanSplit byPlan={data.by_plan} />
          </div>

          <div className="adm-grid-2">
            <AppInstalls stats={installs} />
          </div>

          <section className="db-card db-recent" aria-labelledby="adm-exp-title">
            <div className="db-recent-head">
              <h2 id="adm-exp-title" className="db-recent-title">Expirent dans les 7 jours</h2>
              <span className="adm-head-count">{num((data.expiring_7_days || []).length)}</span>
            </div>
            <div className="db-table-scroll">
              <table className="db-table">
                <thead><tr><th>Boutique</th><th>Email</th><th>Plan</th><th>Statut</th><th>Fin</th><th>Reste</th><th><span className="sr-only">Fiche</span></th></tr></thead>
                <tbody>
                  {(data.expiring_7_days || []).length === 0 && <tr><td colSpan={7}><div className="db-empty">Aucun essai ni abonnement n'expire dans les 7 jours.</div></td></tr>}
                  {(data.expiring_7_days || []).map((x) => {
                    const left = daysUntil(x.ends_at);
                    return (
                      <tr key={x.account_id}>
                        <td className="db-strong">{x.business_name}</td>
                        <td>{x.email}</td>
                        <td>{PLAN_LABELS[x.plan_id] || '—'}</td>
                        <td><SubscriptionBadge status={x.status} /></td>
                        <td className="db-nowrap">{dateFr(x.ends_at)}</td>
                        <td className="db-nowrap">{left <= 0 ? "aujourd'hui" : `${left} jour${left > 1 ? 's' : ''}`}</td>
                        <td><Link className="btn btn-ghost btn-sm" to={`/admin/marchands/${x.account_id}`} aria-label={`Ouvrir la fiche de ${x.business_name}`}><i className="ti ti-chevron-right" /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="adm-grid-2 adm-grid-2--wide">
            <section className="db-card db-recent" aria-labelledby="adm-pay-title">
              <div className="db-recent-head">
                <h2 id="adm-pay-title" className="db-recent-title">10 derniers paiements</h2>
                <Link to="/admin/paiements" className="adm-head-link">Tous les paiements <i className="ti ti-arrow-right" aria-hidden="true" /></Link>
              </div>
              <div className="db-table-scroll">
                <table className="db-table">
                  <thead><tr><th>Date</th><th>Boutique</th><th>Plan</th><th>Montant</th><th>Statut</th></tr></thead>
                  <tbody>
                    {(data.last_payments || []).length === 0 && <tr><td colSpan={5}><div className="db-empty">Aucun paiement pour l'instant (paiement Bictorys pas encore branché).</div></td></tr>}
                    {(data.last_payments || []).map((p) => (
                      <tr key={p.id}>
                        <td className="db-nowrap">{dateTimeFr(p.created_at)}</td>
                        <td className="db-strong">{p.business_name || 'Compte supprimé'}</td>
                        <td>{PLAN_LABELS[p.plan_id]}{p.billing === 'yearly' ? ' (annuel)' : ''}</td>
                        <td className="db-nowrap db-strong">{fcfa(p.amount)}</td>
                        <td><PaymentBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="db-card db-recent" aria-labelledby="adm-fail-title">
              <div className="db-recent-head">
                <h2 id="adm-fail-title" className="db-recent-title">Paiements échoués (30 jours)</h2>
                <span className="adm-head-count">{num((data.failed_payments || []).length)}</span>
              </div>
              <div className="db-table-scroll">
                <table className="db-table">
                  <thead><tr><th>Date</th><th>Boutique</th><th>Montant</th><th>Référence</th></tr></thead>
                  <tbody>
                    {(data.failed_payments || []).length === 0 && <tr><td colSpan={4}><div className="db-empty">Aucun paiement échoué.</div></td></tr>}
                    {(data.failed_payments || []).map((p) => (
                      <tr key={p.id}>
                        <td className="db-nowrap">{dateTimeFr(p.created_at)}</td>
                        <td className="db-strong">{p.business_name || 'Compte supprimé'}</td>
                        <td className="db-nowrap">{fcfa(p.amount)}</td>
                        <td className="adm-mono">{p.provider_ref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
