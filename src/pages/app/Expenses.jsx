import { useMemo, useState } from 'react';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { fmt, fmtN, today, thisMonth, prevMonthKey, monthLabel, computeExpenseStats, groupExpensesByMonth } from '../../utils/calc';

const blank = { date: today(), description: '', amount: '', type: 'passif' };

export default function Expenses() {
  const { account, expenses, reload, ready } = useBusinessData();
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [mA, setMA] = useState(thisMonth());
  const [mB, setMB] = useState('');

  const submit = async () => {
    if (!form.description.trim() || !form.amount) return;
    await api.saveExpense(account.id, { ...form, amount: Number(form.amount) });
    setForm(blank);
    setOpen(false);
    reload();
  };
  const remove = async (id) => {
    if (!confirm('Supprimer cette dépense ?')) return;
    await api.deleteExpense(account.id, id);
    reload();
  };

  const allTime = useMemo(() => computeExpenseStats(expenses), [expenses]);
  const cm = useMemo(() => computeExpenseStats(expenses, thisMonth()), [expenses]);
  const pm = useMemo(() => computeExpenseStats(expenses, prevMonthKey(thisMonth())), [expenses]);
  const byMonth = useMemo(() => groupExpensesByMonth(expenses), [expenses]);
  const months = Object.keys(byMonth).sort().reverse();
  const dA = mA ? computeExpenseStats(expenses, mA) : null;
  const dB = mB ? computeExpenseStats(expenses, mB) : null;

  const trendPct = (curr, prev) => (prev ? Math.round(((curr - prev) / prev) * 100) : null);
  const totalTrend = trendPct(cm.total, pm.total);

  if (!ready) return null;
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="page-content">
      <div className="section-header">
        <div>
          <h2 className="section-title">Dépenses</h2>
          <div className="section-sub">Suivez ce que vous dépensez, pourquoi, et si c'est un actif ou un passif</div>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(!open)}>
          <i className="ti ti-plus" /> Ajouter une dépense
        </button>
      </div>

      {/* ── Résumé global ─────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card highlight">
          <div className="kpi-top-row"><span className="kpi-label">Total dépensé</span></div>
          <div className="kpi-value">{fmt(allTime.total)}</div>
          <div className="kpi-trend-pill up"><span>{fmtN(allTime.count)} dépense(s)</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top-row"><span className="kpi-label">Actif</span></div>
          <div className="kpi-value">{fmt(allTime.actif)}</div>
          <div className="kpi-trend-pill up"><span>Garde/crée de la valeur</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top-row"><span className="kpi-label">Passif</span></div>
          <div className="kpi-value">{fmt(allTime.passif)}</div>
          <div className="kpi-trend-pill down"><span>Charge consommée</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top-row"><span className="kpi-label">Ce mois — {monthLabel(thisMonth())}</span></div>
          <div className="kpi-value">{fmt(cm.total)}</div>
          <div className={`kpi-trend-pill ${totalTrend === null ? '' : totalTrend > 0 ? 'down' : 'up'}`}>
            <span>{totalTrend === null ? 'Pas de comparaison' : `${totalTrend >= 0 ? '+' : ''}${totalTrend}% vs mois dernier`}</span>
          </div>
        </div>
      </div>

      {open && (
        <div className="form-card">
          <div className="form-card-title">Nouvelle dépense</div>
          <div className="form-grid">
            <div className="field"><label>Date *</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label>Montant (Fr) *</label><input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Raison / description *</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Achat d'un ordinateur, loyer boutique, taxe…" />
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Type</label>
              <div style={{ display: 'flex', gap: 20, marginTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="expType" checked={form.type === 'actif'} onChange={() => setForm({ ...form, type: 'actif' })} />
                  Actif <span style={{ color: 'var(--muted-text)', fontWeight: 400 }}>(garde/crée de la valeur : matériel, stock, outillage…)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="expType" checked={form.type === 'passif'} onChange={() => setForm({ ...form, type: 'passif' })} />
                  Passif <span style={{ color: 'var(--muted-text)', fontWeight: 400 }}>(charge consommée : loyer, taxes, frais divers…)</span>
                </label>
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-dark btn-lg" onClick={submit}>Ajouter</button>
            <button className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── Comparaison mensuelle ────────────────────────────── */}
      <div className="card-widget" style={{ marginBottom: 24 }}>
        <div className="widget-header">
          <h3 className="widget-title">Comparaison Mensuelle</h3>
          <div className="month-compare-controls">
            <select
              value={mA}
              onChange={(e) => setMA(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-light)', fontSize: 13 }}
            >
              {(months.includes(thisMonth()) ? months : [thisMonth(), ...months]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
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
              { label: 'Total dépensé', a: dA.total, b: dB.total },
              { label: 'Actif', a: dA.actif, b: dB.actif },
              { label: 'Passif', a: dA.passif, b: dB.passif },
            ].map((row) => {
              const diff = row.a - row.b;
              const pct = row.b ? Math.round((diff / row.b) * 100) : 0;
              const worse = diff > 0; // plus de dépenses = pas bon signe
              return (
                <div key={row.label} style={{ background: 'var(--bg-page)', borderRadius: 12, padding: 16, border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted-text)', marginBottom: 6 }}>{row.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark-text)' }}>{fmt(row.a)}</div>
                  <div style={{ fontSize: 12, color: worse ? 'var(--danger)' : 'var(--success)', fontWeight: 700, marginTop: 4 }}>
                    {diff >= 0 ? '+' : ''}{fmt(diff)} ({diff >= 0 ? '+' : ''}{pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '16px 0', color: 'var(--muted-text)', fontSize: 13 }}>
            Sélectionnez un second mois ci-dessus pour comparer vos dépenses entre deux mois.
          </div>
        )}
      </div>

      {/* ── Liste des dépenses ──────────────────────────────── */}
      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Raison</th><th>Type</th><th>Montant</th><th></th></tr></thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state"><i className="ti ti-wallet" /><p>Aucune dépense enregistrée.</p></div></td></tr>
              )}
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td className="bold">{e.description}</td>
                  <td>
                    <span className={`status-badge ${e.type === 'actif' ? 'success' : 'danger'}`}>
                      {e.type === 'actif' ? 'Actif' : 'Passif'}
                    </span>
                  </td>
                  <td className="bold">{fmt(e.amount)}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => remove(e.id)}><i className="ti ti-trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
