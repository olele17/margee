import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { fmt } from '../../utils/calc';
import { KIND_LABELS, STATUS, computeTotals, emptyLine, todayIso, addDays } from '../../utils/documents';
import { downloadDocumentPdf } from '../../utils/documentPdf';
import '../../styles/documents.css';

const DEFAULT_NOTES = {
  quote: 'Devis valable 30 jours. Acompte de 50 % à la commande, solde à la livraison.',
  invoice: 'Paiement à réception par Wave, Orange Money ou espèces. Merci de rappeler le numéro de facture.',
};

function blankDoc(kind) {
  const today = todayIso();
  return {
    kind,
    status: 'draft',
    clientName: '', clientPhone: '', clientEmail: '', clientAddress: '',
    issueDate: today,
    dueDate: addDays(today, kind === 'quote' ? 30 : 15),
    items: [emptyLine()],
    discountPercent: '',
    taxRate: '',
    notes: DEFAULT_NOTES[kind],
  };
}

const toForm = (d) => ({
  ...d,
  items: d.items.map((it) => ({ description: it.description, qty: String(it.qty).replace('.', ','), unitPrice: String(it.unitPrice) })),
  discountPercent: d.discountPercent ? String(d.discountPercent).replace('.', ',') : '',
  taxRate: d.taxRate ? String(d.taxRate).replace('.', ',') : '',
});

/** Création / modification d'un devis ou d'une facture */
export default function DocumentEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { account, products } = useBusinessData();
  const isNew = !id;
  const [form, setForm] = useState(() => (isNew ? blankDoc(params.get('type') === 'quote' ? 'quote' : 'invoice') : null));
  const [saved, setSaved] = useState(null); // document enregistré (numéro, montants de la base)
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(location.state?.flash || '');

  useEffect(() => {
    if (isNew) return undefined;
    // Une réponse arrivée après coup (double chargement, réseau lent)
    // ne doit jamais écraser ce que l'utilisateur est en train de saisir.
    let alive = true;
    api.getDocument(id).then((d) => {
      if (!alive) return;
      if (!d) { setErr('Document introuvable.'); return; }
      setSaved(d);
      setForm((f) => (f && f.id === d.id ? f : toForm(d)));
    }).catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [id, isNew]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const totals = useMemo(() => (form ? computeTotals(form.items, form.discountPercent, form.taxRate) : null), [form]);
  if (!form) return <div className="page-content">{err ? <div className="settings-err" role="alert">{err}</div> : <p>Chargement…</p>}</div>;

  const kind = form.kind;
  const set = (k) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [k]: v })); };
  const setLine = (i, k, v) => setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, emptyLine()] }));
  const removeLine = (i) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, j) => j !== i) : f.items }));
  const pickProduct = (i, name) => {
    const p = products.find((x) => x.name === name);
    setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, description: name, unitPrice: p ? String(p.price) : it.unitPrice } : it)) }));
  };

  const validate = () => {
    if (!form.clientName.trim()) return 'Indique le nom du client.';
    if (form.items.some((it) => !it.description.trim())) return 'Chaque ligne a besoin d\'une désignation.';
    if (form.items.some((it) => !(Number(String(it.qty).replace(',', '.')) > 0))) return 'Chaque ligne a besoin d\'une quantité supérieure à 0.';
    if (form.items.some((it) => String(it.unitPrice).trim() === '' || !(Number(it.unitPrice) >= 0) || !Number.isInteger(Number(it.unitPrice)))) return 'Chaque ligne a besoin d\'un prix unitaire (nombre entier de F CFA).';
    if (form.dueDate && form.dueDate < form.issueDate) return `La date ${kind === 'quote' ? 'de validité' : 'd\'échéance'} doit être après la date du document.`;
    return '';
  };

  const save = async (andPdf = false) => {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr('');
    setSaving(true);
    try {
      const d = await api.saveDocument({ ...form, id: saved?.id });
      if (andPdf) downloadDocumentPdf(account, d);
      // Retour à la liste Factures & devis, document mis en évidence
      navigate('/app/documents', {
        replace: isNew,
        state: { flash: `${KIND_LABELS[kind]} ${d.number} enregistré${kind === 'invoice' ? 'e' : ''}${andPdf ? ' et PDF téléchargé' : ''}.`, highlight: d.id },
      });
      return;
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const convert = async () => {
    setSaving(true);
    try {
      const newId = await api.convertQuoteToInvoice(saved.id);
      navigate(`/app/documents/${newId}`, { state: { flash: `Facture créée à partir du devis ${saved.number}.` } });
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const statusOptions = Object.entries(STATUS[kind]).filter(([k]) => k !== 'late');
  const title = saved ? `${KIND_LABELS[kind]} ${saved.number}` : (kind === 'quote' ? 'Nouveau devis' : 'Nouvelle facture');

  return (
    <div className="page-content">
      <div className="section-header">
        <div>
          <Link to={`/app/documents${kind === 'quote' ? '?type=quote' : '?type=invoice'}`} className="doc-back"><i className="ti ti-arrow-left" aria-hidden="true" /> Factures &amp; devis</Link>
          <h2 className="section-title">{title}</h2>
          <div className="section-sub">
            {saved ? 'Le numéro est attribué automatiquement et ne change plus.' : 'Le numéro sera attribué automatiquement à l\'enregistrement.'}
            {' '}Logo, couleurs et signature : <Link to="/app/parametres">Paramètres</Link>.
          </div>
        </div>
        {saved && kind === 'quote' && saved.status !== 'refused' && saved.status !== 'accepted' && (
          <button type="button" className="btn btn-outline" onClick={convert} disabled={saving}><i className="ti ti-arrow-right" /> Transformer en facture</button>
        )}
      </div>

      {toast && <div className="doc-toast" role="status"><i className="ti ti-circle-check" aria-hidden="true" /> {toast}</div>}

      <div className="doc-editor">
        <div className="doc-main">
          {/* ── Client ── */}
          <section className="form-card" aria-labelledby="doc-client-title">
            <div className="form-card-title" id="doc-client-title"><i className="ti ti-user" /> Client</div>
            <div className="form-grid">
              <div className="field"><label htmlFor="doc-client">Nom du client *</label><input id="doc-client" value={form.clientName} onChange={set('clientName')} maxLength={120} placeholder="Ex : Fatou Diop" /></div>
              <div className="field"><label htmlFor="doc-phone">Téléphone</label><input id="doc-phone" type="tel" value={form.clientPhone} onChange={set('clientPhone')} maxLength={40} /></div>
              <div className="field"><label htmlFor="doc-email">Email</label><input id="doc-email" type="email" value={form.clientEmail} onChange={set('clientEmail')} maxLength={254} /></div>
              <div className="field"><label htmlFor="doc-address">Adresse</label><input id="doc-address" value={form.clientAddress} onChange={set('clientAddress')} maxLength={200} /></div>
            </div>
          </section>

          {/* ── Lignes ── */}
          <section className="form-card" aria-labelledby="doc-lines-title">
            <div className="form-card-title" id="doc-lines-title"><i className="ti ti-list-details" /> {kind === 'quote' ? 'Prestations et produits' : 'Produits et services facturés'}</div>
            <datalist id="doc-products">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            <div className="doc-lines">
              <div className="doc-line doc-line--head" aria-hidden="true"><span>Désignation</span><span>Qté</span><span>Prix unitaire</span><span>Total</span><span /></div>
              {form.items.map((it, i) => (
                <div className="doc-line" key={i}>
                  <input aria-label={`Désignation, ligne ${i + 1}`} list="doc-products" value={it.description} maxLength={200}
                    onChange={(e) => { const v = e.target.value; if (products.some((p) => p.name === v)) pickProduct(i, v); else setLine(i, 'description', v); }}
                    placeholder="Produit ou prestation" />
                  <input aria-label={`Quantité, ligne ${i + 1}`} inputMode="decimal" value={it.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
                  <input aria-label={`Prix unitaire en F CFA, ligne ${i + 1}`} inputMode="numeric" value={it.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
                  <span className="doc-line-total">{fmt(totals.lines[i] || 0)}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(i)} disabled={form.items.length === 1} aria-label={`Supprimer la ligne ${i + 1}`}><i className="ti ti-x" /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={addLine} disabled={form.items.length >= 50} style={{ marginTop: 10 }}>
              <i className="ti ti-plus" /> Ajouter une ligne
            </button>
            {products.length > 0 && <div className="doc-hint">Astuce : tape le nom d'un de tes produits pour reprendre son prix.</div>}
          </section>

          {/* ── Notes ── */}
          <section className="form-card" aria-labelledby="doc-notes-title">
            <div className="form-card-title" id="doc-notes-title"><i className="ti ti-notes" /> {kind === 'quote' ? 'Conditions' : 'Conditions de paiement'}</div>
            <div className="field">
              <label htmlFor="doc-notes" className="sr-only">Conditions et notes</label>
              <textarea id="doc-notes" rows={3} maxLength={1000} value={form.notes} onChange={set('notes')} />
            </div>
          </section>
        </div>

        {/* ── Colonne de droite : infos, montants, actions ── */}
        <aside className="doc-side">
          <section className="form-card">
            <div className="form-card-title"><i className="ti ti-calendar" /> {KIND_LABELS[kind]}</div>
            <div className="field"><label htmlFor="doc-date">Date</label><input id="doc-date" type="date" value={form.issueDate} onChange={set('issueDate')} /></div>
            <div className="field"><label htmlFor="doc-due">{kind === 'quote' ? 'Valable jusqu\'au' : 'Échéance de paiement'}</label><input id="doc-due" type="date" min={form.issueDate} value={form.dueDate} onChange={set('dueDate')} /></div>
            <div className="field">
              <label htmlFor="doc-status">Statut</label>
              <select id="doc-status" value={form.status} onChange={set('status')}>
                {statusOptions.map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
            </div>
          </section>

          <section className="form-card">
            <div className="form-card-title"><i className="ti ti-calculator" /> Montants</div>
            <div className="doc-adj">
              <div className="field"><label htmlFor="doc-discount">Remise (%)</label><input id="doc-discount" inputMode="decimal" value={form.discountPercent} onChange={set('discountPercent')} placeholder="0" /></div>
              <div className="field">
                <label htmlFor="doc-tax">TVA (%)</label>
                <input id="doc-tax" inputMode="decimal" value={form.taxRate} onChange={set('taxRate')} placeholder="0" />
              </div>
            </div>
            <div className="doc-tax-quick">
              {[['0', 'Sans TVA'], ['18', '18 %']].map(([v, l]) => (
                <button key={v} type="button" className={`doc-chip${String(form.taxRate || '0') === v ? ' is-on' : ''}`} onClick={() => setForm((f) => ({ ...f, taxRate: v === '0' ? '' : v }))}>{l}</button>
              ))}
            </div>
            <dl className="doc-totals">
              <div><dt>Sous-total</dt><dd>{fmt(totals.subtotal)}</dd></div>
              {totals.discountAmount > 0 && <div><dt>Remise</dt><dd>- {fmt(totals.discountAmount)}</dd></div>}
              {totals.taxAmount > 0 && <div><dt>Total HT</dt><dd>{fmt(totals.subtotal - totals.discountAmount)}</dd></div>}
              {totals.taxAmount > 0 && <div><dt>TVA</dt><dd>{fmt(totals.taxAmount)}</dd></div>}
              <div className="doc-total"><dt>{totals.taxAmount > 0 ? 'Total TTC' : 'Total'}</dt><dd>{fmt(totals.total)}</dd></div>
            </dl>
          </section>

          {err && <div className="settings-err" role="alert">{err}</div>}
          <div className="doc-save">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => save(false)} disabled={saving}>
              <i className="ti ti-device-floppy" /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" className="btn btn-dark btn-lg" onClick={() => save(true)} disabled={saving}>
              <i className="ti ti-download" /> Enregistrer et télécharger le PDF
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
