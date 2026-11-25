import { useCallback, useEffect, useState } from 'react';
import { getPartnerStats } from '../adminApi';
import { fcfa, num, dateTimeFr } from '../format';
import { StatCard, SignupsChart, PlanSplit } from './Overview';
import '../../styles/dashboard.css';

/**
 * Tableau partenaire (lecture seule) : totaux des inscrits, des
 * abonnements et des revenus. Aucun nom, aucun e-mail, aucune donnée de
 * vente : la fonction partner_stats() ne renvoie que des chiffres.
 */
export default function Partner() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try { setData(await getPartnerStats()); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const su = data?.signups || {};
  const c = data?.counts || {};
  const rev = data?.revenue || {};
  const change = rev.change_percent;
  const active = Number(c.active || 0);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">Tableau partenaire</h1>
          <div className="adm-page-sub">
            {data ? `Mis à jour le ${dateTimeFr(data.generated_at)} (heure de Dakar) · chiffres globaux, sans données personnelles` : 'Chargement…'}
          </div>
        </div>
        <button type="button" className="btn btn-outline" onClick={load} disabled={loading}>
          <i className={`ti ti-refresh${loading ? ' adm-spin' : ''}`} aria-hidden="true" /> Actualiser
        </button>
      </div>

      {err && <div className="db-filter-err" role="alert">{err}</div>}

      {data && (
        <>
          <div className="adm-stats">
            <StatCard icon="ti-users" label="Inscrits au total" value={num(su.total)} hint={`+${num(su.this_month)} ce mois-ci · ${num(su.last_month)} le mois dernier`} />
            <StatCard icon="ti-hourglass" label="Essais en cours" value={num(c.trial)} />
            <StatCard icon="ti-circle-check" label="Abonnés actifs" value={num(active)} tone="success" hint={`Pro ${num(data.by_plan?.pro)} · Elite ${num(data.by_plan?.elite)}`} />
            <StatCard icon="ti-clock-x" label="Expirés" value={num(c.expired)} />
          </div>

          <div className="adm-stats adm-stats--money">
            <StatCard icon="ti-repeat" label="Revenu mensuel récurrent" value={fcfa(data.mrr)} hint="Abonnements payants actifs, annuel ramené au mois" />
            <StatCard
              icon="ti-cash-banknote"
              label="Revenus du mois"
              value={fcfa(rev.this_month)}
              tone={change == null ? null : change >= 0 ? 'success' : 'danger'}
              hint={`Mois précédent : ${fcfa(rev.last_month)}${change == null ? '' : ` · ${change >= 0 ? '+' : ''}${String(change).replace('.', ',')} %`}`}
            />
            <StatCard icon="ti-building-bank" label="Revenus encaissés au total" value={fcfa(rev.total)} hint={`${num(rev.payments_count)} paiement${Number(rev.payments_count) > 1 ? 's' : ''} réussi${Number(rev.payments_count) > 1 ? 's' : ''}`} />
            <StatCard
              icon="ti-arrow-big-up-lines"
              label="Conversion essai → payant"
              value={`${String(data.conversion?.rate_percent ?? 0).replace('.', ',')} %`}
              hint={`${num(data.conversion?.converted)} sur ${num(data.conversion?.trials)} comptes ayant fait l'essai`}
            />
          </div>

          <div className="adm-grid-2">
            <SignupsChart days={data.signups_30_days || []} />
            <PlanSplit byPlan={data.by_plan} />
          </div>

          <p className="adm-note adm-partner-note">
            <i className="ti ti-shield-lock" aria-hidden="true" /> Ces chiffres excluent les comptes de l'équipe Margee+.
            Aucune donnée personnelle (nom, e-mail, téléphone, ventes) n'est accessible depuis ce tableau.
          </p>
        </>
      )}
    </div>
  );
}
