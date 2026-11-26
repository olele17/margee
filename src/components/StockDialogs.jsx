import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import * as api from '../services/api';
import { fmt, fmtN, today, weightedCost, STOCK_MOVE_TYPES, STOCK_REASONS } from '../utils/calc';
import { money } from '../utils/amountPrivacy';

/**
 * Fenêtres du stock (même style que ConfirmDialog) : Échap ou clic à côté
 * ferme, Tab reste dans la fenêtre, le focus revient au bouton d'origine.
 */
function StockModal({ open, title, icon, onClose, children, wide = false }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const first = ref.current?.querySelector('input, select, textarea, button');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const f = ref.current?.querySelectorAll('input, select, textarea, button, a[href]');
      if (!f?.length) return;
      const a = f[0]; const z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`confirm-dialog stock-dialog${wide ? ' stock-dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="stock-dialog-title">
        <div className="stock-dialog-head">
          <span className="confirm-icon" aria-hidden="true"><i className={`ti ${icon}`} /></span>
          <h2 id="stock-dialog-title" className="confirm-title">{title}</h2>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function useSubmit(onDone) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn) => {
    setErr(''); setBusy(true);
    try { const r = await fn(); onDone?.(r); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return { busy, err, setErr, run };
}

const isInt = (v, min = 0) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= min;

// ── Activer le suivi (stock initial + coût) ───────────────────────
export function ActivateDialog({ product, accountId, onClose, onDone }) {
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const { busy, err, setErr, run } = useSubmit(onDone);
  useEffect(() => { setQty(''); setCost(product ? String(product.costPrice) : ''); setErr(''); }, [product, setErr]);
  const submit = (e) => {
    e.preventDefault();
    if (!isInt(qty)) { setErr('Indique le stock actuel (nombre entier, 0 ou plus).'); return; }
    if (!isInt(cost)) { setErr("Indique le coût d'achat unitaire (0 ou plus)."); return; }
    run(() => api.setInitialStock(accountId, product.id, qty, cost));
  };
  return (
    <StockModal open={!!product} title={`Suivre le stock : ${product?.name || ''}`} icon="ti-building-warehouse" onClose={onClose}>
      <form className="stock-form" onSubmit={submit} noValidate>
        <p className="confirm-message">Compte ce qu'il te reste aujourd'hui. Ensuite, chaque vente retirera automatiquement du stock.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="act-qty">Stock actuel *</label><input id="act-qty" type="number" min="0" step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="field"><label htmlFor="act-cost">Coût d'achat unitaire (Fr) *</label><input id="act-cost" type="number" min="0" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        </div>
        {err && <div className="stock-err" role="alert">{err}</div>}
        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? 'Activation…' : 'Activer le suivi'}</button>
        </div>
      </form>
    </StockModal>
  );
}

// ── Entrée de stock (réassort) ────────────────────────────────────
export function EntryDialog({ product, accountId, onClose, onDone }) {
  const blank = { quantity: '', unitCost: '', supplier: '', date: today(), note: '', updateCost: false };
  const [f, setF] = useState(blank);
  const { busy, err, setErr, run } = useSubmit(onDone);
  useEffect(() => { setF({ ...blank, unitCost: product ? String(product.costPrice) : '' }); setErr(''); }, [product]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const differs = product && f.unitCost !== '' && Number(f.unitCost) !== product.costPrice;
  const avg = product && isInt(f.quantity, 1) && f.unitCost !== ''
    ? weightedCost(product.stockQty, product.costPrice, f.quantity, f.unitCost) : null;

  const submit = (e) => {
    e.preventDefault();
    if (!isInt(f.quantity, 1)) { setErr('Indique la quantité reçue (1 ou plus).'); return; }
    if (!isInt(f.unitCost)) { setErr("Indique le coût d'achat unitaire (0 ou plus)."); return; }
    if (f.date > today()) { setErr("La date de l'entrée ne peut pas être dans le futur."); return; }
    run(() => api.addStockEntry(accountId, { ...f, productId: product.id, updateCost: differs && f.updateCost }));
  };
  return (
    <StockModal open={!!product} title={`Entrée de stock : ${product?.name || ''}`} icon="ti-package-import" onClose={onClose}>
      <form className="stock-form" onSubmit={submit} noValidate>
        <p className="confirm-message">Stock actuel : <strong>{fmtN(product?.stockQty)}</strong>. Un réassort n'est pas une dépense : ton bénéfice ne change pas.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="ent-qty">Quantité reçue *</label><input id="ent-qty" type="number" min="1" step="1" inputMode="numeric" value={f.quantity} onChange={set('quantity')} /></div>
          <div className="field"><label htmlFor="ent-cost">Coût unitaire (Fr) *</label><input id="ent-cost" type="number" min="0" inputMode="numeric" value={f.unitCost} onChange={set('unitCost')} /></div>
          <div className="field"><label htmlFor="ent-sup">Fournisseur</label><input id="ent-sup" maxLength={120} value={f.supplier} onChange={set('supplier')} /></div>
          <div className="field"><label htmlFor="ent-date">Date</label><input id="ent-date" type="date" max={today()} value={f.date} onChange={set('date')} /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label htmlFor="ent-note">Note</label><input id="ent-note" maxLength={300} value={f.note} onChange={set('note')} /></div>
        </div>
        {differs && avg !== null && (
          <label className="stock-check">
            <input type="checkbox" checked={f.updateCost} onChange={set('updateCost')} />
            <span>Mettre à jour le coût de revient avec le coût moyen (<strong>{fmt(avg)}</strong>) ? Actuellement : {fmt(product.costPrice)}.</span>
          </label>
        )}
        {err && <div className="stock-err" role="alert">{err}</div>}
        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? 'Enregistrement…' : "Enregistrer l'entrée"}</button>
        </div>
      </form>
    </StockModal>
  );
}

// ── Inventaire (ajustement) ───────────────────────────────────────
export function AdjustDialog({ product, accountId, onClose, onDone }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const { busy, err, setErr, run } = useSubmit(onDone);
  useEffect(() => { setQty(''); setReason(''); setNote(''); setErr(''); }, [product, setErr]);
  const delta = product && isInt(qty) ? Number(qty) - product.stockQty : null;
  const submit = (e) => {
    e.preventDefault();
    if (!isInt(qty)) { setErr('Indique la quantité comptée (0 ou plus).'); return; }
    if (!reason) { setErr("Choisis le motif de l'ajustement."); return; }
    run(() => api.adjustStock(accountId, { productId: product.id, realQuantity: qty, reason, note }));
  };
  return (
    <StockModal open={!!product} title={`Ajuster : ${product?.name || ''}`} icon="ti-adjustments" onClose={onClose}>
      <form className="stock-form" onSubmit={submit} noValidate>
        <p className="confirm-message">Stock enregistré : <strong>{fmtN(product?.stockQty)}</strong>. Indique ce que tu as réellement compté.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="adj-qty">Quantité comptée *</label><input id="adj-qty" type="number" min="0" step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="field">
            <label htmlFor="adj-reason">Motif *</label>
            <select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choisir…</option>
              {Object.entries(STOCK_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label htmlFor="adj-note">Note</label><input id="adj-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        {delta !== null && (
          <div className="preview-box">
            <span>Ajustement :</span>
            <strong className={delta < 0 ? 'amount-neg' : delta > 0 ? 'amount-pos' : ''}>{delta > 0 ? '+' : ''}{fmtN(delta)} unité(s)</strong>
          </div>
        )}
        {err && <div className="stock-err" role="alert">{err}</div>}
        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? 'Enregistrement…' : 'Ajuster le stock'}</button>
        </div>
      </form>
    </StockModal>
  );
}

// ── Historique d'un produit ───────────────────────────────────────
export function HistoryDialog({ product, accountId, onClose }) {
  const [moves, setMoves] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!product) return undefined;
    let alive = true;
    setMoves(null); setErr('');
    api.listStockMoves(accountId, { productId: product.id })
      .then((m) => { if (alive) setMoves(m); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [product, accountId]);
  return (
    <StockModal open={!!product} title={`Historique : ${product?.name || ''}`} icon="ti-history" onClose={onClose} wide>
      {err && <div className="stock-err" role="alert">{err}</div>}
      {!moves && !err && <p className="confirm-message">Chargement…</p>}
      {moves && moves.length === 0 && <p className="confirm-message">Aucun mouvement pour ce produit.</p>}
      {moves && moves.length > 0 && <MovesList moves={moves} compact />}
      <div className="confirm-actions stock-actions-one">
        <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
      </div>
    </StockModal>
  );
}

/** Liste des mouvements (historique d'un produit, onglet Mouvements). */
export function MovesList({ moves, productNames = {}, compact = false }) {
  return (
    <ul className="stock-moves">
      {moves.map((m) => (
        <li key={m.id} className="stock-move">
          <div className="stock-move-main">
            <span className={`stock-move-qty ${m.quantity > 0 ? 'amount-pos' : 'amount-neg'}`}>{m.quantity > 0 ? '+' : ''}{fmtN(m.quantity)}</span>
            <div>
              <div className="bold">{STOCK_MOVE_TYPES[m.type]}{!compact && productNames[m.productId] ? ` · ${productNames[m.productId]}` : ''}</div>
              <div className="stock-move-sub">
                {m.date}
                {m.unitCost != null && (m.type === 'entree' || m.type === 'initial') ? ` · ${money(m.unitCost)} / unité` : ''}
                {m.reason ? ` · ${STOCK_REASONS[m.reason]}` : ''}
                {m.supplier ? ` · ${m.supplier}` : ''}
                {m.note ? ` · ${m.note}` : ''}
              </div>
            </div>
          </div>
          {m.saleId && <Link to="/app/ventes" className="stock-move-link"><i className="ti ti-receipt" aria-hidden="true" /> {m.receiptNumber || 'Voir la vente'}</Link>}
        </li>
      ))}
    </ul>
  );
}
