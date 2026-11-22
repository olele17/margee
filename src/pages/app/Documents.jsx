import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';
import { fmt } from '../../utils/calc';
import { KIND_LABELS, statusInfo, displayStatus } from '../../utils/documents';
import { downloadDocumentPdf } from '../../utils/documentPdf';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../styles/documents.css';

const dateFr = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/**
 * Factures et devis : liste, filtres, PDF, statut, devis → facture.
 * Les montants et numéros viennent de la base.
 */
export default function Documents() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('type') || 'all'; // all | quote | invoice
  const [docs, setDocs] = useState(null);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => api.listDocuments().then(setDocs).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (docs || []).filter((d) => (tab === 'all' || d.kind === tab)
      && (!q || d.clientName.toLowerCase().includes(q) || d.number.toLowerCase().includes(q)));
  }, [docs, tab, search]);

  const stats = useMemo(() => {
    const list = docs || [];
    const sum = (arr) => arr.reduce((a, d) => a + d.total, 0);
    const pendingQuotes = list.filter((d) => d.kind === 'quote' && d.status === 'sent');
    const toCollect = list.filter((d) => d.kind === 'invoice' && d.status === 'sent');
    const late = toCollect.filter((d) => displayStatus(d) === 'late');
    const month = new Date().toISOString().slice(0, 7);
    const paidMonth = list.filter((d) => d.kind === 'invoice' && d.status === 'paid' && String(d.paidAt || '').slice(0, 7) === month);
    return { pendingQuotes, toCollect, late, paidMonth, sum };
  }, [docs]);

  const setStatus = async (d, status, msg) => {
    setBusy(d.id);
    setErr('');
    try {
      await api.setDocumentStatus(d.id, status);
      await load();
      flash(msg);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const convert = async (d) => {
    setBusy(d.id);
    setErr('');
    try {
      const id = await api.convertQuoteToInvoice(d.id);
      navigate(`/app/documents/${id}`, { state: { flash: `Facture créée à partir du devis ${d.number}.` } });
    } catch (e) { setErr(e.message); setBusy(''); }
  };

  const remove = async () => {
    const d = toDelete;
    setToDelete(null);
    try {
      await api.deleteDocument(d.id);
      await load();
      flash(`${KIND_LABELS[d.kind]} ${d.number} supprimé${d.kind === 'invoice' ? 'e' : ''}.`);
    } catch (e) { setErr(e.message); }
  };

  const TABS = [['all', 'Tout'], ['quote', 'Devis'], ['invoice', 'Factures']];

  return (
    <div className="page-content">
      <div className="section-header">
        <div>
          <h2 className="section-title">Factures &amp; devis</h2>
          <div className="section-sub">Crée tes devis, transforme-les en factures et télécharge des PDF à tes couleurs.</div>
        </div>
        <div className="doc-new">
          <Link className="btn btn-outline" to="/app/documents/nouveau?type=quote"><i className="ti ti-file-description" /> Nouveau devis</Link>
          <Link className="btn btn-primary" to="/app/documents/nouveau?type=invoice"><i className="ti ti-file-invoice" /> Nouvelle facture</Link>
        </div>
      </div>

      <div className="doc-stats">
        <div className="doc-stat">
          <span className="doc-stat-label">Devis en attente de réponse</span>
          <strong>{fmt(stats.sum(stats.pendingQuotes))}</strong>
          <span className="doc-stat-sub">{stats.pendingQuotes.length} devis envoyé{stats.pendingQuotes.length > 1 ? 's' : ''}</span>
        </div>
        <div className="doc-stat">
          <span className="doc-stat-label">Factures à encaisser</span>
          <strong>{fmt(stats.sum(stats.toCollect))}</strong>
          <span className={`doc-stat-sub${stats.late.length ? ' is-late' : ''}`}>
            {stats.late.length ? `dont ${stats.late.length} en retard (${fmt(stats.sum(stats.late))})` : `${stats.toCollect.length} facture${stats.toCollect.length > 1 ? 's' : ''} envoyée${stats.toCollect.length > 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="doc-stat doc-stat--dark">
          <span className="doc-stat-label">Factures payées ce mois-ci</span>
          <strong>{fmt(stats.sum(stats.paidMonth))}</strong>
          <span className="doc-stat-sub">{stats.paidMonth.length} facture{stats.paidMonth.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="doc-toolbar">
        <div className="doc-tabs" role="group" aria-label="Type de document">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setParams(k === 'all' ? {} : { type: k }, { replace: true })}>{l}</button>
          ))}
        </div>
        <div className="doc-search">
          <i className="ti ti-search" aria-hidden="true" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client ou numéro" aria-label="Rechercher un client ou un numéro" />
        </div>
      </div>

      {toast && <div className="doc-toast" role="status"><i className="ti ti-circle-check" aria-hidden="true" /> {toast}</div>}
      {err && <div className="settings-err" role="alert">{err}</div>}

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th>Total</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {docs === null && <tr><td colSpan={6}><div className="empty-state"><p>Chargement…</p></div></td></tr>}
              {docs && shown.length === 0 && (
                <tr><td colSpan={6}><div className="empty-state"><i className="ti ti-file-invoice" /><p>{docs.length ? 'Aucun document ne correspond.' : 'Aucun devis ni facture pour l\'instant. Crée ton premier document.'}</p></div></td></tr>
              )}
              {shown.map((d) => {
                const s = statusInfo(d);
                return (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/app/documents/${d.id}`} className="bold doc-num">{d.number}</Link>
                      <div className="doc-kind">{KIND_LABELS[d.kind]}</div>
                    </td>
                    <td className="bold">{d.clientName}</td>
                    <td>
                      {dateFr(d.issueDate)}
                      {d.dueDate && <div className="doc-kind">{d.kind === 'quote' ? 'Valable' : 'Échéance'} : {dateFr(d.dueDate)}</div>}
                    </td>
                    <td className="bold">{fmt(d.total)}</td>
                    <td><span className={`badge ${s.cls}`}><i className={`ti ${s.icon}`} aria-hidden="true" />{s.label}</span></td>
                    <td>
                      <div className="doc-actions">
                        <button type="button" className="btn btn-ghost btn-sm" title="Télécharger le PDF" aria-label={`Télécharger le PDF ${d.number}`} onClick={() => downloadDocumentPdf(account, d)}>
                          <i className="ti ti-download" />
                        </button>
                        <Link className="btn btn-ghost btn-sm" to={`/app/documents/${d.id}`} title="Modifier" aria-label={`Modifier ${d.number}`}><i className="ti ti-pencil" /></Link>
                        {d.kind === 'quote' && d.status !== 'refused' && d.status !== 'accepted' && (
                          <button type="button" className="btn btn-outline btn-sm" disabled={busy === d.id} onClick={() => convert(d)}>
                            <i className="ti ti-arrow-right" /> Facture
                          </button>
                        )}
                        {d.kind === 'invoice' && (d.status === 'sent' || d.status === 'draft') && (
                          <button type="button" className="btn btn-outline btn-sm" disabled={busy === d.id} onClick={() => setStatus(d, 'paid', `Facture ${d.number} marquée payée.`)}>
                            <i className="ti ti-cash" /> Payée
                          </button>
                        )}
                        <button type="button" className="btn btn-danger btn-sm" title="Supprimer" aria-label={`Supprimer ${d.number}`} onClick={() => setToDelete(d)}><i className="ti ti-trash" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        danger
        icon="ti-trash"
        title={toDelete ? `Supprimer ${toDelete.kind === 'quote' ? 'le devis' : 'la facture'} ${toDelete.number} ?` : ''}
        message="Le document sera supprimé définitivement. Son numéro ne sera pas réutilisé."
        confirmLabel="Supprimer"
        onCancel={() => setToDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}
