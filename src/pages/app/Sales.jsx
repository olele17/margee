import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { fmt, today, selfPaidDelivery } from '../../utils/calc';
import { downloadReceiptPdf } from '../../utils/receiptPdf';

const blank = {
  date: today(), productId: '', qty: 1,
  clientName: '', clientPhone: '', clientAddress: '',
  deliveryCost: '', deliveryPaidByClient: false,
};

export default function Sales() {
  const { account, products, sales, reload, ready } = useBusinessData();
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');

  // Reste synchronisé si l'utilisateur relance une recherche depuis la topbar
  useEffect(() => {
    setQ(searchParams.get('q') || '');
  }, [searchParams]);

  const product = products.find((p) => p.id === form.productId);
  const previewProfit = product
    ? Number(form.qty || 0) * (product.price - product.costPrice) - (form.deliveryPaidByClient ? 0 : Number(form.deliveryCost || 0))
    : 0;

  const submit = async () => {
    if (!product || !form.qty) return;
    const sale = await api.recordSale(account.id, {
      date: form.date,
      productId: product.id,
      productName: product.name,
      qty: Number(form.qty),
      costPrice: Number(product.costPrice),
      price: Number(product.price),
      clientName: form.clientName,
      clientPhone: form.clientPhone,
      clientAddress: form.clientAddress,
      deliveryCost: Number(form.deliveryCost || 0),
      deliveryPaidByClient: !!form.deliveryPaidByClient,
    });
    setLastReceipt(sale);
    setForm(blank);
    setOpen(false);
    reload();
  };

  const remove = async (id) => {
    if (!confirm('Supprimer cette vente ?')) return;
    await api.deleteSale(account.id, id);
    reload();
  };

  if (!ready) return null;
  const sorted = [...sales]
    .filter((s) => {
      if (!q) return true;
      const needle = q.toLowerCase();
      return (
        s.receiptNumber?.toLowerCase().includes(needle) ||
        s.clientName?.toLowerCase().includes(needle) ||
        s.productName?.toLowerCase().includes(needle)
      );
    })
    // Plus récentes en premier ; à date égale, la dernière enregistrée en haut
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      (b.createdAt || '').localeCompare(a.createdAt || '') ||
      (b.receiptNumber || '').localeCompare(a.receiptNumber || ''));

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">Ventes</h2>
        <button className="btn btn-primary" onClick={() => setOpen(!open)}>
          <i className="ti ti-plus" /> Enregistrer une vente
        </button>
      </div>

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <input
          className="field"
          style={{ padding: '9px 14px', borderRadius: 8, border: '1.5px solid var(--border-light)', minWidth: 280 }}
          placeholder="Rechercher par reçu, client ou produit…"
          value={q}
          onChange={(e) => {
            const val = e.target.value;
            setQ(val);
            setSearchParams(val ? { q: val } : {}, { replace: true });
          }}
        />
        {q && (
          <span style={{ fontSize: 12, color: 'var(--muted-text)', marginLeft: 12 }}>
            {sorted.length} résultat{sorted.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {lastReceipt && (
        <div className="form-card" style={{ borderTopColor: 'var(--gold)' }}>
          <div className="form-card-title"><i className="ti ti-circle-check" style={{ color: 'var(--gold)' }} /> Vente enregistrée — reçu {lastReceipt.receiptNumber}</div>
          <div className="form-actions" style={{ marginTop: 0 }}>
            <button className="btn btn-dark" onClick={() => downloadReceiptPdf(account, lastReceipt)}>
              <i className="ti ti-file-invoice" /> Télécharger le reçu (PDF)
            </button>
            <button className="btn btn-ghost" onClick={() => setLastReceipt(null)}>Fermer</button>
          </div>
        </div>
      )}

      {open && (
        <div className="form-card">
          <div className="form-card-title">Nouvelle vente</div>
          <div className="form-grid">
            <div className="field"><label>Date *</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field">
              <label>Produit *</label>
              <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                <option value="">-- Choisir --</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Quantité *</label><input type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
            <div className="field"><label>Nom du client</label><input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></div>
            <div className="field"><label>Téléphone client</label><input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Adresse du client</label><input value={form.clientAddress} onChange={(e) => setForm({ ...form, clientAddress: e.target.value })} placeholder="Quartier, ville…" /></div>
            <div className="field"><label>Frais de livraison (Fr)</label><input type="number" min="0" value={form.deliveryCost} onChange={(e) => setForm({ ...form, deliveryCost: e.target.value })} placeholder="0" /></div>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ width: 16, height: 16 }}
                  checked={form.deliveryPaidByClient}
                  onChange={(e) => setForm({ ...form, deliveryPaidByClient: e.target.checked })}
                />
                Livraison payée par le client
              </label>
            </div>
          </div>
          {product && (
            <div className="preview-box">
              <span>Total produit : <strong>{fmt(Number(form.qty || 0) * product.price)}</strong></span>
              {Number(form.deliveryCost || 0) > 0 && (
                <span>
                  Livraison : <strong>{fmt(form.deliveryCost)}</strong>{' '}
                  ({form.deliveryPaidByClient ? 'payée par le client' : 'à votre charge'})
                </span>
              )}
              <span>
                Bénéfice : <strong className={previewProfit >= 0 ? 'amount-pos' : 'amount-neg'}>{fmt(previewProfit)}</strong>
              </span>
            </div>
          )}
          <div className="form-actions">
            <button className="btn btn-dark btn-lg" onClick={submit}>Enregistrer la vente</button>
            <button className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Reçu</th><th>Produit</th><th>Client</th><th>Qté</th><th>Total</th><th>Livraison</th><th>Bénéfice</th><th></th></tr></thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={9}><div className="empty-state"><i className="ti ti-receipt" /><p>{q ? 'Aucun résultat pour cette recherche.' : 'Aucune vente enregistrée.'}</p></div></td></tr>
              )}
              {sorted.map((s) => {
                const total = s.qty * s.price;
                const benef = total - s.qty * s.costPrice - selfPaidDelivery(s);
                return (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.receiptNumber}</td>
                    <td className="bold">{s.productName}</td>
                    <td>
                      {s.clientName || '—'}
                      {s.clientAddress && <div style={{ fontSize: 11.5, color: 'var(--muted-text)' }}>{s.clientAddress}</div>}
                    </td>
                    <td>{s.qty}</td>
                    <td className="bold">{fmt(total)}</td>
                    <td>
                      {Number(s.deliveryCost) > 0 ? (
                        <>
                          {fmt(s.deliveryCost)}
                          <div style={{ fontSize: 11, color: 'var(--muted-text)' }}>
                            {s.deliveryPaidByClient ? 'Payée par client' : 'À votre charge'}
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td className={benef >= 0 ? 'amount-pos' : 'amount-neg'}>{fmt(benef)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          type="button"
                          className="icon-btn icon-btn--download"
                          onClick={() => downloadReceiptPdf(account, s)}
                          aria-label={`Télécharger le reçu ${s.receiptNumber}`}
                          title={`Télécharger le reçu ${s.receiptNumber} (PDF)`}
                        >
                          <i className="ti ti-download" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          onClick={() => remove(s.id)}
                          aria-label={`Supprimer la vente ${s.receiptNumber}`}
                          title="Supprimer la vente"
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
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
