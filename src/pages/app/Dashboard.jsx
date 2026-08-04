import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useBusinessData from '../../hooks/useBusinessData';
import StatCard from '../../components/StatCard';
import { computeStats, groupByMonth, fmt, fmtN, monthLabel, thisMonth, prevMonthKey } from '../../utils/calc';

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pctChange(current, previous) {
  if (!current && !previous) return NaN; // aucune donnée ni ce mois ni le précédent
  if (!previous) return null; // nouveau ce mois (rien à comparer)
  return ((current - previous) / previous) * 100;
}

function trendLabel(val) {
  if (Number.isNaN(val)) return 'Pas encore de données';
  if (val === null) return 'Nouveau ce mois';
  return `${val >= 0 ? '+' : ''}${val.toFixed(0)}% vs mois dernier`;
}

function trendPositive(val) {
  if (Number.isNaN(val) || val === null) return true;
  return val >= 0;
}

export default function Dashboard() {
  const { account, sales, ads, investments, ready } = useBusinessData();
  const [mA, setMA] = useState(thisMonth());
  const [mB, setMB] = useState('');

  const allTime = useMemo(() => computeStats(sales, ads, investments), [sales, ads, investments]);
  const cm = useMemo(() => computeStats(sales, ads, investments, thisMonth()), [sales, ads, investments]);
  const pm = useMemo(() => computeStats(sales, ads, investments, prevMonthKey(thisMonth())), [sales, ads, investments]);
  const byMonth = useMemo(() => groupByMonth(sales, ads), [sales, ads]);
  const months = Object.keys(byMonth).sort().reverse();
  const dA = mA ? computeStats(sales, ads, investments, mA) : null;
  const dB = mB ? computeStats(sales, ads, investments, mB) : null;

  const salesTrend = pctChange(cm.nbSales, pm.nbSales);
  const caTrend = pctChange(cm.ca, pm.ca);
  const profitTrend = pctChange(cm.netProfit, pm.netProfit);

  const weekData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => isoDaysAgo(6 - i));
    const values = days.map((day) => sales.filter((s) => s.date === day).reduce((a, s) => a + s.qty * s.price, 0));
    const max = Math.max(...values, 1);
    const today = isoDaysAgo(0);
    return days.map((day, i) => ({
      day,
      label: DAY_LABELS[new Date(day + 'T00:00:00').getDay()],
      value: values[i],
      heightPct: Math.max((values[i] / max) * 100, 6),
      isToday: day === today,
    }));
  }, [sales]);

  const recentSales = useMemo(
    () => [...sales].sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date)).slice(0, 4),
    [sales]
  );

  const topProducts = useMemo(() => {
    const map = {};
    sales.forEach((s) => {
      const key = s.productId || s.productName;
      if (!map[key]) map[key] = { name: s.productName, qty: 0, revenue: 0 };
      map[key].qty += s.qty;
      map[key].revenue += s.qty * s.price;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  }, [sales]);

  const marginRate = allTime.ca > 0 ? Math.max(0, Math.min(100, Math.round((allTime.grossProfit / allTime.ca) * 100))) : 0;

  if (!ready) return null;

  return (
    <div className="page-content">
      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="section-header">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <div className="section-sub">
            Planifiez, priorisez et suivez vos ventes et projets avec facilité.
          </div>
        </div>
        <div className="header-actions">
          <Link to="/app/ventes" className="btn btn-primary">
            <i className="ti ti-plus" /> Ajouter Vente
          </Link>
          <Link to="/app/produits" className="btn btn-outline">
            <i className="ti ti-package" /> Mes Produits
          </Link>
        </div>
      </div>

      {/* ── KPI GRID (4 Donezo Stat Cards, avec vraies données) ── */}
      <div className="kpi-grid">
        <StatCard
          label="Total Ventes"
          value={fmtN(allTime.nbSales)}
          trend={trendLabel(salesTrend)}
          positive={trendPositive(salesTrend)}
          highlight
        />
        <StatCard
          label="Chiffre d'Affaires"
          value={fmt(allTime.ca)}
          trend={trendLabel(caTrend)}
          positive={trendPositive(caTrend)}
        />
        <StatCard
          label="Bénéfice Net"
          value={fmt(allTime.netProfit)}
          trend={trendLabel(profitTrend)}
          positive={trendPositive(profitTrend)}
        />
        <StatCard
          label="ROI Global"
          value={`${allTime.roi >= 0 ? '+' : ''}${allTime.roi.toFixed(1)}%`}
          trend="Sur la période"
        />
      </div>

      {/* ── MIDDLE GRID ──────────────────────────────────────── */}
      <div className="dashboard-grid-main">
        {/* Ventes de la semaine — vraies données */}
        <div className="card-widget">
          <div className="widget-header">
            <h3 className="widget-title">Ventes de la Semaine</h3>
            <span className="widget-action-btn" style={{ cursor: 'default' }}>
              <span>7 derniers jours</span>
            </span>
          </div>
          <div className="bar-chart-container">
            {weekData.map((bar, idx) => (
              <div key={idx} className="bar-column">
                <div className="bar-pill-track">
                  {bar.isToday && bar.value > 0 && <div className="bar-tooltip">{fmt(bar.value)}</div>}
                  <div
                    className={`bar-pill ${bar.isToday ? 'solid-mint' : bar.value > 0 ? 'solid-dark' : 'striped'}`}
                    style={{ height: `${bar.heightPct}%` }}
                  />
                </div>
                <span className="bar-day-label">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Dernières Ventes — remplace le rappel de réunion fictif */}
        <div className="reminder-card">
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-text)', letterSpacing: 1 }}>
              Activité récente
            </div>
            {recentSales.length === 0 ? (
              <>
                <div className="reminder-title">Aucune vente enregistrée</div>
                <div className="reminder-time">Enregistrez votre première vente pour voir l'activité ici.</div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                {recentSales.map((s) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark-text)' }}>{s.productName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted-text)' }}>
                        {s.clientName || 'Client'} · {s.date}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--emerald-dark)', whiteSpace: 'nowrap' }}>
                      {fmt(s.qty * s.price)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Link to="/app/ventes" className="reminder-btn">
            <i className="ti ti-receipt" /> Voir toutes les ventes
          </Link>
        </div>
      </div>

      {/* ── BOTTOM GRID ──────────────────────────────────────── */}
      <div className="dashboard-grid-bottom">
        {/* Meilleurs Produits — remplace la fausse liste d'équipe */}
        <div className="card-widget">
          <div className="widget-header">
            <h3 className="widget-title">Meilleurs Produits</h3>
            <Link to="/app/produits" className="widget-action-btn">
              <i className="ti ti-package" /> Voir les produits
            </Link>
          </div>
          <div className="team-list">
            {topProducts.length === 0 && (
              <div className="empty-state">
                <i className="ti ti-package" />
                <p>Aucune vente pour l'instant.</p>
              </div>
            )}
            {topProducts.map((p, i) => (
              <div key={i} className="team-item">
                <div className="team-user">
                  <div className="team-avatar">{i + 1}</div>
                  <div>
                    <div className="team-name">{p.name}</div>
                    <div className="team-role">{fmtN(p.qty)} unité(s) vendue(s)</div>
                  </div>
                </div>
                <span className="status-badge completed">{fmt(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Gauge (marge réelle) + Résumé du mois */}
        <div className="dashboard-col-right">
          {/* Taux de marge — remplace la fausse "progression projets" */}
          <div className="card-widget" style={{ padding: '20px' }}>
            <div className="widget-header" style={{ marginBottom: 10 }}>
              <h3 className="widget-title">Taux de Marge</h3>
            </div>
            <div className="gauge-container">
              <div className="gauge-svg-wrap">
                <svg width="180" height="95" viewBox="0 0 180 95">
                  <path
                    d="M 15 85 A 70 70 0 0 1 165 85"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="18"
                    strokeLinecap="round"
                  />
                  <path
                    d={describeGaugeArc(marginRate)}
                    fill="none"
                    stroke="#155336"
                    strokeWidth="18"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="gauge-center-text">
                  <div className="gauge-percent">{marginRate}%</div>
                  <div className="gauge-sub">Sur le chiffre d'affaires</div>
                </div>
              </div>
              <div className="gauge-legends">
                <div className="gauge-legend-item">
                  <span className="gauge-dot completed" /> Marge ({fmt(allTime.grossProfit)})
                </div>
                <div className="gauge-legend-item">
                  <span className="gauge-dot pending" /> Coût produits ({fmt(allTime.cost)})
                </div>
              </div>
            </div>
          </div>

          {/* Résumé du mois — remplace le chrono de session fictif */}
          <div className="time-tracker-card">
            <div className="time-tracker-header">Résumé du mois — {monthLabel(thisMonth())}</div>
            <div className="time-tracker-display" style={{ fontSize: 34 }}>{fmt(cm.netProfit)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>CA</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(cm.ca)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>Pubs</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(cm.adSpend)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>Investi (total)</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(allTime.totalInvested)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MONTHLY COMPARISON TABLE (Preserved & Styled) ───── */}
      <div className="card-widget" style={{ marginTop: 24 }}>
        <div className="widget-header">
          <h3 className="widget-title">Comparaison Mensuelle</h3>
          <div className="month-compare-controls">
            <select
              value={mA}
              onChange={(e) => setMA(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-light)', fontSize: 13 }}
            >
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--muted-text)' }}>vs</span>
            <select
              value={mB}
              onChange={(e) => setMB(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-light)', fontSize: 13 }}
            >
              <option value="">-- Choisir un 2ème mois --</option>
              {months.filter((m) => m !== mA).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        </div>

        {dB ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 }}>
            {[
              { label: 'Chiffre d\'Affaires', a: dA.ca, b: dB.ca },
              { label: 'Bénéfice Net', a: dA.netProfit, b: dB.netProfit },
              { label: 'Nombre de Ventes', a: dA.nbSales, b: dB.nbSales, isCount: true },
            ].map((row) => {
              const diff = row.a - row.b;
              const pct = row.b ? Math.round((diff / row.b) * 100) : 0;
              const pos = diff >= 0;
              return (
                <div key={row.label} style={{ background: 'var(--bg-page)', borderRadius: 12, padding: 16, border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted-text)', marginBottom: 6 }}>{row.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark-text)' }}>
                    {row.isCount ? fmtN(row.a) : fmt(row.a)}
                  </div>
                  <div style={{ fontSize: 12, color: pos ? 'var(--emerald-dark)' : '#dc2626', fontWeight: 700, marginTop: 4 }}>
                    {pos ? '+' : ''}{row.isCount ? fmtN(diff) : fmt(diff)} ({pos ? '+' : ''}{pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '16px 0', color: 'var(--muted-text)', fontSize: 13 }}>
            Sélectionnez un second mois ci-dessus pour afficher la comparaison détaillée.
          </div>
        )}

        {months.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 20 }}>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Ventes</th>
                    <th>Chiffre d'Affaires</th>
                    <th>Pubs</th>
                    <th>Bénéfice Net</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => {
                    const d = byMonth[m];
                    const net = d.ca - d.cost - d.ads - d.delivery;
                    return (
                      <tr key={m}>
                        <td className="bold">
                          {monthLabel(m)}
                          {m === thisMonth() && <span className="status-badge completed" style={{ marginLeft: 8 }}>EN COURS</span>}
                        </td>
                        <td>{fmtN(d.nb)}</td>
                        <td className="bold">{fmt(d.ca)}</td>
                        <td>{fmt(d.ads)}</td>
                        <td style={{ fontWeight: 700, color: net >= 0 ? 'var(--emerald-dark)' : '#dc2626' }}>
                          {fmt(net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Décrit l'arc SVG du gauge demi-cercle en fonction d'un pourcentage 0-100
function describeGaugeArc(pct) {
  const cx = 90, cy = 85, r = 70;
  const angleDeg = 180 - (pct / 100) * 180; // 180° (gauche, départ) → 0° (droite, fin)
  const angleRad = (angleDeg * Math.PI) / 180;
  const x = cx + r * Math.cos(angleRad);
  const y = cy - r * Math.sin(angleRad);
  return `M 15 85 A 70 70 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}
