import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useBusinessData from '../../hooks/useBusinessData';
import * as api from '../../services/api';
import { CHALLENGE_TYPES, computeChallengeProgress, periodPreset, fmt, fmtN } from '../../utils/calc';
import ChallengeCard from '../../components/ChallengeCard';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../styles/notes-challenges.css';
import { useAmountsHidden } from '../../utils/amountPrivacy';
import PrivacyToggle from '../../components/PrivacyToggle';

const blank = () => ({ title: '', type: 'ca', target: '', productId: '', preset: 'month', ...periodPreset('month') });

// Titre proposé automatiquement si l'utilisateur n'en saisit pas
function autoTitle(form, products) {
  const t = Number(form.target) || 0;
  switch (form.type) {
    case 'ca': return `${fmt(t)} de chiffre d'affaires`;
    case 'profit': return `${fmt(t)} de bénéfice`;
    case 'sales_count': return `${fmtN(t)} ventes`;
    case 'product_units': return `${fmtN(t)} × ${products.find((p) => p.id === form.productId)?.name || 'produit'}`;
    case 'ad_budget': return `Pubs : pas plus de ${fmt(t)}`;
    default: return 'Mon challenge';
  }
}

const TABS = [
  { key: 'ongoing', label: 'En cours', match: (s) => s === 'ongoing' },
  { key: 'upcoming', label: 'À venir', match: (s) => s === 'upcoming' },
  { key: 'done', label: 'Terminés', match: (s) => s === 'success' || s === 'failed' },
];

export default function Challenges() {
  useAmountsHidden(); // se réaffiche quand le mode discret change
  const { account, products, sales, ads, ready } = useBusinessData();
  const [challenges, setChallenges] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('ongoing');
  const [toDelete, setToDelete] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!account) return;
    api.listChallenges(account.id).then((list) => { setChallenges(list); setLoaded(true); });
  }, [account]);

  // Progression et statut recalculés à chaque rendu, à partir des vraies données
  const items = useMemo(
    () => challenges.map((c) => ({ challenge: c, progress: computeChallengeProgress(c, sales, ads, products) })),
    [challenges, sales, ads, products]
  );

  const summary = useMemo(() => {
    const done = items.filter((i) => i.progress.status === 'success' || i.progress.status === 'failed');
    const won = done.filter((i) => i.progress.status === 'success').length;
    return {
      ongoing: items.filter((i) => i.progress.status === 'ongoing').length,
      won,
      done: done.length,
      rate: done.length ? Math.round((won / done.length) * 100) : null,
    };
  }, [items]);

  const tabItems = useMemo(() => {
    const t = TABS.find((x) => x.key === tab);
    return items
      .filter((i) => t.match(i.progress.status))
      .sort((a, b) => (tab === 'done'
        ? b.challenge.endDate.localeCompare(a.challenge.endDate)
        : a.challenge.endDate.localeCompare(b.challenge.endDate)));
  }, [items, tab]);
  const tabCount = (key) => items.filter((i) => TABS.find((x) => x.key === key).match(i.progress.status)).length;

  const focusForm = () => setTimeout(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formRef.current?.querySelector('input,select')?.focus();
  }, 0);
  const openNew = () => { setForm(blank()); setEditing(null); setErr(''); setOpen(true); focusForm(); };
  const openEdit = (c) => {
    setForm({ title: c.title, type: c.type, target: String(c.target), productId: c.productId || '', preset: 'custom', startDate: c.startDate, endDate: c.endDate });
    setEditing(c.id); setErr(''); setOpen(true); focusForm();
  };
  const close = () => { setOpen(false); setEditing(null); setErr(''); };

  const setPreset = (preset) => {
    if (preset === 'custom') setForm((f) => ({ ...f, preset }));
    else setForm((f) => ({ ...f, preset, ...periodPreset(preset) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const target = Number(form.target);
    if (!form.target || !Number.isFinite(target) || target <= 0) { setErr("L'objectif doit être supérieur à 0."); return; }
    if (form.type === 'product_units' && !form.productId) { setErr('Choisis le produit concerné.'); return; }
    if (!form.startDate || !form.endDate) { setErr('Choisis une date de début et une date de fin.'); return; }
    if (form.endDate <= form.startDate) { setErr('La date de fin doit être après la date de début.'); return; }
    setSaving(true);
    try {
      const list = await api.saveChallenge(account.id, {
        id: editing,
        title: form.title.trim() || autoTitle(form, products),
        type: form.type,
        target,
        productId: form.type === 'product_units' ? form.productId : null,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      setChallenges(list);
      close();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const id = toDelete.id;
    setToDelete(null);
    setChallenges(await api.deleteChallenge(account.id, id));
    if (editing === id) close();
  };
  const cancelDelete = useCallback(() => setToDelete(null), []);

  if (!ready || !loaded) return null;
  const unit = CHALLENGE_TYPES[form.type]?.unit;

  return (
    <div className="page-content">
      <div className="section-header">
        <div>
          <h2 className="section-title">Challenges</h2>
          <div className="section-sub">Fixe-toi un objectif : Margee+ suit ta progression automatiquement avec tes ventes et tes pubs.</div>
        </div>
        <PrivacyToggle />
        <button className="btn btn-primary" onClick={open ? close : openNew}>
          <i className={`ti ${open ? 'ti-x' : 'ti-plus'}`} /> {open ? 'Fermer' : 'Nouveau challenge'}
        </button>
      </div>

      {open && (
        <form className="form-card nc-form" onSubmit={submit} ref={formRef} noValidate>
          <div className="form-card-title">{editing ? 'Modifier le challenge' : 'Nouveau challenge'}</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ch-type">Type d'objectif *</label>
              <select id="ch-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(CHALLENGE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ch-target">
                {form.type === 'ad_budget' ? 'Budget maximum (F) *' : unit === 'money' ? 'Montant à atteindre (F) *' : form.type === 'product_units' ? 'Nombre de pièces *' : 'Nombre de ventes *'}
              </label>
              <input
                id="ch-target"
                type="number"
                inputMode="numeric"
                min="1"
                step={unit === 'count' ? 1 : 500}
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
                placeholder={unit === 'money' ? 'Ex : 100000' : 'Ex : 20'}
              />
            </div>
            {form.type === 'product_units' && (
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label htmlFor="ch-product">Produit *</label>
                <select id="ch-product" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">Choisir un produit</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label htmlFor="ch-title">Titre (facultatif)</label>
              <input
                id="ch-title"
                maxLength={120}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={form.target ? autoTitle(form, products) : 'Ex : CA 100 000 F ce mois'}
              />
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <span className="nc-label" id="ch-period-label">Période *</span>
              <div className="nc-chips" role="group" aria-labelledby="ch-period-label">
                {[['week', 'Cette semaine'], ['month', 'Ce mois'], ['custom', 'Personnalisé']].map(([k, l]) => (
                  <button key={k} type="button" className={`nc-chip${form.preset === k ? ' on' : ''}`} aria-pressed={form.preset === k} onClick={() => setPreset(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="ch-start">Du</label>
              <input id="ch-start" type="date" value={form.startDate} disabled={form.preset !== 'custom'} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ch-end">Au</label>
              <input id="ch-end" type="date" value={form.endDate} disabled={form.preset !== 'custom'} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <p className="nc-hint">
            <i className="ti ti-info-circle" aria-hidden="true" />
            {form.type === 'ad_budget'
              ? 'Réussi si tes pubs de la période restent sous ce budget.'
              : form.type === 'profit'
                ? 'Bénéfice calculé comme sur le tableau de bord : CA − coût de revient − pubs − livraisons à ta charge.'
                : 'La progression se met à jour toute seule à chaque vente enregistrée.'}
          </p>
          {err && <div className="nc-err" role="alert">{err}</div>}
          <div className="form-actions">
            <button type="submit" className="btn btn-dark btn-lg" disabled={saving}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le challenge'}
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={close}>Annuler</button>
          </div>
        </form>
      )}

      {challenges.length === 0 ? (
        <div className="card nc-empty">
          <i className="ti ti-target-arrow" aria-hidden="true" />
          <p>Fixe-toi un objectif pour ce mois et suis ta progression jour après jour.</p>
          <button className="btn btn-primary" onClick={openNew}><i className="ti ti-plus" /> Nouveau challenge</button>
        </div>
      ) : (
        <>
          <div className="nc-summary">
            <div className="nc-summary-item">
              <span className="nc-summary-icon" aria-hidden="true"><i className="ti ti-trophy" /></span>
              <div><strong>{summary.won}</strong><span>{summary.won > 1 ? 'challenges réussis' : 'challenge réussi'}</span></div>
            </div>
            <div className="nc-summary-item">
              <span className="nc-summary-icon" aria-hidden="true"><i className="ti ti-percentage" /></span>
              <div>
                <strong>{summary.rate === null ? '—' : `${summary.rate}%`}</strong>
                <span>{summary.rate === null ? 'de réussite (aucun terminé)' : `de réussite sur ${summary.done} terminé${summary.done > 1 ? 's' : ''}`}</span>
              </div>
            </div>
            <div className="nc-summary-item">
              <span className="nc-summary-icon" aria-hidden="true"><i className="ti ti-run" /></span>
              <div><strong>{summary.ongoing}</strong><span>en cours</span></div>
            </div>
          </div>

          <div className="nc-tabs" role="tablist" aria-label="Filtrer les challenges">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`ch-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="ch-panel"
                className={`nc-tab${tab === t.key ? ' on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label} <span>{tabCount(t.key)}</span>
              </button>
            ))}
          </div>

          <div id="ch-panel" role="tabpanel" aria-labelledby={`ch-tab-${tab}`}>
            {tabItems.length === 0 ? (
              <div className="card nc-empty nc-empty--small">
                <p>
                  {tab === 'ongoing' && 'Aucun challenge en cours.'}
                  {tab === 'upcoming' && 'Aucun challenge à venir.'}
                  {tab === 'done' && 'Aucun challenge terminé pour le moment.'}
                </p>
                {tab !== 'done' && <button className="btn btn-outline" onClick={openNew}><i className="ti ti-plus" /> Nouveau challenge</button>}
              </div>
            ) : (
              <div className="nc-ch-grid">
                {tabItems.map(({ challenge, progress }) => (
                  <ChallengeCard
                    key={challenge.id}
                    challenge={challenge}
                    progress={progress}
                    productName={products.find((p) => p.id === challenge.productId)?.name}
                    onEdit={openEdit}
                    onDelete={setToDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        icon="ti-trash"
        title="Supprimer ce challenge ?"
        message={toDelete ? `« ${toDelete.title} » sera supprimé définitivement.` : ''}
        confirmLabel="Supprimer"
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
