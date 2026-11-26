import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { listMerchants, listAllMerchants } from '../adminApi';
import { useAdmin } from '../AdminRoute';
import { can } from '../permissions';
import { num, dateFr, PLAN_LABELS } from '../format';
import { SubscriptionBadge, SUBSCRIPTION_STATUSES } from '../components/StatusBadge';
import { downloadCsv } from '../csv';
import InviteMerchant from '../components/InviteMerchant';
import '../../styles/dashboard.css';

const PAGE_SIZE = 25;
const COLUMNS = [
  { key: 'business_name', label: 'Boutique', sortable: true },
  { key: 'email', label: 'Contact', sortable: true },
  { key: 'plan_id', label: 'Plan', sortable: true },
  { key: 'status', label: 'Statut', sortable: true },
  { key: 'ends_at', label: "Fin d'abonnement", sortable: true },
  { key: 'created_at', label: 'Inscrit le', sortable: true },
  { key: 'last_login_at', label: 'Dernière connexion', sortable: true },
];

function planLabel(r) {
  if (!r.plan_id) return 'Aucun';
  return `${PLAN_LABELS[r.plan_id]}${r.billing === 'yearly' ? ' (annuel)' : ''}`;
}

export default function Merchants() {
  const { role } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const deleted = location.state?.deleted;
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => ({
    search: params.get('q') || '',
    plan: params.get('plan') || '',
    status: params.get('statut') || '',
    flagged: params.get('signale') || '',
    sort: params.get('tri') || 'created_at',
    dir: params.get('ordre') || 'desc',
    page: Math.max(1, Number(params.get('page')) || 1),
  }), [params]);

  const [searchInput, setSearchInput] = useState(filters.search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // après une invitation

  const update = (patch, resetPage = true) => {
    const next = new URLSearchParams(params);
    const map = { search: 'q', plan: 'plan', status: 'statut', flagged: 'signale', sort: 'tri', dir: 'ordre', page: 'page' };
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v == null || (k === 'page' && v === 1)) next.delete(map[k]);
      else next.set(map[k], String(v));
    });
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Recherche : attend une courte pause dans la frappe
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
    listMerchants({ ...filters, pageSize: PAGE_SIZE })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filters, reloadKey]);

  const total = Number(data?.total || 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.rows || [];
  const hasFilters = filters.search || filters.plan || filters.status || filters.flagged;

  const sortBy = (key) => {
    if (filters.sort === key) update({ dir: filters.dir === 'asc' ? 'desc' : 'asc' });
    else update({ sort: key, dir: key === 'business_name' || key === 'email' ? 'asc' : 'desc' });
  };

  const exportCsv = async () => {
    setExporting(true);
    setErr('');
    try {
      const all = await listAllMerchants(filters);
      downloadCsv(`margee-e-commercants-${new Date().toISOString().slice(0, 10)}.csv`,
        ['Boutique', 'Propriétaire', 'Email', 'Téléphone', 'Plan', 'Statut', "Fin d'abonnement", 'Inscrit le', 'Dernière connexion', 'Signalements ouverts'],
        all.map((r) => [
          r.business_name, r.owner_name || '', r.email, r.phone || '', planLabel(r),
          SUBSCRIPTION_STATUSES[r.status]?.label || r.status, r.ends_at && r.plan_id !== 'free' ? dateFr(r.ends_at) : '',
          dateFr(r.created_at), r.last_login_at ? dateFr(r.last_login_at) : 'Jamais', r.open_flags,
        ]));
    } catch (e) {
      setErr(e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">E-commerçants</h1>
          <div className="adm-page-sub">
            {loading && !data ? 'Chargement…' : `${num(total)} compte${total > 1 ? 's' : ''}${hasFilters ? ' correspondant aux filtres' : ''}`}
          </div>
        </div>
        <div className="adm-head-actions">
          {can(role, 'merchants.export') && (
            <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={exporting || total === 0}>
              <i className={`ti ${exporting ? 'ti-loader-2 adm-spin' : 'ti-file-download'}`} aria-hidden="true" /> Exporter en CSV
            </button>
          )}
          {can(role, 'merchants.invite') && <InviteMerchant onDone={() => setReloadKey((k) => k + 1)} />}
        </div>
      </div>

      <div className="db-card adm-filters" role="search">
        <div className="field adm-filter-search">
          <label htmlFor="adm-q">Rechercher</label>
          <div className="adm-input-icon">
            <i className="ti ti-search" aria-hidden="true" />
            <input id="adm-q" type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Boutique, nom, email ou téléphone" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="adm-plan">Plan</label>
          <select id="adm-plan" value={filters.plan} onChange={(e) => update({ plan: e.target.value })}>
            <option value="">Tous</option>
            <option value="free">Free (essai)</option>
            <option value="pro">Pro</option>
            <option value="elite">Elite</option>
            <option value="none">Aucun plan</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="adm-status">Statut</label>
          <select id="adm-status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Tous</option>
            {Object.entries(SUBSCRIPTION_STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="adm-flag">Signalement</label>
          <select id="adm-flag" value={filters.flagged} onChange={(e) => update({ flagged: e.target.value })}>
            <option value="">Tous</option>
            <option value="yes">Signalés</option>
            <option value="no">Non signalés</option>
          </select>
        </div>
        {hasFilters && (
          <button type="button" className="btn btn-ghost adm-filter-reset" onClick={() => { setSearchInput(''); setParams({}, { replace: true }); }}>
            <i className="ti ti-x" aria-hidden="true" /> Effacer
          </button>
        )}
      </div>

      {deleted && <div className="adm-toast" role="status"><i className="ti ti-circle-check" aria-hidden="true" /> Compte « {deleted} » supprimé. Ses paiements sont gardés, anonymisés.</div>}
      {err && <div className="db-filter-err" role="alert">{err}</div>}

      <section className="db-card db-recent" aria-label="Liste des e-commerçants" aria-busy={loading}>
        <div className="db-table-scroll">
          <table className="db-table adm-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const active = filters.sort === c.key;
                  return (
                    <th key={c.key} aria-sort={active ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className={`adm-sort${active ? ' is-active' : ''}`} onClick={() => sortBy(c.key)}>
                        {c.label}
                        <i className={`ti ${active ? (filters.dir === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : 'ti-arrows-sort'}`} aria-hidden="true" />
                      </button>
                    </th>
                  );
                })}
                <th><span className="sr-only">Fiche</span></th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1}><div className="db-empty"><i className="ti ti-building-store" aria-hidden="true" />{hasFilters ? 'Aucun e-commerçant ne correspond à ces filtres.' : 'Aucun e-commerçant inscrit pour l\'instant.'}</div></td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="adm-row" onClick={() => navigate(`/admin/marchands/${r.id}`)}>
                  <td>
                    <div className="db-strong">{r.business_name}{Number(r.open_flags) > 0 && <i className="ti ti-flag adm-flag-icon" title="Signalé" aria-label="Signalé" />}</div>
                    {r.owner_name && <div className="adm-sub">{r.owner_name}</div>}
                  </td>
                  <td>
                    <div>{r.email}</div>
                    {r.phone && <div className="adm-sub">{r.phone}</div>}
                  </td>
                  <td className="db-nowrap">{planLabel(r)}</td>
                  <td><SubscriptionBadge status={r.status} /></td>
                  <td className="db-nowrap">{r.ends_at && r.plan_id !== 'free' ? dateFr(r.ends_at) : '—'}</td>
                  <td className="db-nowrap">{dateFr(r.created_at)}</td>
                  <td className="db-nowrap">{r.last_login_at ? dateFr(r.last_login_at) : 'Jamais'}</td>
                  <td>
                    <Link className="btn btn-ghost btn-sm" to={`/admin/marchands/${r.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Ouvrir la fiche de ${r.business_name}`}>
                      <i className="ti ti-chevron-right" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
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
