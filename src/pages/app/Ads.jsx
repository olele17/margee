import { useState } from 'react';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { fmt, today } from '../../utils/calc';

const blank = { date: today(), platform: 'Meta', amount: '', note: '' };

export default function Ads() {
  const { account, ads, reload, ready } = useBusinessData();
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    if (!form.amount) return;
    await api.saveAdSpend(account.id, form);
    setForm(blank); setOpen(false);
    reload();
  };
  const remove = async (id) => {
    if (!confirm('Supprimer cette dépense ?')) return;
    await api.deleteAdSpend(account.id, id);
    reload();
  };

  if (!ready) return null;
  const total = ads.reduce((a, x) => a + Number(x.amount), 0);
  const sorted = [...ads].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="page-content">
      <div className="section-header">
        <div>
          <h2 className="section-title">Pubs dépensées</h2>
          <div className="section-sub">Ces montants sont déduits de ton bénéfice</div>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(!open)}><i className="ti ti-plus" /> Ajouter</button>
      </div>

      <div className="stat-row" style={{ marginBottom: 18 }}>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>Total dépensé</div>
          <div style={{ fontFamily: 'Bricolage Grotesque, Inter, sans-serif', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{fmt(total)}</div>
        </div>
      </div>

      {open && (
        <div className="form-card">
          <div className="form-card-title">Nouvelle dépense pub</div>
          <div className="form-grid">
            <div className="field"><label>Date *</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field">
              <label>Plateforme</label>
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                {['Meta', 'TikTok', 'Google', 'WhatsApp', 'Autre'].map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="field"><label>Montant (Fr) *</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field"><label>Note</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ex: campagne lancement" /></div>
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
            <thead><tr><th>Date</th><th>Plateforme</th><th>Note</th><th>Montant</th><th></th></tr></thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state"><i className="ti ti-speakerphone" /><p>Aucune dépense pub enregistrée.</p></div></td></tr>
              )}
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td>{a.date}</td>
                  <td><span className="badge pending">{a.platform}</span></td>
                  <td>{a.note || '—'}</td>
                  <td className="bold">{fmt(a.amount)}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => remove(a.id)}><i className="ti ti-trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
