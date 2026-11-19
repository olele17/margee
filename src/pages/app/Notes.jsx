import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { NOTE_CATEGORIES } from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../styles/notes-challenges.css';

const blank = { title: '', content: '', category: 'idee', productId: '' };

const dateFr = (iso) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Notes() {
  const { account, products, ready } = useBusinessData();
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!account) return;
    api.listNotes(account.id).then((list) => { setNotes(list); setLoaded(true); });
  }, [account]);

  const openNew = () => {
    setForm(blank); setEditing(null); setErr(''); setOpen(true);
    setTimeout(() => formRef.current?.querySelector('input')?.focus(), 0);
  };
  const openEdit = (n) => {
    setForm({ title: n.title, content: n.content, category: n.category, productId: n.productId || '' });
    setEditing(n.id); setErr(''); setOpen(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      formRef.current?.querySelector('input')?.focus();
    }, 0);
  };
  const close = () => { setOpen(false); setEditing(null); setForm(blank); setErr(''); };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.title.trim()) { setErr('Donne un titre à ta note.'); return; }
    setSaving(true);
    try {
      const list = await api.saveNote(account.id, { ...form, id: editing, productId: form.productId || null });
      setNotes(list);
      close();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (id) => setNotes(await api.togglePinNote(account.id, id));
  const confirmDelete = async () => {
    const id = toDelete.id;
    setToDelete(null);
    setNotes(await api.deleteNote(account.id, id));
    if (editing === id) close();
  };
  const cancelDelete = useCallback(() => setToDelete(null), []);

  const productName = (id) => products.find((p) => p.id === id)?.name;

  // Épinglées d'abord, puis les plus récemment modifiées
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...notes]
      .filter((n) => !cat || n.category === cat)
      .filter((n) => !needle || n.title.toLowerCase().includes(needle) || n.content.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, q, cat]);

  const counts = useMemo(() => {
    const c = {};
    notes.forEach((n) => { c[n.category] = (c[n.category] || 0) + 1; });
    return c;
  }, [notes]);

  if (!ready || !loaded) return null;

  return (
    <div className="page-content">
      <div className="section-header">
        <div>
          <h2 className="section-title">Notes</h2>
          <div className="section-sub">Ton carnet privé : idées, fournisseurs, clients et choses à faire.</div>
        </div>
        <button className="btn btn-primary" onClick={open ? close : openNew}>
          <i className={`ti ${open ? 'ti-x' : 'ti-plus'}`} /> {open ? 'Fermer' : 'Nouvelle note'}
        </button>
      </div>

      {open && (
        <form className="form-card nc-form" onSubmit={submit} ref={formRef} noValidate>
          <div className="form-card-title">{editing ? 'Modifier la note' : 'Nouvelle note'}</div>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label htmlFor="note-title">Titre *</label>
              <input id="note-title" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex : Fournisseur parfums Sandaga" />
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label htmlFor="note-content">Contenu</label>
              <textarea
                id="note-content"
                rows={5}
                maxLength={5000}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Contacts, prix, idées, prochaines étapes…"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div className="field">
              <label htmlFor="note-category">Catégorie</label>
              <select id="note-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(NOTE_CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="note-product">Produit lié (facultatif)</label>
              <select id="note-product" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                <option value="">Aucun produit</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          {err && <div className="nc-err" role="alert">{err}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-dark btn-lg" disabled={saving}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter la note'}
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={close}>Annuler</button>
          </div>
        </form>
      )}

      {notes.length > 0 && (
        <div className="nc-toolbar">
          <label className="nc-search">
            <i className="ti ti-search" aria-hidden="true" />
            <span className="sr-only">Rechercher dans les notes</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans le titre ou le contenu…" />
          </label>
          <div className="nc-chips" role="group" aria-label="Filtrer par catégorie">
            <button type="button" className={`nc-chip${cat === '' ? ' on' : ''}`} aria-pressed={cat === ''} onClick={() => setCat('')}>
              Toutes <span>{notes.length}</span>
            </button>
            {Object.entries(NOTE_CATEGORIES).map(([k, c]) => (
              <button key={k} type="button" className={`nc-chip${cat === k ? ' on' : ''}`} aria-pressed={cat === k} onClick={() => setCat(cat === k ? '' : k)}>
                {c.label} <span>{counts[k] || 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="card nc-empty">
          <i className="ti ti-notebook" aria-hidden="true" />
          <p>Aucune note pour l'instant. Note ici tes idées, tes fournisseurs ou tes tâches.</p>
          <button className="btn btn-primary" onClick={openNew}><i className="ti ti-plus" /> Nouvelle note</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="card nc-empty">
          <i className="ti ti-search-off" aria-hidden="true" />
          <p>Aucune note ne correspond à ta recherche.</p>
          <button className="btn btn-outline" onClick={() => { setQ(''); setCat(''); }}>Effacer les filtres</button>
        </div>
      ) : (
        <ul className="nc-notes">
          {visible.map((n) => {
            const c = NOTE_CATEGORIES[n.category] || NOTE_CATEGORIES.autre;
            const prod = n.productId && productName(n.productId);
            return (
              <li key={n.id} className={`nc-note${n.pinned ? ' nc-note--pinned' : ''}`}>
                <div className="nc-note-top">
                  <span className={`nc-badge nc-badge--${n.category}`}><i className={`ti ${c.icon}`} aria-hidden="true" />{c.label}</span>
                  <button
                    type="button"
                    className={`nc-pin${n.pinned ? ' on' : ''}`}
                    onClick={() => togglePin(n.id)}
                    aria-pressed={n.pinned}
                    aria-label={n.pinned ? `Désépingler « ${n.title} »` : `Épingler « ${n.title} »`}
                    title={n.pinned ? 'Désépingler' : 'Épingler en haut'}
                  >
                    <i className={`ti ${n.pinned ? 'ti-pinned' : 'ti-pin'}`} aria-hidden="true" />
                  </button>
                </div>
                <h3 className="nc-note-title">{n.title}</h3>
                {n.content && <p className="nc-note-content">{n.content}</p>}
                {prod && <span className="nc-note-product"><i className="ti ti-package" aria-hidden="true" />{prod}</span>}
                <div className="nc-note-foot">
                  <span>Modifiée le {dateFr(n.updatedAt)}</span>
                  <div className="nc-note-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(n)} aria-label={`Modifier « ${n.title} »`}>
                      <i className="ti ti-pencil" />
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setToDelete(n)} aria-label={`Supprimer « ${n.title} »`}>
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        icon="ti-trash"
        title="Supprimer cette note ?"
        message={toDelete ? `« ${toDelete.title} » sera supprimée définitivement.` : ''}
        confirmLabel="Supprimer"
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
