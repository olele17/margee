import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ActionDialog from './ActionDialog';
import { listManualPayments, validateManualPayment, rejectManualPayment } from '../adminApi';
import { fcfa, dateTimeFr, PLAN_LABELS } from '../format';

const METHOD = { wave: 'Wave', orange_money: 'Orange Money' };

/**
 * Paiements déclarés par les e-commerçants (Wave / Orange Money envoyés
 * directement) en attente de vérification. Le super admin vérifie sur
 * son téléphone que l'argent est arrivé, puis valide ou refuse.
 */
export default function ManualDeclarations({ canAct, onChange }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [action, setAction] = useState(null); // { type: 'validate' | 'reject', row }

  const load = useCallback(() => {
    listManualPayments('pending').then(setRows).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!rows) return err ? <div className="db-filter-err" role="alert">{err}</div> : null;
  if (rows.length === 0) return null;

  const r = action?.row;
  const label = (row) => `${PLAN_LABELS[row.plan_id] || row.plan_id} ${row.billing === 'yearly' ? 'annuel' : 'mensuel'}`;

  return (
    <section className="db-card adm-manual" aria-labelledby="adm-manual-title">
      <div className="db-card-head">
        <div>
          <h2 id="adm-manual-title" className="db-card-title"><i className="ti ti-hand-finger" aria-hidden="true" /> Paiements déclarés à vérifier ({rows.length})</h2>
          <div className="db-card-sub">Vérifie sur ton téléphone que l'argent est bien arrivé (montant, numéro, référence) avant de valider.</div>
        </div>
      </div>
      <ul className="adm-manual-list">
        {rows.map((row) => (
          <li key={row.id} className="adm-manual-item">
            <div className="adm-manual-main">
              <div className="db-strong">
                {row.account_id ? <Link to={`/admin/marchands/${row.account_id}`}>{row.business_name}</Link> : 'Compte supprimé'}
                <span className="adm-manual-amount">{fcfa(row.amount)}</span>
              </div>
              <div className="adm-sub">{label(row)} · déclaré le {dateTimeFr(row.created_at)}</div>
              <dl className="adm-manual-facts">
                <div><dt>Moyen</dt><dd>{METHOD[row.method] || row.method}</dd></div>
                <div><dt>Numéro qui a payé</dt><dd className="adm-mono">{row.payer_phone}</dd></div>
                <div><dt>Référence</dt><dd className="adm-mono">{row.transaction_ref}</dd></div>
              </dl>
            </div>
            {canAct && (
              <div className="adm-manual-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setAction({ type: 'validate', row })}>
                  <i className="ti ti-check" aria-hidden="true" /> Valider
                </button>
                <button type="button" className="btn btn-sm adm-btn-warn" onClick={() => setAction({ type: 'reject', row })}>
                  <i className="ti ti-x" aria-hidden="true" /> Refuser
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ActionDialog
        open={action?.type === 'validate'}
        icon="ti-check"
        title="Valider ce paiement ?"
        message={r ? `${r.business_name} · ${label(r)} · ${fcfa(r.amount)} par ${METHOD[r.method] || r.method} (réf. ${r.transaction_ref}). Valide seulement si l'argent est bien arrivé : l'abonnement sera activé ou prolongé tout de suite.` : ''}
        confirmLabel="Valider et activer"
        onCancel={() => setAction(null)}
        onSubmit={async (reason) => {
          await validateManualPayment(r.id, reason);
          setAction(null);
          load();
          onChange?.(`Paiement de ${r.business_name} validé : abonnement activé.`);
        }}
      />
      <ActionDialog
        open={action?.type === 'reject'}
        icon="ti-x"
        danger
        title="Refuser ce paiement ?"
        message={r ? `${r.business_name} · ${fcfa(r.amount)} (réf. ${r.transaction_ref}). L'e-commerçant verra que sa déclaration n'a pas été confirmée et pourra en refaire une.` : ''}
        confirmLabel="Refuser"
        onCancel={() => setAction(null)}
        onSubmit={async (reason) => {
          await rejectManualPayment(r.id, reason);
          setAction(null);
          load();
          onChange?.(`Déclaration de ${r.business_name} refusée.`);
        }}
      />
    </section>
  );
}
