import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useBusinessData from '../../hooks/useBusinessData';
import { computeStats, groupByMonth, fmt, fmtN, monthLabel, thisMonth, today, computeChallengeProgress, CHALLENGE_TYPES, computeReceiptQuota } from '../../utils/calc';
import * as api from '../../services/api';
import usePlans from '../../hooks/usePlans';
import { challengeAdvice } from '../../components/ChallengeCard';
import { MASK, useAmountsHidden } from '../../utils/amountPrivacy';
import PrivacyToggle from '../../components/PrivacyToggle';
import { downloadReceiptPdf } from '../../utils/receiptPdf';
import '../../styles/dashboard.css';
import '../../styles/notes-challenges.css';

/* ── Outils de dates (format AAAA-MM-JJ, heure locale) ──────── */
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => new Date(`${s}T00:00:00`);
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoLocal(d); };
const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
const firstOfMonth = () => `${thisMonth()}-01`;
const dateFr = (s) => parseIso(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dateShort = (s) => parseIso(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_SHORT = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];

// Couleurs du donut, toutes issues de la palette Margee+
const DONUT_COLORS = ['#14161C', '#D4A03A', '#946A12', '#5B6472', '#E2C27A', '#B8B2A6'];

// Montant court pour les étiquettes du graphique : 45 k, 1,2 M
function shortMoney(n) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(Math.round(n));
}

// Mode discret : montants remplacés par •••••• quand ils sont masqués
function useMoney() {
  const [hidden] = useAmountsHidden();
  return { hidden, money: (n) => (hidden ? MASK : fmt(n)), short: (n) => (hidden ? '•••' : shortMoney(n)) };
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function pctChange(curr, prev) {
  if (!prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/* ── Décor : vagues dorées en bas des cartes ────────────────── */
function Waves() {
  return (
    <svg className="db-waves" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 22 C 40 6, 70 6, 110 20 S 180 36, 220 20 S 280 6, 300 16" />
      <path d="M0 30 C 45 16, 80 18, 120 28 S 190 40, 235 26 S 285 18, 300 26" />
    </svg>
  );
}

function KpiCard({ icon, label, value, trend, negative }) {
  const hasTrend = trend !== null && trend !== undefined && Number.isFinite(trend);
  const up = hasTrend && trend >= 0;
  return (
    <div className={`db-kpi${negative ? ' db-kpi--negative' : ''}`}>
      <div className="db-kpi-top">
        <span className="db-kpi-icon" aria-hidden="true"><i className={`ti ${icon}`} /></span>
        <div className="db-kpi-text">
          <div className="db-kpi-value">{value}</div>
          <div className="db-kpi-label">{label}</div>
        </div>
      </div>
      <div className={`db-kpi-trend ${hasTrend ? (up ? 'up' : 'down') : ''}`}>
        {hasTrend
          ? <><i className={`ti ti-arrow-${up ? 'up' : 'down'}-right`} aria-hidden="true" /> {up ? '+' : ''}{trend.toFixed(0)}% vs période précédente</>
          : 'Pas de comparaison'}
      </div>
      <Waves />
    </div>
  );
}

/* ── Graphique en barres : Semaine / Mois / Année ───────────── */
function buildSeries(sales, mode) {
  const caOn = (pred) => sales.filter(pred).reduce((a, s) => a + s.qty * s.price, 0);
  const t = today();
  if (mode === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(t, i - 6);
      return { label: DAY_SHORT[parseIso(day).getDay()], title: dateFr(day), value: caOn((s) => s.date === day), current: day === t };
    });
  }
  if (mode === 'month') {
    const m = thisMonth();
    const lastDay = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
    const weeks = [];
    for (let start = 1, w = 1; start <= lastDay; start += 7, w++) {
      const end = Math.min(start + 6, lastDay);
      const from = `${m}-${pad(start)}`;
      const to = `${m}-${pad(end)}`;
      weeks.push({ label: `S${w}`, title: `Du ${start} au ${end} ${monthLabel(m)}`, value: caOn((s) => s.date >= from && s.date <= to), current: t >= from && t <= to });
    }
    return weeks;
  }
  // year : 12 derniers mois
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    return { label: MONTH_SHORT[d.getMonth()], title: monthLabel(key), value: caOn((s) => s.date.slice(0, 7) === key), current: i === 11 };
  });
}

function SalesChart({ sales }) {
  const { money, short } = useMoney();
  const [mode, setMode] = useState('week');
  const series = useMemo(() => buildSeries(sales, mode), [sales, mode]);
  const max = Math.max(...series.map((b) => b.value), 1);
  const total = series.reduce((a, b) => a + b.value, 0);

  return (
    <section className="db-card db-chart" aria-labelledby="db-chart-title">
      <div className="db-card-head">
        <div>
          <h2 id="db-chart-title" className="db-card-title">Statistique des ventes</h2>
          <div className="db-card-sub">Chiffre d'affaires · total {money(total)}</div>
        </div>
        <div className="db-tabs" role="group" aria-label="Période du graphique">
          {[['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']].map(([k, l]) => (
            <button key={k} type="button" className={mode === k ? 'on' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="db-bars" role="img" aria-label={`Chiffre d'affaires par ${mode === 'week' ? 'jour' : mode === 'month' ? 'semaine' : 'mois'} : ${series.map((b) => `${b.label} ${money(b.value)}`).join(', ')}`}>
        {series.map((b, i) => (
          <div key={i} className="db-bar-col" title={`${b.title} : ${money(b.value)}`}>
            <span className="db-bar-value">{b.value > 0 ? short(b.value) : ''}</span>
            <div className="db-bar-track">
              <div className={`db-bar${b.current ? ' db-bar--current' : ''}`} style={{ height: `${Math.max((b.value / max) * 100, b.value > 0 ? 4 : 0)}%` }} />
            </div>
            <span className="db-bar-label">{b.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Donut : ventes par produit ─────────────────────────────── */
function ProductDonut({ sales }) {
  const { money, short } = useMoney();
  const slices = useMemo(() => {
    const map = {};
    sales.forEach((s) => { map[s.productName] = (map[s.productName] || 0) + s.qty * s.price; });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5).map(([name, value]) => ({ name, value }));
    const rest = sorted.slice(5).reduce((a, [, v]) => a + v, 0);
    if (rest > 0) top.push({ name: 'Autres', value: rest });
    return top;
  }, [sales]);
  const total = slices.reduce((a, s) => a + s.value, 0);

  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <section className="db-card db-donut-card" aria-labelledby="db-donut-title">
      <div className="db-card-head">
        <h2 id="db-donut-title" className="db-card-title">Ventes par produit</h2>
      </div>
      {total === 0 ? (
        <div className="db-empty"><i className="ti ti-chart-donut" aria-hidden="true" />Aucune vente sur la période.</div>
      ) : (
        <div className="db-donut-body">
          <ul className="db-legend">
            {slices.map((s, i) => (
              <li key={s.name}>
                <span className="db-legend-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} aria-hidden="true" />
                <span className="db-legend-name">{s.name}</span>
                <span className="db-legend-pct">{Math.round((s.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
          <div className="db-donut">
            <svg viewBox="0 0 180 180" role="img" aria-label={`Répartition du chiffre d'affaires : ${slices.map((s) => `${s.name} ${Math.round((s.value / total) * 100)}%`).join(', ')}`}>
              <circle cx="90" cy="90" r={R} fill="none" stroke="#F3ECDA" strokeWidth="30" />
              {slices.map((s, i) => {
                const len = (s.value / total) * C;
                const el = (
                  <circle
                    key={s.name}
                    cx="90" cy="90" r={R} fill="none"
                    stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                    strokeWidth="30"
                    strokeDasharray={`${Math.max(len - 2, 0)} ${C}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 90 90)"
                  >
                    <title>{`${s.name} : ${money(s.value)}`}</title>
                  </circle>
                );
                offset += len;
                return el;
              })}
            </svg>
            <div className="db-donut-center">
              <strong>{short(total)}</strong>
              <span>F CFA</span>
            </div>
          </div>
        </div>
      )}
      <Waves />
    </section>
  );
}

/* ── Carte « Challenge en cours » ───────────────────────────── */
// Affiche le challenge actif dont la date de fin est la plus proche.
function ActiveChallenge({ challenges, sales, ads, products }) {
  const { money } = useMoney();
  const active = useMemo(() => challenges
    .map((c) => ({ challenge: c, progress: computeChallengeProgress(c, sales, ads, products) }))
    .filter((i) => i.progress.status === 'ongoing')
    .sort((a, b) => a.challenge.endDate.localeCompare(b.challenge.endDate)),
  [challenges, sales, ads, products]);

  if (active.length === 0) {
    return (
      <section className="db-card db-challenge db-challenge--empty" aria-labelledby="db-challenge-title">
        <span className="db-challenge-icon" aria-hidden="true"><i className="ti ti-target-arrow" /></span>
        <div className="db-challenge-main">
          <h2 id="db-challenge-title" className="db-card-title">Fixe-toi un objectif</h2>
          <p className="db-card-sub">Choisis un chiffre d'affaires, un bénéfice ou un nombre de ventes à atteindre : Margee+ suit ta progression tout seul.</p>
        </div>
        <Link to="/app/challenges" className="btn btn-primary db-challenge-btn"><i className="ti ti-plus" aria-hidden="true" /> Créer un challenge</Link>
      </section>
    );
  }

  const { challenge, progress: pr } = active[0];
  const fmtVal = (n) => (pr.unit === 'money' ? money(Math.round(n)) : fmtN(Math.round(n)));
  const pct = Math.round(pr.percent);
  return (
    <section className="db-card db-challenge" aria-labelledby="db-challenge-title">
      <span className="db-challenge-icon" aria-hidden="true"><i className={`ti ${CHALLENGE_TYPES[challenge.type]?.icon || 'ti-target-arrow'}`} /></span>
      <div className="db-challenge-main">
        <div className="db-challenge-head">
          <span className="db-challenge-label">Challenge en cours{active.length > 1 ? ` · ${active.length} actifs` : ''}</span>
          <span className="db-challenge-days">{pr.daysLeft} {pr.daysLeft > 1 ? 'jours restants' : 'jour restant'}</span>
        </div>
        <h2 id="db-challenge-title" className="db-card-title">{challenge.title}</h2>
        <div className="db-challenge-progress">
          <div className="nc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-label={pr.isBudget ? 'Part du budget pub dépensée' : "Progression vers l'objectif"}>
            <div className="nc-bar-fill" style={{ width: `${Math.min(pr.percent, 100)}%` }} />
          </div>
          <span className="nc-bar-pct">{pct}%</span>
        </div>
        <div className="db-challenge-meta">
          <span>{pr.isBudget ? 'Dépensé' : 'Réalisé'} : <strong>{fmtVal(pr.realized)}</strong> / {fmtVal(pr.target)}</span>
          <span className="db-challenge-advice"><i className="ti ti-bolt" aria-hidden="true" />{challengeAdvice(challenge, pr)}</span>
        </div>
      </div>
      <Link to="/app/challenges" className="btn btn-outline db-challenge-btn">Voir mes challenges <i className="ti ti-arrow-right" aria-hidden="true" /></Link>
    </section>
  );
}

/* ── Carte « plan et reçus » (quota du plan + appel à passer au plan supérieur) ── */
function QuotaCard({ account, usage, trial }) {
  const { all } = usePlans();
  const planKey = account?.subscription?.plan;
  const plan = all[planKey];
  const docsUsed = trial ? trial.quotes + trial.invoices : 0;
  const quota = useMemo(() => computeReceiptQuota(plan, usage, undefined, docsUsed), [plan, usage, docsUsed]);
  if (!plan || !quota.limited) return null;           // Elite : illimité
  if (planKey !== 'free' && !quota.reached && !quota.nearLimit) return null; // Pro : seulement à l'approche de la limite

  const isFree = planKey === 'free';
  const nextPlan = (isFree ? all.pro : all.elite) || all.pro;
  const scopeLabel = quota.scope === 'month' ? 'ce mois-ci' : 'au total';

  // Essai gratuit : jours restants (l'essai finit au bout des jours OU des reçus)
  const sub = account?.subscription || {};
  const trialDaysLeft = sub.status === 'trial' && sub.trialEndsAt
    ? Math.max(Math.ceil((new Date(sub.trialEndsAt) - new Date()) / 86400000), 0)
    : null;
  const daysLabel = trialDaysLeft === null ? '' : `${trialDaysLeft} jour${trialDaysLeft > 1 ? 's' : ''}`;

  let title;
  let text;
  if (trialDaysLeft !== null && !quota.reached) {
    title = `Essai gratuit : encore ${daysLabel} · ${quota.used} / ${quota.limit} essais utilisés`;
    text = `À la fin de l'essai, passe à ${nextPlan.label} (${fmt(nextPlan.price)} / mois) pour continuer sans interruption.`;
  } else if (quota.reached) {
    title = isFree ? `Tu as utilisé tes ${quota.limit} essais gratuits` : `Limite de ${quota.limit} reçus atteinte ce mois-ci`;
    text = isFree
      ? `Passe à ${nextPlan.label} (${fmt(nextPlan.price)} / mois) pour continuer à créer tes reçus, factures et devis.`
      : `Passe à ${nextPlan.label} pour des reçus illimités, ou attends le 1er du mois prochain.`;
  } else if (quota.nearLimit) {
    title = isFree
      ? `Plus que ${quota.remaining} essai${quota.remaining > 1 ? 's' : ''} gratuit${quota.remaining > 1 ? 's' : ''} (reçus, factures ou devis)`
      : `Plus que ${quota.remaining} reçu${quota.remaining > 1 ? 's' : ''} ce mois-ci`;
    text = `Anticipe : avec ${nextPlan.label}, ${nextPlan.receiptLimit ? `${nextPlan.receiptLimit} reçus par mois` : 'tes reçus sont illimités'}.`;
  } else {
    title = `Plan ${plan.label} : ${quota.used} / ${quota.limit} ${isFree ? 'essais' : 'reçus'} utilisés ${scopeLabel}`;
    text = `Passe à ${nextPlan.label} pour ${nextPlan.receiptLimit ? `${nextPlan.receiptLimit} reçus par mois` : 'des reçus illimités'}.`;
  }

  const tone = quota.reached ? 'reached' : (quota.nearLimit || (trialDaysLeft !== null && trialDaysLeft <= 1)) ? 'near' : 'info';
  return (
    <section className={`db-quota db-quota--${tone}`} aria-labelledby="db-quota-title" role={quota.reached ? 'alert' : undefined}>
      <span className="db-quota-icon" aria-hidden="true">
        <i className={`ti ${quota.reached ? 'ti-lock' : 'ti-receipt'}`} />
      </span>
      <div className="db-quota-main">
        <h2 id="db-quota-title" className="db-quota-title">{title}</h2>
        <p className="db-quota-text">{text}</p>
        <div className="db-quota-progress">
          <div className="nc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={Math.min(quota.used, quota.limit)} aria-label={`Reçus utilisés ${scopeLabel}`}>
            <div className={`nc-bar-fill${quota.reached ? ' is-failed' : ''}`} style={{ width: `${quota.percent}%` }} />
          </div>
          <span className="db-quota-count">{Math.min(quota.used, quota.limit)} / {quota.limit}</span>
        </div>
      </div>
      <Link to="/abonnement" className={`btn ${quota.reached ? 'btn-primary' : 'btn-outline'} db-quota-btn`}>
        <i className="ti ti-arrow-up-right" aria-hidden="true" /> {quota.reached ? 'Voir les plans' : `Passer à ${nextPlan.label}`}
      </Link>
    </section>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function Dashboard() {
  const { money } = useMoney();
  const { account, sales, ads, investments, products, ready } = useBusinessData();
  const [challenges, setChallenges] = useState([]);
  useEffect(() => {
    if (account) api.listChallenges(account.id).then(setChallenges);
  }, [account]);

  // Reçus émis (quota du plan), rechargés quand le nombre de ventes change
  const [usage, setUsage] = useState([]);
  const [trial, setTrial] = useState(null);
  useEffect(() => {
    if (!account) return;
    api.getReceiptUsage(account.id).then(setUsage).catch(() => setUsage([]));
    // Essais Free : les factures et devis comptent aussi
    if (account.subscription?.plan === 'free') api.getTrialUsage().then(setTrial).catch(() => setTrial(null));
  }, [account, sales.length]);

  // Filtre de dates : brouillon (champs) puis appliqué (bouton Filtrer)
  const [fromDraft, setFromDraft] = useState(firstOfMonth());
  const [toDraft, setToDraft] = useState(today());
  const [range, setRange] = useState({ from: firstOfMonth(), to: today() });
  const [rangeErr, setRangeErr] = useState('');

  const [q, setQ] = useState('');
  const [productFilter, setProductFilter] = useState('');

  // Comparaison mensuelle (conservée sous le tableau de bord)
  const [mA, setMA] = useState(thisMonth());
  const [mB, setMB] = useState('');

  const inRange = (d, r) => d >= r.from && d <= r.to;
  const prevRange = useMemo(() => {
    const len = daysBetween(range.from, range.to) + 1;
    return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
  }, [range]);

  const periodSales = useMemo(() => sales.filter((s) => inRange(s.date, range)), [sales, range]);
  const stats = useMemo(
    () => computeStats(periodSales, ads.filter((a) => inRange(a.date, range)), investments),
    [periodSales, ads, investments, range]
  );
  const prev = useMemo(
    () => computeStats(sales.filter((s) => inRange(s.date, prevRange)), ads.filter((a) => inRange(a.date, prevRange)), investments),
    [sales, ads, investments, prevRange]
  );

  const recent = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...periodSales]
      .filter((s) => !productFilter || s.productName === productFilter)
      .filter((s) => !needle || [s.clientName, s.productName, s.receiptNumber, s.clientPhone].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '') || (b.receiptNumber || '').localeCompare(a.receiptNumber || ''));
  }, [periodSales, q, productFilter]);

  const topClients = useMemo(() => {
    const map = {};
    periodSales.forEach((s) => {
      const name = s.clientName?.trim();
      if (!name) return;
      map[name] = map[name] || { name, count: 0, total: 0 };
      map[name].count += 1;
      map[name].total += s.qty * s.price;
    });
    return Object.values(map).sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 6);
  }, [periodSales]);

  const productNames = useMemo(() => [...new Set(periodSales.map((s) => s.productName))].sort(), [periodSales]);

  const byMonth = useMemo(() => groupByMonth(sales, ads), [sales, ads]);
  const months = Object.keys(byMonth).sort().reverse();
  const dA = mA ? computeStats(sales, ads, investments, mA) : null;
  const dB = mB ? computeStats(sales, ads, investments, mB) : null;

  const applyRange = (e) => {
    e.preventDefault();
    if (!fromDraft || !toDraft) { setRangeErr('Choisis une date de début et une date de fin.'); return; }
    if (fromDraft > toDraft) { setRangeErr('La date de début doit être avant la date de fin.'); return; }
    setRangeErr('');
    setRange({ from: fromDraft, to: toDraft });
  };
  const resetRange = () => {
    setFromDraft(firstOfMonth()); setToDraft(today()); setRangeErr('');
    setRange({ from: firstOfMonth(), to: today() });
  };
  const isDefaultRange = range.from === firstOfMonth() && range.to === today();

  if (!ready) return null;

  return (
    <div className="page-content db">
      {/* ── Filtre de dates ─────────────────────────────────── */}
      <form className="db-filter" onSubmit={applyRange} aria-label="Filtrer par période" noValidate>
        <label className="db-date">
          <i className="ti ti-calendar" aria-hidden="true" />
          <span className="sr-only">Date de début</span>
          <input type="date" value={fromDraft} max={toDraft || undefined} onChange={(e) => setFromDraft(e.target.value)} />
        </label>
        <span className="db-filter-sep" aria-hidden="true">—</span>
        <label className="db-date">
          <i className="ti ti-calendar" aria-hidden="true" />
          <span className="sr-only">Date de fin</span>
          <input type="date" value={toDraft} min={fromDraft || undefined} onChange={(e) => setToDraft(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-dark db-filter-btn">
          <i className="ti ti-filter" aria-hidden="true" /> Filtrer
        </button>
        {!isDefaultRange && (
          <button type="button" className="btn btn-outline db-filter-btn" onClick={resetRange}>Ce mois-ci</button>
        )}
        <span className="db-filter-info">Du {dateFr(range.from)} au {dateFr(range.to)}</span>
        <PrivacyToggle className="db-filter-btn" />
        <Link to="/app/ventes" className="btn btn-primary db-filter-add">
          <i className="ti ti-plus" aria-hidden="true" /> Ajouter une vente
        </Link>
      </form>
      {rangeErr && <div className="db-filter-err" role="alert">{rangeErr}</div>}

      {/* ── Plan et reçus : appel à passer au plan supérieur ── */}
      <QuotaCard account={account} usage={usage} trial={trial} />

      {/* ── Alerte de déficit sur la période ────────────────── */}
      {stats.netProfit < 0 && (
        <div className="deficit-alert" role="alert">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          <span>
            <strong>Déficit sur la période : {money(stats.netProfit)}.</strong>{' '}
            Tes coûts (produits, pubs, livraisons) dépassent tes ventes.
          </span>
        </div>
      )}

      {/* ── 4 cartes chiffrées ──────────────────────────────── */}
      <div className="db-kpis">
        <KpiCard icon="ti-cash-banknote" label="Chiffre d'affaires" value={money(stats.ca)} trend={pctChange(stats.ca, prev.ca)} />
        <KpiCard
          icon={stats.netProfit < 0 ? 'ti-trending-down' : 'ti-trending-up'}
          label="Bénéfice net"
          value={money(stats.netProfit)}
          trend={pctChange(stats.netProfit, prev.netProfit)}
          negative={stats.netProfit < 0}
        />
        <KpiCard icon="ti-speakerphone" label="Pubs dépensées" value={money(stats.adSpend)} trend={pctChange(stats.adSpend, prev.adSpend)} />
        <KpiCard
          icon="ti-chart-arrows-vertical"
          label="ROI"
          value={`${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`}
          trend={null}
          negative={stats.roi < 0}
        />
      </div>

      {/* ── Challenge en cours ──────────────────────────────── */}
      <ActiveChallenge challenges={challenges} sales={sales} ads={ads} products={products} />

      {/* ── Graphique + donut ───────────────────────────────── */}
      <div className="db-row db-row--charts">
        <SalesChart sales={sales} />
        <ProductDonut sales={periodSales} />
      </div>

      {/* ── Ventes récentes + top clients ───────────────────── */}
      <div className="db-row db-row--tables">
        <section className="db-card db-recent" aria-labelledby="db-recent-title">
          <div className="db-recent-head">
            <h2 id="db-recent-title" className="db-recent-title">Ventes récentes</h2>
            <div className="db-recent-tools">
              <label className="db-search">
                <span className="sr-only">Rechercher une vente</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" />
                <i className="ti ti-search" aria-hidden="true" />
              </label>
              <label className="db-select">
                <span className="sr-only">Filtrer par produit</span>
                <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
                  <option value="">Tous les produits</option>
                  {productNames.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="db-table-scroll">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Client</th><th>Produit</th><th>Date</th><th>Reçu</th><th>Montant</th><th>Téléphone</th><th><span className="sr-only">Reçu PDF</span></th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && (
                  <tr><td colSpan={7}><div className="db-empty">{q || productFilter ? 'Aucune vente ne correspond.' : 'Aucune vente sur la période.'}</div></td></tr>
                )}
                {recent.slice(0, 8).map((s, i) => (
                  <tr key={s.id} className={i === 0 && !q && !productFilter ? 'db-row-latest' : ''}>
                    <td>
                      <span className="db-person">
                        <span className="db-avatar" aria-hidden="true">{initials(s.clientName)}</span>
                        {s.clientName || '—'}
                      </span>
                    </td>
                    <td>{s.productName}</td>
                    <td className="db-nowrap" title={dateFr(s.date)}>{dateShort(s.date)}</td>
                    <td className="db-nowrap">{s.receiptNumber}</td>
                    <td className="db-nowrap db-strong">{money(s.qty * s.price)}</td>
                    <td className="db-nowrap">{s.clientPhone || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn icon-btn--download db-dl"
                        onClick={() => downloadReceiptPdf(account, s)}
                        aria-label={`Télécharger le reçu ${s.receiptNumber}`}
                        title={`Télécharger le reçu ${s.receiptNumber} (PDF)`}
                      >
                        <i className="ti ti-download" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recent.length > 8 && (
            <Link to="/app/ventes" className="db-more">Voir les {fmtN(recent.length)} ventes <i className="ti ti-arrow-right" aria-hidden="true" /></Link>
          )}
        </section>

        <section className="db-card db-top" aria-labelledby="db-top-title">
          <div className="db-top-head">
            <h2 id="db-top-title">Top clients</h2>
            <span>Achats</span>
          </div>
          {topClients.length === 0 ? (
            <div className="db-empty">Aucun client sur la période.</div>
          ) : (
            <ol className="db-top-list">
              {topClients.map((c) => (
                <li key={c.name}>
                  <span className="db-avatar db-avatar--gold" aria-hidden="true">{initials(c.name)}</span>
                  <span className="db-top-name">
                    {c.name}
                    <small>{money(c.total)}</small>
                  </span>
                  <span className="db-top-count" aria-label={`${c.count} achats`}>{c.count}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* ── Comparaison mensuelle ───────────────────────────── */}
      <section className="db-card db-compare" aria-labelledby="db-compare-title">
        <div className="db-card-head">
          <h2 id="db-compare-title" className="db-card-title">Comparaison mensuelle</h2>
          <div className="month-compare-controls">
            <select value={mA} onChange={(e) => setMA(e.target.value)} aria-label="Premier mois">
              {(months.includes(thisMonth()) ? months : [thisMonth(), ...months]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <span>vs</span>
            <select value={mB} onChange={(e) => setMB(e.target.value)} aria-label="Second mois">
              <option value="">Choisir un 2e mois</option>
              {months.filter((m) => m !== mA).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        </div>

        {dB && (
          <div className="db-compare-grid">
            {[
              { label: "Chiffre d'affaires", a: dA.ca, b: dB.ca },
              { label: 'Bénéfice net', a: dA.netProfit, b: dB.netProfit },
              { label: 'Nombre de ventes', a: dA.nbSales, b: dB.nbSales, isCount: true },
            ].map((row) => {
              const diff = row.a - row.b;
              const pct = row.b ? Math.round((diff / Math.abs(row.b)) * 100) : 0;
              const pos = diff >= 0;
              return (
                <div key={row.label} className="db-compare-item">
                  <div className="db-compare-label">{row.label}</div>
                  <div className={`db-compare-value${!row.isCount && row.a < 0 ? ' amount-neg' : ''}`}>{row.isCount ? fmtN(row.a) : money(row.a)}</div>
                  <div className={pos ? 'amount-pos' : 'amount-neg'}>
                    {pos ? '+' : ''}{row.isCount ? fmtN(diff) : money(diff)} ({pos ? '+' : ''}{pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {months.length > 0 && (
          <div className="db-table-scroll">
            <table className="db-table">
              <thead><tr><th>Mois</th><th>Ventes</th><th>Chiffre d'affaires</th><th>Pubs</th><th>Bénéfice net</th></tr></thead>
              <tbody>
                {months.map((m) => {
                  const d = byMonth[m];
                  const net = d.ca - d.cost - d.ads - d.delivery;
                  return (
                    <tr key={m}>
                      <td className="db-strong">
                        {monthLabel(m)}
                        {m === thisMonth() && <span className="status-badge completed" style={{ marginLeft: 8 }}>En cours</span>}
                      </td>
                      <td>{fmtN(d.nb)}</td>
                      <td className="db-strong">{money(d.ca)}</td>
                      <td>{money(d.ads)}</td>
                      <td className={net >= 0 ? 'amount-pos' : 'amount-neg'}>{money(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
