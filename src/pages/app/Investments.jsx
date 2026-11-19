import { useState } from 'react';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { computeStats, fmt, today } from '../../utils/calc';

const blank = { date: today(), description: '', amount: '' };

export default function Investments() {
  const { account, sales, ads, investments, reload, ready } = useBusinessData();
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    if (!form.description || !form.amount) return;
    await api.saveInvestment(account.id, form);
    setForm(blank); setOpen(false);
    reload();
  };
  const remove = async (id) => {
    if (!confirm('Supprimer cet investissement ?')) return;
    await api.deleteInvestment(account.id, id);
    reload();
  };

  if (!ready) return null;
  const stats = computeStats(sales, ads, investments);
  const roiPos = stats.roi >= 0;
  const barW = Math.min(Math.max(Math.abs(stats.roi) / 10, 1), 100);
  const sorted = [...investments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">Investissements &amp; ROI</h2>
        <button className="btn btn-primary" onClick={() => setOpen(!open)}><i className="ti ti-plus" /> Ajouter</button>
      </div>

      <div className="card" style={{ background: 'var(--emerald-dark)', color: '#fff', marginBottom: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 1 }}>Retour sur investissement</div>
          <div style={{ fontFamily: 'Bricolage Grotesque, Inter, sans-serif', fontSize: 40, fontWeight: 800, color: roiPos ? 'var(--success-on-dark)' : 'var(--danger-on-dark)' }}>
            {roiPos ? '+' : ''}{stats.roi.toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Pour {fmt(stats.totalInvested)} investis</div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>Investi</div>
            <div style={{ fontFamily: 'Bricolage Grotesque, Inter, sans-serif', fontWeight: 700, color: '#fff' }}>{fmt(stats.totalInvested)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>CA généré</div>
            <div style={{ fontFamily: 'Bricolage Grotesque, Inter, sans-serif', fontWeight: 700, color: '#fff' }}>{fmt(stats.ca)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>Bénéfice net</div>
            <div style={{ fontFamily: 'Bricolage Grotesque, Inter, sans-serif', fontWeight: 700, color: stats.netProfit < 0 ? 'var(--danger-on-dark)' : '#fff' }}>{fmt(stats.netProfit)}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ background: 'var(--cream-2)', borderRadius: 20, height: 12, overflow: 'hidden' }}>
          <div style={{ width: barW + '%', height: '100%', borderRadius: 20, background: roiPos ? 'linear-gradient(90deg,var(--gold-light),var(--gold))' : 'linear-gradient(90deg,#B71C1C,#ff6b6b)' }} />
        </div>
      </div>

      {open && (
        <div className="form-card">
          <div className="form-card-title">Nouvel investissement</div>
          <div className="form-grid">
            <div className="field"><label>Date *</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label>Montant (Fr) *</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Description *</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Achat stock, frais transport…" /></div>
          </div>
          <div className="form-actions">
            <button className="btn btn-dark btn-lg" onClick={submit}>Ajouter</button>
            <button className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Montant</th><th></th></tr></thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={4}><div className="empty-state"><i className="ti ti-building-bank" /><p>Aucun investissement enregistré.</p></div></td></tr>
              )}
              {sorted.map((i) => (
                <tr key={i.id}>
                  <td>{i.date}</td>
                  <td className="bold">{i.description}</td>
                  <td className="bold">{fmt(i.amount)}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => remove(i.id)}><i className="ti ti-trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
