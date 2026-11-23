import { useState } from 'react';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { fmt } from '../../utils/calc';
import { money, useAmountsHidden } from '../../utils/amountPrivacy';
import PrivacyToggle from '../../components/PrivacyToggle';

const blank = { name: '', category: '', costPrice: '', price: '' };

export default function Products() {
  useAmountsHidden(); // se réaffiche quand le mode discret change
  const { account, products, reload, ready } = useBusinessData();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const margin = (p) => Math.round(Number(p.price || 0) - Number(p.costPrice || 0));

  const submit = async () => {
    if (!form.name.trim() || !form.costPrice || !form.price) return;
    await api.saveProduct(account.id, { ...form, id: editing });
    setForm(blank); setEditing(null); setOpen(false);
    reload();
  };
  const edit = (p) => { setForm(p); setEditing(p.id); setOpen(true); };
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
        <button className="btn btn-primary" onClick={() => { setOpen(!open); setEditing(null); setForm(blank); }}>
          <i className="ti ti-plus" /> Ajouter
        </button>
      </div>

      {open && (
        <div className="form-card">
          <div className="form-card-title">{editing ? 'Modifier le produit' : 'Nouveau produit'}</div>
          <div className="form-grid">
            <div className="field"><label>Nom *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Catégorie</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div className="field"><label>Coût de revient (Fr) *</label><input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></div>
            <div className="field"><label>Prix de vente (Fr) *</label><input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          </div>
          {form.price && form.costPrice && (
            <div className="preview-box"><span>Marge :</span><strong className={margin(form) >= 0 ? 'amount-pos' : 'amount-neg'}>{fmt(margin(form))}</strong></div>
          )}
          <div className="form-actions">
            <button className="btn btn-dark btn-lg" onClick={submit}>{editing ? 'Enregistrer' : 'Ajouter'}</button>
            <button className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Produit</th><th>Catégorie</th><th>Coût</th><th>Prix vente</th><th>Marge</th><th></th></tr></thead>
            <tbody>
              {products.length === 0 && (
                <tr><td colSpan={6}><div className="empty-state"><i className="ti ti-package" /><p>Aucun produit. Ajoute ton premier produit.</p></div></td></tr>
              )}
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="bold">{p.name}</td>
                  <td>{p.category || '—'}</td>
                  <td>{money(p.costPrice)}</td>
                  <td className="bold">{money(p.price)}</td>
                  <td className={margin(p) >= 0 ? 'amount-pos' : 'amount-neg'}>{money(margin(p))}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => edit(p)}><i className="ti ti-pencil" /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(p.id)}><i className="ti ti-trash" /></button>
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
