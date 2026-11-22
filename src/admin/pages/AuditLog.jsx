import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listAudit } from '../adminApi';
import { num, dateTimeFr, fcfa, actionLabel, PLAN_LABELS } from '../format';
import { SUBSCRIPTION_STATUSES } from '../components/StatusBadge';
import { ROLES } from '../permissions';
import '../../styles/dashboard.css';

const PAGE_SIZE = 50;

/* ── Détail d'une ligne : champs modifiés (avant → après) ──────── */
const FIELD_LABELS = {
  status: 'Statut', plan_id: 'Plan', billing: 'Période', expires_at: "Fin d'abonnement", trial_ends_at: "Fin d'essai",
  name: 'Nom', price: 'Prix', old_price: 'Prix barré', duration_days: 'Durée (jours)', features: 'Avantages',
  sort_order: 'Ordre', highlight: 'Mis en avant', is_active: 'Proposé', receipt_limit: 'Reçus',
  role: 'Rôle', disabled_at: 'Désactivé le', value: 'Valeur', key: 'Paramètre',
  content: 'Note', reason: 'Signalement', resolved_at: 'Traité le',
  email: 'Email', mode: 'Envoi', bictorys_ref: 'Référence Bictorys', amount: 'Montant',
  business_name: 'Boutique', deleted: 'Supprimé', payments_kept_anonymized: 'Paiements gardés (anonymisés)',
  email_sent_to: 'Email envoyé à', payment_id: 'Paiement', reference: 'Référence',
};
const HIDDEN = new Set(['updated_at', 'created_at', 'id', 'account_id', 'user_id', 'author_id', 'created_by', 'resolved_by', 'invited_by']);
const SETTING_LABELS = { signup_open: 'Inscriptions ouvertes', signup_closed_message: 'Message de fermeture', trial_days: "Durée de l'essai (jours)" };

function show(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (key === 'plan_id') return PLAN_LABELS[v] || v;
  if (key === 'status') return SUBSCRIPTION_STATUSES[v]?.label || v;
  if (key === 'role') return ROLES[v]?.label || v;
  if (key === 'billing') return v === 'yearly' ? 'annuel' : v === 'monthly' ? 'mensuel' : v;
  if (key === 'price' || key === 'old_price' || key === 'amount') return fcfa(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return dateTimeFr(v);
  if (Array.isArray(v)) return v.join(' · ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function changesOf(row) {
  const before = row.before || {};
  const after = row.after || {};
  // Paramètres de la plateforme : une ligne { key, value }
  if ((after.key || before.key) && 'value' in (after.key ? after : before)) {
    const key = after.key || before.key;
    return [{ label: SETTING_LABELS[key] || key, from: show(key, before.value), to: show(key, after.value) }];
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !HIDDEN.has(k));
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ label: FIELD_LABELS[k] || k, from: row.before ? show(k, before[k]) : null, to: row.after ? show(k, after[k]) : null }));
}

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => ({
    admin: params.get('admin') || '',
    action: params.get('action') || '',
    account: params.get('compte') || '',
    from: params.get('du') || '',
    to: params.get('au') || '',
    search: params.get('q') || '',
    page: Math.max(1, Number(params.get('page')) || 1),
  }), [params]);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(() => new Set());

  const update = (patch, resetPage = true) => {
    const next = new URLSearchParams(params);
    const map = { admin: 'admin', action: 'action', account: 'compte', from: 'du', to: 'au', search: 'q', page: 'page' };
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v == null || (k === 'page' && v === 1)) next.delete(map[k]);
      else next.set(map[k], String(v));
    });
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (searchInput === filters.search) return undefined;
    const t = setTimeout(() => update({ search: searchInput.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    listAudit({ ...filters, pageSize: PAGE_SIZE })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filters]);

  const total = Number(data?.total || 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.rows || [];
  const hasFilters = filters.admin || filters.action || filters.account || filters.from || filters.to || filters.search;
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">Journal d'activité</h1>
          <div className="adm-page-sub">
            {loading && !data ? 'Chargement…' : `${num(total)} action${total > 1 ? 's' : ''}${hasFilters ? ' correspondant aux filtres' : ''}`} · lecture seule, rien ne peut y être modifié ni effacé.
          </div>
        </div>
      </div>

      <div className="db-card adm-filters" role="search">
        <div className="field adm-filter-search">
          <label htmlFor="adm-q">Rechercher</label>
          <div className="adm-input-icon">
            <i className="ti ti-search" aria-hidden="true" />
            <input id="adm-q" type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Boutique, email ou motif" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="adm-admin">Admin</label>
          <select id="adm-admin" value={filters.admin} onChange={(e) => update({ admin: e.target.value })}>
            <option value="">Tous</option>
            {(data?.admins || []).map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="adm-action">Action</label>
          <select id="adm-action" value={filters.action} onChange={(e) => update({ action: e.target.value })}>
            <option value="">Toutes</option>
            {(data?.actions || []).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="adm-from">Du</label>
          <input id="adm-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="adm-to">Au</label>
          <input id="adm-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </div>
        {hasFilters && (
          <button type="button" className="btn btn-ghost adm-filter-reset" onClick={() => { setSearchInput(''); setParams({}, { replace: true }); }}>
            <i className="ti ti-x" aria-hidden="true" /> Effacer
          </button>
        )}
      </div>

      {filters.account && (
        <div className="adm-chip-row">
          <span className="adm-chip">
            <i className="ti ti-building-store" aria-hidden="true" />
            Compte : {data?.account_name || 'compte supprimé'}
            <button type="button" onClick={() => update({ account: '' })} aria-label="Retirer le filtre compte"><i className="ti ti-x" aria-hidden="true" /></button>
          </span>
        </div>
      )}

      {err && <div className="db-filter-err" role="alert">{err}</div>}

      <section className="db-card db-recent" aria-label="Actions de l'équipe" aria-busy={loading}>
        <div className="db-table-scroll">
          <table className="db-table adm-table">
            <thead>
              <tr><th>Date</th><th>Admin</th><th>Action</th><th>Compte</th><th>Motif</th><th><span className="sr-only">Détails</span></th></tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6}><div className="db-empty"><i className="ti ti-history" aria-hidden="true" />{hasFilters ? 'Aucune action ne correspond à ces filtres.' : 'Aucune action pour l\'instant.'}</div></td></tr>
              )}
              {rows.map((r) => {
                const changes = changesOf(r);
                const isOpen = open.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="db-nowrap">{dateTimeFr(r.created_at)}</td>
                      <td>
                        {r.admin_id
                          ? <button type="button" className="adm-link" onClick={() => update({ admin: r.admin_id })} title="Filtrer sur cet admin">{r.admin_email || '—'}</button>
                          : <span className="adm-sub">{r.admin_email || 'Système'}</span>}
                      </td>
                      <td>
                        <button type="button" className="adm-link db-strong" onClick={() => update({ action: r.action })} title="Filtrer sur cette action">{actionLabel(r.action)}</button>
                      </td>
                      <td>
                        {r.account_id
                          ? (r.account_name
                            ? <><Link to={`/admin/marchands/${r.account_id}`}>{r.account_name}</Link>{' '}<button type="button" className="adm-link adm-sub" onClick={() => update({ account: r.account_id })}>filtrer</button></>
                            : <span className="adm-sub">{r.before?.business_name || r.after?.email || 'Compte supprimé'}</span>)
                          : <span className="adm-sub">—</span>}
                      </td>
                      <td className="adm-reason-cell">{r.reason || <span className="adm-sub">—</span>}</td>
                      <td>
                        {changes.length > 0 && (
                          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={isOpen} onClick={() => toggle(r.id)}>
                            <i className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} aria-hidden="true" /> {isOpen ? 'Masquer' : 'Détails'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="adm-detail-row">
                        <td colSpan={6}>
                          <ul className="adm-changes">
                            {changes.map((c) => (
                              <li key={c.label}>
                                <b>{c.label} :</b>{' '}
                                {c.from !== null && <><span className="adm-from">{c.from}</span> → </>}
                                <span className="adm-to">{c.to ?? '—'}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <nav className="adm-pager" aria-label="Pagination">
            <span className="adm-pager-info">
              {num((filters.page - 1) * PAGE_SIZE + 1)}–{num(Math.min(filters.page * PAGE_SIZE, total))} sur {num(total)}
            </span>
            <button type="button" className="btn btn-outline btn-sm" disabled={filters.page <= 1 || loading} onClick={() => update({ page: filters.page - 1 }, false)}>
              <i className="ti ti-chevron-left" aria-hidden="true" /> Précédent
            </button>
            <span className="adm-pager-page">Page {filters.page} / {pages}</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={filters.page >= pages || loading} onClick={() => update({ page: filters.page + 1 }, false)}>
              Suivant <i className="ti ti-chevron-right" aria-hidden="true" />
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
