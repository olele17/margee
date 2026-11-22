import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listPayments, listAllPayments, activatePayment } from '../adminApi';
import { useAdmin } from '../AdminRoute';
import { can } from '../permissions';
import { num, fcfa, dateFr, dateTimeFr, PLAN_LABELS, methodLabel } from '../format';
import { PaymentBadge, PAYMENT_STATUSES } from '../components/StatusBadge';
import ActionDialog from '../components/ActionDialog';
import { downloadCsv } from '../csv';
import '../../styles/dashboard.css';

const PAGE_SIZE = 25;

// Dates du jour à l'heure de Dakar (UTC), au format AAAA-MM-JJ
const isoDay = (d) => d.toISOString().slice(0, 10);
function monthStart() {
  const d = new Date();
  return `${d.toISOString().slice(0, 7)}-01`;
}

function planLabel(r) {
  return `${PLAN_LABELS[r.plan_id] || r.plan_id}${r.billing === 'yearly' ? ' (annuel)' : ''}`;
}

function Stat({ icon, label, value, tone }) {
  return (
    <div className={`adm-stat${tone ? ` adm-stat--${tone}` : ''}`}>
      <span className="adm-stat-icon" aria-hidden="true"><i className={`ti ${icon}`} /></span>
      <div className="adm-stat-text">
        <div className="adm-stat-value">{value}</div>
        <div className="adm-stat-label">{label}</div>
      </div>
    </div>
  );
}

export default function Payments() {
  const { role } = useAdmin();
  const canActivate = can(role, 'payments.activate');
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => ({
    from: params.get('du') || '',
    to: params.get('au') || '',
    status: params.get('statut') || '',
    search: params.get('q') || '',
    page: Math.max(1, Number(params.get('page')) || 1),
  }), [params]);

  const [searchInput, setSearchInput] = useState(filters.search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);
  const [toast, setToast] = useState('');
  const [target, setTarget] = useState(null); // paiement à activer
  const [bictorysRef, setBictorysRef] = useState('');

  const update = (patch, resetPage = true) => {
    const next = new URLSearchParams(params);
    const map = { from: 'du', to: 'au', status: 'statut', search: 'q', page: 'page' };
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
    listPayments({ ...filters, pageSize: PAGE_SIZE })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filters, reload]);

  const total = Number(data?.total || 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.rows || [];
  const sum = data?.summary || {};
  const hasFilters = filters.from || filters.to || filters.status || filters.search;
  const periodLabel = filters.from || filters.to
    ? `${filters.from ? `du ${dateFr(filters.from)}` : 'depuis le début'} ${filters.to ? `au ${dateFr(filters.to)}` : "jusqu'à aujourd'hui"}`
    : 'depuis le début';

  const exportCsv = async () => {
    setExporting(true);
    setErr('');
    try {
      const all = await listAllPayments(filters);
      downloadCsv(`margee-paiements-${isoDay(new Date())}.csv`,
        ['Date', 'Payé le', 'Boutique', 'Email', 'Plan', 'Montant (F CFA)', 'Référence Margee+', 'Référence Bictorys', 'Moyen', 'Statut', 'Activé par'],
        all.map((r) => [
          dateTimeFr(r.created_at), r.paid_at ? dateTimeFr(r.paid_at) : '', r.business_name || 'Compte supprimé', r.email || '',
          planLabel(r), r.amount, r.provider_ref, r.provider_charge_id || '', methodLabel(r.payment_method),
          PAYMENT_STATUSES[r.status]?.label || r.status,
          r.activated_by === 'admin' ? 'Équipe (manuel)' : r.activated_by === 'webhook' ? 'Bictorys' : '',
        ]));
    } catch (e) {
      setErr(e.message);
    } finally {
      setExporting(false);
    }
  };

  const openActivate = (r) => {
    setBictorysRef(r.provider_charge_id || '');
    setTarget(r);
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">Paiements et abonnements</h1>
          <div className="adm-page-sub">
            {loading && !data ? 'Chargement…' : `${num(total)} paiement${total > 1 ? 's' : ''}${hasFilters ? ' correspondant aux filtres' : ''}`}
          </div>
        </div>
        <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={exporting || total === 0}>
          <i className={`ti ${exporting ? 'ti-loader-2 adm-spin' : 'ti-file-download'}`} aria-hidden="true" /> Exporter en CSV
        </button>
      </div>

      <div className="db-card adm-filters" role="search">
        <div className="field adm-filter-search">
          <label htmlFor="adm-q">Rechercher</label>
          <div className="adm-input-icon">
            <i className="ti ti-search" aria-hidden="true" />
            <input id="adm-q" type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Boutique, email ou référence" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="adm-from">Du</label>
          <input id="adm-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="adm-to">Au</label>
          <input id="adm-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="adm-status">Statut</label>
          <select id="adm-status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Tous</option>
            {Object.entries(PAYMENT_STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-ghost adm-filter-reset" onClick={() => update({ from: monthStart(), to: isoDay(new Date()) })}>
          <i className="ti ti-calendar-month" aria-hidden="true" /> Ce mois-ci
        </button>
        {hasFilters && (
          <button type="button" className="btn btn-ghost adm-filter-reset" onClick={() => { setSearchInput(''); setParams({}, { replace: true }); }}>
            <i className="ti ti-x" aria-hidden="true" /> Effacer
          </button>
        )}
      </div>

      <section className="adm-stats adm-stats--4" aria-label="Résumé de la période">
        <Stat icon="ti-cash" tone="success" value={fcfa(sum.collected)} label={`Encaissé ${periodLabel}`} />
        <Stat icon="ti-circle-check" value={num(sum.success_count)} label="Réussis" />
        <Stat icon="ti-hourglass" value={num(sum.pending_count)} label="En attente" />
        <Stat icon="ti-alert-triangle" tone={Number(sum.failed_count) > 0 ? 'danger' : undefined} value={num(sum.failed_count)} label="Échoués" />
      </section>

      {toast && <div className="adm-toast" role="status"><i className="ti ti-circle-check" aria-hidden="true" /> {toast}</div>}
      {err && <div className="db-filter-err" role="alert">{err}</div>}

      <section className="db-card db-recent" aria-label="Liste des paiements" aria-busy={loading}>
        <div className="db-table-scroll">
          <table className="db-table adm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Boutique</th>
                <th>Plan</th>
                <th className="db-num">Montant</th>
                <th>Référence</th>
                <th>Moyen</th>
                <th>Statut</th>
                {canActivate && <th><span className="sr-only">Action</span></th>}
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={canActivate ? 8 : 7}><div className="db-empty"><i className="ti ti-credit-card" aria-hidden="true" />{hasFilters ? 'Aucun paiement ne correspond à ces filtres.' : 'Aucun paiement pour l\'instant.'}</div></td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="db-nowrap">
                    <div>{dateTimeFr(r.created_at)}</div>
                    {r.paid_at && <div className="adm-sub">Payé le {dateTimeFr(r.paid_at)}</div>}
                  </td>
                  <td>
                    {r.account_id
                      ? <Link className="db-strong" to={`/admin/marchands/${r.account_id}`}>{r.business_name}</Link>
                      : <span className="adm-sub">Compte supprimé</span>}
                    {r.email && <div className="adm-sub">{r.email}</div>}
                  </td>
                  <td className="db-nowrap">{planLabel(r)}</td>
                  <td className="db-num db-nowrap db-strong">{fcfa(r.amount)}</td>
                  <td>
                    <div className="adm-mono">{r.provider_ref}</div>
                    {r.provider_charge_id && <div className="adm-sub adm-mono" title="Référence Bictorys">{r.provider_charge_id}</div>}
                  </td>
                  <td className="db-nowrap">{methodLabel(r.payment_method)}</td>
                  <td>
                    <PaymentBadge status={r.status} />
                    {r.activated_by === 'admin' && <div className="adm-sub">Activé manuellement</div>}
                  </td>
                  {canActivate && (
                    <td>
                      {r.status !== 'success' && r.account_id && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => openActivate(r)}>
                          <i className="ti ti-bolt" aria-hidden="true" /> Activer
                        </button>
                      )}
                    </td>
                  )}
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

      <ActionDialog
        open={!!target}
        icon="ti-bolt"
        title="Activer manuellement ce paiement ?"
        message={target
          ? `${target.business_name} · ${planLabel(target)} · ${fcfa(target.amount)}. À utiliser seulement si le paiement apparaît bien comme réussi dans le tableau de bord Bictorys et que la notification n'est pas arrivée. L'abonnement sera activé ou prolongé.`
          : ''}
        confirmLabel="Activer le paiement"
        canSubmit={bictorysRef.trim().length >= 3}
        onCancel={() => setTarget(null)}
        onSubmit={async (reason) => {
          await activatePayment(target.id, bictorysRef.trim(), reason);
          setToast(`Paiement de ${target.business_name} activé.`);
          setTarget(null);
          setReload((n) => n + 1);
        }}
      >
        <div className="field">
          <label htmlFor="adm-bictorys-ref">Référence de la transaction Bictorys</label>
          <input id="adm-bictorys-ref" data-autofocus value={bictorysRef} onChange={(e) => setBictorysRef(e.target.value)} maxLength={120} autoComplete="off" placeholder="Identifiant vu dans le tableau de bord Bictorys" />
        </div>
      </ActionDialog>
    </div>
  );
}
