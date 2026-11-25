import { useCallback, useEffect, useState } from 'react';
import ActionDialog from './ActionDialog';
import { listPartners, setPartnerDisabled } from '../adminApi';
import { dateFr, dateTimeFr, fcfa, num } from '../format';

/**
 * Comptes ayant le tableau partenaire (e-commerçants ou partenaires
 * invités). Le super admin peut retirer ou rendre l'accès.
 */
export default function PartnersList({ canEdit, onToast, reloadKey }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [target, setTarget] = useState(null);

  const load = useCallback(() => { listPartners().then(setRows).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load, reloadKey]);

  if (!rows) return err ? <div className="db-filter-err" role="alert">{err}</div> : null;

  return (
    <section className="db-card adm-set" aria-labelledby="partners-title">
      <div className="db-card-head">
        <div>
          <h2 id="partners-title" className="db-card-title"><i className="ti ti-chart-histogram" aria-hidden="true" /> Partenaires ({rows.length})</h2>
          <div className="db-card-sub">Accès en lecture seule au tableau partenaire (chiffres, sans données personnelles). Chaque partenaire ne voit que les comptes créés via son lien de parrainage. Un e-commerçant partenaire garde sa boutique. Invite un partenaire avec le rôle « Partenaire » ci-dessus.</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="adm-sub">Aucun partenaire pour l'instant.</p>
      ) : (
        <div className="db-table-scroll">
          <table className="db-table">
            <thead><tr><th>Compte</th><th>Code</th><th>Filleuls</th><th>Accès depuis</th><th>Dernière connexion</th>{canEdit && <th><span className="sr-only">Action</span></th>}</tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.user_id} className={p.disabled_at ? 'adm-row-off' : ''}>
                  <td>
                    <div className="db-strong">{p.business_name || p.email}</div>
                    <div className="adm-sub">{p.email}{p.disabled_at ? ' · accès retiré' : ''}</div>
                  </td>
                  <td className="db-nowrap"><code>{p.code}</code></td>
                  <td className="db-nowrap">
                    <div className="db-strong">{num(p.referrals)} inscrit{Number(p.referrals) > 1 ? 's' : ''}</div>
                    <div className="adm-sub">{num(p.referrals_paid)} abonné{Number(p.referrals_paid) > 1 ? 's' : ''} · {fcfa(p.referrals_revenue)}</div>
                  </td>
                  <td className="db-nowrap">{dateFr(p.created_at)}</td>
                  <td className="db-nowrap">{p.last_sign_in_at ? dateTimeFr(p.last_sign_in_at) : 'Invitation en attente'}</td>
                  {canEdit && (
                    <td>
                      <button type="button" className={`btn btn-sm ${p.disabled_at ? 'btn-outline' : 'adm-btn-warn'}`} onClick={() => setTarget(p)}>
                        <i className={`ti ${p.disabled_at ? 'ti-player-play' : 'ti-ban'}`} aria-hidden="true" /> {p.disabled_at ? 'Rendre l\'accès' : 'Retirer l\'accès'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ActionDialog
        open={!!target}
        icon={target?.disabled_at ? 'ti-player-play' : 'ti-ban'}
        danger={!target?.disabled_at}
        title={target?.disabled_at ? 'Rendre l\'accès partenaire ?' : 'Retirer l\'accès partenaire ?'}
        message={target ? `${target.email} ${target.disabled_at ? 'retrouvera' : 'ne verra plus'} le tableau partenaire. Son compte et sa boutique ne changent pas.` : ''}
        confirmLabel={target?.disabled_at ? 'Rendre l\'accès' : 'Retirer l\'accès'}
        onCancel={() => setTarget(null)}
        onSubmit={async (reason) => {
          await setPartnerDisabled(target.user_id, !target.disabled_at, reason);
          onToast?.(target.disabled_at ? `Accès partenaire rendu à ${target.email}.` : `Accès partenaire retiré à ${target.email}.`);
          setTarget(null);
          load();
        }}
      />
    </section>
  );
}
