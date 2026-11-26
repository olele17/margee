import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import {
  fmtN, today, stockStatus, stockSummary, stockDaysLeft,
  STOCK_STATUS, STOCK_MOVE_TYPES, STOCK_REASONS,
} from '../../utils/calc';
import { money, useAmountsHidden } from '../../utils/amountPrivacy';
import PrivacyToggle from '../../components/PrivacyToggle';
import { ActivateDialog, EntryDialog, AdjustDialog, HistoryDialog, MovesList } from '../../components/StockDialogs';
import '../../styles/documents.css';
import '../../styles/stock.css';

/**
 * Stock : ce qu'il reste de chaque produit, les alertes avant rupture et
 * l'argent qui dort dans le stock. Toutes les modifications passent par
 * les fonctions SQL (la base décide, l'écran affiche).
 */
export default function Stock() {
  useAmountsHidden(); // se réaffiche quand le mode discret change
  const { account, products, sales, reload, ready } = useBusinessData();
  const [tab, setTab] = useState('produits');
  const [dialog, setDialog] = useState({ kind: null, product: null });
  const [toast, setToast] = useState('');

  const open = (kind, product) => setDialog({ kind, product });
  const close = useCallback(() => setDialog({ kind: null, product: null }), []);
  const done = (msg) => () => { close(); setToast(msg); reload(); };
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);

  if (!ready) return null;

  const tracked = products.filter((p) => p.trackStock);
  const untracked = products.filter((p) => !p.trackStock);
  const sum = stockSummary(products);
  const dlg = (kind) => (dialog.kind === kind ? dialog.product : null);

  return (
    <div className="page-content">
      <div className="section-header">
        <div>
          <h2 className="section-title">Stock</h2>
          <div className="section-sub">Ce qu'il te reste, ce qu'il faut racheter et l'argent qui dort dans ton stock</div>
        </div>
        <PrivacyToggle />
      </div>

      {tracked.length === 0 ? (
        <div className="card-widget stock-empty">
          <span className="stock-empty-icon" aria-hidden="true"><i className="ti ti-building-warehouse" /></span>
          <p>Active le suivi de stock sur tes produits pour savoir ce qu'il te reste et ne plus jamais être en rupture.</p>
          {untracked.length > 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => open('activate', untracked[0])}>
              <i className="ti ti-player-play" aria-hidden="true" /> Activer le suivi sur « {untracked[0].name} »
            </button>
          ) : (
            <Link to="/app/produits" className="btn btn-primary"><i className="ti ti-plus" aria-hidden="true" /> Ajouter un produit</Link>
          )}
        </div>
      ) : (
        <>
          <div className="kpi-grid stock-kpis">
            <div className="kpi-card highlight">
              <div className="kpi-top-row"><span className="kpi-label">Argent investi dans ton stock</span></div>
              <div className="kpi-value">{money(sum.costValue)}</div>
              <div className="kpi-trend-pill up"><span>Au coût d'achat</span></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-top-row"><span className="kpi-label">Valeur à la vente</span></div>
              <div className="kpi-value">{money(sum.saleValue)}</div>
              <div className="kpi-trend-pill up"><span>Si tout est vendu au prix</span></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-top-row"><span className="kpi-label">Marge potentielle</span></div>
              <div className="kpi-value">{money(sum.margin)}</div>
              <div className="kpi-trend-pill up"><span>Vente − coût d'achat</span></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-top-row"><span className="kpi-label">Ruptures</span></div>
              <div className="kpi-value">{fmtN(sum.out)}</div>
              <div className={`kpi-trend-pill ${sum.out ? 'down' : 'up'}`}><span>{sum.out ? 'À racheter vite' : 'Aucune'}</span></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-top-row"><span className="kpi-label">Stocks bas</span></div>
              <div className="kpi-value">{fmtN(sum.low)}</div>
              <div className={`kpi-trend-pill ${sum.low ? 'down' : 'up'}`}><span>{sum.low ? 'Sous le seuil d\'alerte' : 'Aucun'}</span></div>
            </div>
          </div>

          <div className="doc-tabs stock-tabs" role="tablist" aria-label="Vue du stock">
            <button type="button" role="tab" aria-selected={tab === 'produits'} className={tab === 'produits' ? 'is-on' : ''} onClick={() => setTab('produits')}>Produits</button>
            <button type="button" role="tab" aria-selected={tab === 'mouvements'} className={tab === 'mouvements' ? 'is-on' : ''} onClick={() => setTab('mouvements')}>Mouvements</button>
          </div>

          {tab === 'produits'
            ? <ProductsTab products={tracked} sales={sales} onAction={open} />
            : <MovesTab accountId={account.id} products={products} />}
        </>
      )}

      {untracked.length > 0 && tracked.length > 0 && (
        <details className="card-widget stock-untracked">
          <summary>
            <span><i className="ti ti-eye-off" aria-hidden="true" /> Produits sans suivi de stock ({untracked.length})</span>
            <i className="ti ti-chevron-down stock-chevron" aria-hidden="true" />
          </summary>
          <ul>
            {untracked.map((p) => (
              <li key={p.id}>
                <span className="bold">{p.name}</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => open('activate', p)}>
                  <i className="ti ti-player-play" aria-hidden="true" /> Activer le suivi
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {toast && <div className="stock-toast" role="status">{toast}</div>}

      <ActivateDialog product={dlg('activate')} accountId={account.id} onClose={close} onDone={done('Suivi du stock activé.')} />
      <EntryDialog product={dlg('entry')} accountId={account.id} onClose={close}
        onDone={(r) => { close(); setToast(`Entrée enregistrée : stock ${fmtN(r.stockQty)}.${r.costUpdated ? ' Coût de revient mis à jour.' : ''}`); reload(); }} />
      <AdjustDialog product={dlg('adjust')} accountId={account.id} onClose={close}
        onDone={(r) => { close(); setToast(r.delta === 0 ? 'Le stock compté est déjà juste : rien à ajuster.' : `Stock ajusté (${r.delta > 0 ? '+' : ''}${fmtN(r.delta)}) : ${fmtN(r.stockQty)}.`); reload(); }} />
      <HistoryDialog product={dlg('history')} accountId={account.id} onClose={close} />
    </div>
  );
}

// ── Onglet Produits ──────────────────────────────────────────────
const SORTS = {
  status: { label: 'Urgence', fn: (a, b) => STOCK_STATUS[a.status].rank - STOCK_STATUS[b.status].rank || a.qty - b.qty },
  name: { label: 'Nom', fn: (a, b) => a.p.name.localeCompare(b.p.name, 'fr') },
  qty: { label: 'Stock', fn: (a, b) => a.qty - b.qty },
  value: { label: 'Valeur', fn: (a, b) => b.value - a.value },
  days: { label: 'Jours restants', fn: (a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) },
};

function ProductsTab({ products, sales, onAction }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('status');
  const now = today();

  const rows = useMemo(() => products
    .map((p) => ({ p, qty: p.stockQty, status: stockStatus(p), value: Math.max(p.stockQty, 0) * p.costPrice, days: stockDaysLeft(p, sales, now) }))
    .filter((r) => (!status || r.status === status) && (!q || r.p.name.toLowerCase().includes(q.trim().toLowerCase())))
    .sort(SORTS[sort].fn), [products, sales, q, status, sort, now]);

  return (
    <>
      <div className="stock-filters">
        <input type="search" placeholder="Rechercher un produit" aria-label="Rechercher un produit" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filtrer par statut" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STOCK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Trier : {v.label}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="stock-table">
            <thead><tr><th>Produit</th><th>Stock</th><th>Seuil</th><th>Statut</th><th>Valeur</th><th>Jours restants</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7}><div className="empty-state"><i className="ti ti-search" /><p>Aucun produit ne correspond.</p></div></td></tr>
              )}
              {rows.map(({ p, qty, status: st, value, days }) => (
                <tr key={p.id}>
                  <td className="bold" data-label="Produit">{p.name}</td>
                  <td data-label="Stock" className={qty <= 0 ? 'amount-neg' : 'bold'}>{fmtN(qty)}</td>
                  <td data-label="Seuil">{fmtN(p.alertThreshold)}</td>
                  <td data-label="Statut"><span className={`status-badge ${STOCK_STATUS[st].badge}`}>{STOCK_STATUS[st].label}</span></td>
                  <td data-label="Valeur">{money(value)}</td>
                  <td data-label="Jours restants">{days === null ? '—' : `${fmtN(days)} j`}</td>
                  <td className="stock-row-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('entry', p)}><i className="ti ti-plus" aria-hidden="true" /> Entrée</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => onAction('adjust', p)}><i className="ti ti-adjustments" aria-hidden="true" /> Ajuster</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAction('history', p)} aria-label={`Historique de ${p.name}`}><i className="ti ti-history" aria-hidden="true" /> Historique</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Onglet Mouvements (journal complet + export CSV) ─────────────
function MovesTab({ accountId, products }) {
  const [moves, setMoves] = useState(null);
  const [err, setErr] = useState('');
  const [product, setProduct] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    let alive = true;
    api.listStockMoves(accountId).then((m) => { if (alive) setMoves(m); }).catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [accountId]);

  const names = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);
  const list = useMemo(() => (moves || []).filter((m) => (!product || m.productId === product)
    && (!type || m.type === type) && (!from || m.date >= from) && (!to || m.date <= to)), [moves, product, type, from, to]);

  const exportCsv = () => {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Date', 'Produit', 'Type', 'Quantité', 'Coût unitaire (F)', 'Motif', 'Fournisseur', 'Note', 'Reçu'];
    const lines = list.map((m) => [m.date, names[m.productId] || '', STOCK_MOVE_TYPES[m.type], m.quantity,
      m.unitCost ?? '', m.reason ? STOCK_REASONS[m.reason] : '', m.supplier, m.note, m.receiptNumber || ''].map(cell).join(';'));
    const blob = new Blob([`﻿${[head.join(';'), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `margee-mouvements-stock-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="card-widget">
      <div className="stock-filters">
        <select aria-label="Filtrer par produit" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">Tous les produits</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Filtrer par type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les types</option>
          {Object.entries(STOCK_MOVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="stock-date"><span>Du</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="stock-date"><span>Au</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!list.length}>
          <i className="ti ti-download" aria-hidden="true" /> Export CSV
        </button>
      </div>
      {err && <div className="stock-err" role="alert">{err}</div>}
      {!moves && !err && <p className="stock-muted">Chargement…</p>}
      {moves && list.length === 0 && <div className="empty-state"><i className="ti ti-arrows-exchange" /><p>Aucun mouvement pour ces filtres.</p></div>}
      {list.length > 0 && <MovesList moves={list} productNames={names} />}
    </div>
  );
}
