import { useState } from 'react';
import { Link } from 'react-router-dom';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { fmt, fmtN, stockStatus, STOCK_STATUS } from '../../utils/calc';
import { money, useAmountsHidden } from '../../utils/amountPrivacy';
import PrivacyToggle from '../../components/PrivacyToggle';
import { useHasPaidPlan } from '../../components/PaidOnly';
import '../../styles/stock.css';

const blank = { name: '', category: '', costPrice: '', price: '', trackStock: false, initialStock: '', alertThreshold: '5' };
const isInt = (v) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0;

export default function Products() {
  useAmountsHidden(); // se réaffiche quand le mode discret change
  const { account, products, reload, ready } = useBusinessData();
  const hasPaidPlan = useHasPaidPlan();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [wasTracked, setWasTracked] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const margin = (p) => Math.round(Number(p.price || 0) - Number(p.costPrice || 0));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const needsInitial = form.trackStock && !wasTracked;

  const submit = async () => {
    setErr('');
    if (!form.name.trim() || !form.costPrice || !form.price) { setErr('Remplis le nom, le coût de revient et le prix de vente.'); return; }
    if (form.trackStock && needsInitial && !isInt(form.initialStock)) { setErr('Indique le stock actuel (nombre entier, 0 ou plus).'); return; }
    if (!isInt(form.alertThreshold)) { setErr("Indique le seuil d'alerte (nombre entier, 0 ou plus)."); return; }
    setBusy(true);
    try {
      await api.saveProduct(account.id, { ...form, id: editing, wasTracked });
      setForm(blank); setEditing(null); setWasTracked(false); setOpen(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      reload();
    }
  };
  const edit = (p) => {
    setForm({ ...p, costPrice: String(p.costPrice), price: String(p.price), initialStock: '', alertThreshold: String(p.alertThreshold) });
    setEditing(p.id); setWasTracked(p.trackStock); setErr(''); setOpen(true);
  };
  const remove = async (id) => {
    if (!confirm('Supprimer ce produit ?')) return;
    await api.deleteProduct(account.id, id);
    reload();
  };

  if (!ready) return null;

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">Mes produits</h2>
        <PrivacyToggle />
        <button className="btn btn-primary" onClick={() => { setOpen(!open); setEditing(null); setWasTracked(false); setForm(blank); setErr(''); }}>
          <i className="ti ti-plus" /> Ajouter
        </button>
      </div>

      {open && (
        <div className="form-card">
          <div className="form-card-title">{editing ? 'Modifier le produit' : 'Nouveau produit'}</div>
          <div className="form-grid">
            <div className="field"><label htmlFor="pr-name">Nom *</label><input id="pr-name" value={form.name} onChange={set('name')} /></div>
            <div className="field"><label htmlFor="pr-cat">Catégorie</label><input id="pr-cat" value={form.category} onChange={set('category')} /></div>
            <div className="field"><label htmlFor="pr-cost">Coût de revient (Fr) *</label><input id="pr-cost" type="number" value={form.costPrice} onChange={set('costPrice')} /></div>
            <div className="field"><label htmlFor="pr-price">Prix de vente (Fr) *</label><input id="pr-price" type="number" value={form.price} onChange={set('price')} /></div>
          </div>

          {/* ── Stock (Pro / Elite) ───────────────────────────── */}
          {hasPaidPlan ? (
            <div className="stock-switch-block">
              <label className="stock-switch">
                <input type="checkbox" role="switch" checked={form.trackStock} onChange={set('trackStock')} />
                <span className="stock-switch-track" aria-hidden="true" />
                <span><strong>Suivre le stock</strong><span className="stock-switch-sub">Chaque vente retirera automatiquement du stock.</span></span>
              </label>
              {form.trackStock && (
                <div className="form-grid" style={{ marginTop: 12 }}>
                  {needsInitial ? (
                    <div className="field"><label htmlFor="pr-stock">Stock actuel *</label><input id="pr-stock" type="number" min="0" step="1" inputMode="numeric" value={form.initialStock} onChange={set('initialStock')} /></div>
                  ) : (
                    <div className="field"><label>Stock actuel</label><div className="stock-readonly">{fmtN(form.stockQty)} · <Link to="/app/stock">modifier dans Stock</Link></div></div>
                  )}
                  <div className="field"><label htmlFor="pr-alert">Seuil d'alerte</label><input id="pr-alert" type="number" min="0" step="1" inputMode="numeric" value={form.alertThreshold} onChange={set('alertThreshold')} /></div>
                </div>
              )}
              {!form.trackStock && wasTracked && (
                <p className="stock-switch-sub" style={{ marginTop: 8 }}>Le suivi sera arrêté : le stock et son historique sont gardés.</p>
              )}
            </div>
          ) : (
            <p className="stock-switch-sub" style={{ marginTop: 14 }}>
              <i className="ti ti-lock" aria-hidden="true" /> Le suivi de stock est disponible avec Pro ou Elite. <Link to="/abonnement?plan=pro">Voir les plans</Link>
            </p>
          )}

          {form.price && form.costPrice && (
            <div className="preview-box"><span>Marge :</span><strong className={margin(form) >= 0 ? 'amount-pos' : 'amount-neg'}>{fmt(margin(form))}</strong></div>
          )}
          {err && <div className="stock-err" role="alert">{err}</div>}
          <div className="form-actions">
            <button className="btn btn-dark btn-lg" onClick={submit} disabled={busy}>{busy ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter'}</button>
            <button className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Produit</th><th>Catégorie</th><th>Coût</th><th>Prix vente</th><th>Marge</th><th>Stock</th><th></th></tr></thead>
            <tbody>
              {products.length === 0 && (
                <tr><td colSpan={7}><div className="empty-state"><i className="ti ti-package" /><p>Aucun produit. Ajoute ton premier produit.</p></div></td></tr>
              )}
              {products.map((p) => {
                const st = stockStatus(p);
                return (
                  <tr key={p.id}>
                    <td className="bold">{p.name}</td>
                    <td>{p.category || '—'}</td>
                    <td>{money(p.costPrice)}</td>
                    <td className="bold">{money(p.price)}</td>
                    <td className={margin(p) >= 0 ? 'amount-pos' : 'amount-neg'}>{money(margin(p))}</td>
                    <td>
                      {st && (
                        <span className="stock-cell">
                          <span className="bold">{fmtN(p.stockQty)}</span>
                          <span className={`status-badge ${STOCK_STATUS[st].badge}`}>{STOCK_STATUS[st].label}</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => edit(p)} aria-label={`Modifier ${p.name}`}><i className="ti ti-pencil" /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(p.id)} aria-label={`Supprimer ${p.name}`}><i className="ti ti-trash" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
