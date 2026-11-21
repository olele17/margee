import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getMerchantDetail, setSuspended, changePlan, extendAccount,
  addAdminNote, addFlag, resolveFlag, sendPasswordReset, deleteMerchant,
} from '../adminApi';
import { useAdmin } from '../AdminRoute';
import { can } from '../permissions';
import { fcfa, num, dateFr, dateTimeFr, daysUntil, PLAN_LABELS, actionLabel } from '../format';
import { SubscriptionBadge, PaymentBadge } from '../components/StatusBadge';
import ActionDialog from '../components/ActionDialog';
import '../../styles/dashboard.css';

function Info({ label, children }) {
  return (
    <div className="adm-info">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Total({ icon, label, value }) {
  return (
    <div className="adm-stat">
      <span className="adm-stat-icon" aria-hidden="true"><i className={`ti ${icon}`} /></span>
      <div className="adm-stat-text">
        <div className="adm-stat-value">{value}</div>
        <div className="adm-stat-label">{label}</div>
      </div>
    </div>
  );
}

function leftLabel(date) {
  const d = daysUntil(date);
  if (d == null) return '';
  if (d < 0) return `terminé depuis ${-d} jour${-d > 1 ? 's' : ''}`;
  if (d === 0) return "se termine aujourd'hui";
  return `encore ${d} jour${d > 1 ? 's' : ''}`;
}

export default function MerchantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAdmin();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null); // 'suspend' | 'plan' | 'extend' | 'reset' | 'delete'
  const [toast, setToast] = useState('');

  // champs des fenêtres
  const [plan, setPlan] = useState('pro');
  const [billing, setBilling] = useState('monthly');
  const [days, setDays] = useState('7');
  const [confirmName, setConfirmName] = useState('');
  const [noteText, setNoteText] = useState('');
  const [flagText, setFlagText] = useState('');
  const [sideErr, setSideErr] = useState('');
  const [sideBusy, setSideBusy] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      setData(await getMerchantDetail(id));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const closeDialog = useCallback(() => setDialog(null), []);
  const done = async (message) => {
    setDialog(null);
    setToast(message);
    await load();
  };

  if (loading && !data) return <div className="adm-page"><div className="adm-page-sub">Chargement…</div></div>;
  if (!data) {
    return (
      <div className="adm-page">
        <Link to="/admin/marchands" className="adm-back"><i className="ti ti-arrow-left" aria-hidden="true" /> E-commerçants</Link>
        <div className="db-filter-err" role="alert">{err || 'Compte introuvable.'}</div>
      </div>
    );
  }

  const a = data.account;
  const s = data.subscription || {};
  const t = data.totals || {};
  const suspended = s.stored_status === 'suspended';
  const isTrialPlan = s.plan_id === 'free';
  const endDate = isTrialPlan ? s.trial_ends_at : s.expires_at;
  const canExtend = can(role, 'merchants.extend') && !suspended && s.plan_id
    && (isTrialPlan ? !!s.trial_ends_at : can(role, 'merchants.changePlan'));
  const openFlags = (data.flags || []).filter((f) => !f.resolved_at);

  const sideAction = async (fn, after) => {
    setSideBusy(true);
    setSideErr('');
    try {
      await fn();
      after();
      await load();
    } catch (e) {
      setSideErr(e.message);
    } finally {
      setSideBusy(false);
    }
  };

  return (
    <div className="adm-page">
      <Link to="/admin/marchands" className="adm-back"><i className="ti ti-arrow-left" aria-hidden="true" /> E-commerçants</Link>

      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title adm-detail-title">
            {a.business_name}
            <SubscriptionBadge status={s.status} />
            {openFlags.length > 0 && <span className="badge off"><i className="ti ti-flag" aria-hidden="true" />Signalé</span>}
          </h1>
          <div className="adm-page-sub">Inscrit le {dateFr(a.created_at)} · {a.email}</div>
        </div>
        <div className="adm-actions">
          {canExtend && (
            <button type="button" className="btn btn-outline" onClick={() => { setDays('7'); setDialog('extend'); }}>
              <i className="ti ti-calendar-plus" aria-hidden="true" /> Prolonger
            </button>
          )}
          {can(role, 'merchants.changePlan') && !suspended && (
            <button type="button" className="btn btn-outline" onClick={() => { setPlan(s.plan_id === 'pro' ? 'elite' : 'pro'); setBilling('monthly'); setDialog('plan'); }}>
              <i className="ti ti-switch-horizontal" aria-hidden="true" /> Changer de plan
            </button>
          )}
          {can(role, 'merchants.resetPassword') && (
            <button type="button" className="btn btn-outline" onClick={() => setDialog('reset')}>
              <i className="ti ti-key" aria-hidden="true" /> Réinitialiser le mot de passe
            </button>
          )}
          {can(role, 'merchants.suspend') && (
            <button type="button" className={`btn ${suspended ? 'btn-dark' : 'btn-outline adm-btn-warn'}`} onClick={() => setDialog('suspend')}>
              <i className={`ti ${suspended ? 'ti-player-play' : 'ti-ban'}`} aria-hidden="true" /> {suspended ? 'Réactiver' : 'Suspendre'}
            </button>
          )}
          {can(role, 'merchants.delete') && (
            <button type="button" className="btn btn-danger" onClick={() => { setConfirmName(''); setDialog('delete'); }}>
              <i className="ti ti-trash" aria-hidden="true" /> Supprimer
            </button>
          )}
        </div>
      </div>

      {toast && <div className="adm-toast" role="status"><i className="ti ti-circle-check" aria-hidden="true" /> {toast}</div>}
      {err && <div className="db-filter-err" role="alert">{err}</div>}

      <div className="adm-grid-2 adm-grid-2--even">
        <section className="db-card" aria-labelledby="adm-acc-title">
          <div className="db-card-head"><h2 id="adm-acc-title" className="db-card-title">Compte</h2></div>
          <dl className="adm-infos">
            <Info label="Boutique">{a.business_name}</Info>
            <Info label="Propriétaire">{a.owner_name || '—'}</Info>
            <Info label="Email">{a.email}</Info>
            <Info label="Téléphone">{a.phone || '—'}</Info>
            <Info label="Inscrit le">{dateTimeFr(a.created_at)}</Info>
            <Info label="Dernière connexion">{a.last_login_at ? dateTimeFr(a.last_login_at) : 'Jamais'}</Info>
          </dl>
        </section>

        <section className="db-card" aria-labelledby="adm-sub-title">
          <div className="db-card-head"><h2 id="adm-sub-title" className="db-card-title">Abonnement</h2></div>
          <dl className="adm-infos">
            <Info label="Plan">{s.plan_id ? `${PLAN_LABELS[s.plan_id]}${isTrialPlan ? ' (essai gratuit)' : ''}` : 'Aucun plan choisi'}</Info>
            <Info label="Facturation">{s.billing === 'yearly' ? 'Annuelle' : s.billing === 'monthly' ? 'Mensuelle' : '—'}</Info>
            <Info label="Statut"><SubscriptionBadge status={s.status} /></Info>
            <Info label={isTrialPlan ? "Fin de l'essai" : "Fin de l'abonnement"}>
              {endDate ? <>{dateFr(endDate)} <span className="adm-sub">({leftLabel(endDate)})</span></> : (s.plan_id === 'free' ? 'Ancien compte Free sans date de fin' : '—')}
            </Info>
            <Info label="Reçus émis ce mois">{num(t.receipts_this_month)}</Info>
            <Info label="Dernière modification">{dateTimeFr(s.updated_at)}</Info>
          </dl>
        </section>
      </div>

      <section className="db-card" aria-labelledby="adm-act-title">
        <div className="db-card-head">
          <div>
            <h2 id="adm-act-title" className="db-card-title">Activité (totaux)</h2>
            <div className="db-card-sub"><i className="ti ti-lock" aria-hidden="true" /> Confidentialité : seuls des totaux sont visibles. Le contenu des notes, l'épargne, les challenges et les clients restent privés.</div>
          </div>
        </div>
        <div className="adm-stats adm-stats--4">
          <Total icon="ti-cash-banknote" label="Chiffre d'affaires total" value={fcfa(t.revenue_total)} />
          <Total icon="ti-shopping-cart" label="Ventes" value={num(t.sales_count)} />
          <Total icon="ti-package" label="Produits actifs" value={num(t.products_count)} />
          <Total icon="ti-calendar-event" label="Dernière vente" value={t.last_sale_at ? dateFr(t.last_sale_at) : '—'} />
          <Total icon="ti-receipt" label="Reçus émis (total)" value={num(t.receipts_total)} />
          <Total icon="ti-notes" label="Notes" value={num(t.notes_count)} />
          <Total icon="ti-trophy" label="Challenges" value={num(t.challenges_count)} />
          <Total icon="ti-pig-money" label="Coffres d'épargne" value={num(t.pots_count)} />
        </div>
      </section>

      <section className="db-card db-recent" aria-labelledby="adm-payh-title">
        <div className="db-recent-head">
          <h2 id="adm-payh-title" className="db-recent-title">Historique des paiements</h2>
          <span className="adm-head-count">{num((data.payments || []).length)}</span>
        </div>
        <div className="db-table-scroll">
          <table className="db-table">
            <thead><tr><th>Date</th><th>Plan</th><th>Montant</th><th>Statut</th><th>Référence</th></tr></thead>
            <tbody>
              {(data.payments || []).length === 0 && <tr><td colSpan={5}><div className="db-empty">Aucun paiement.</div></td></tr>}
              {(data.payments || []).map((p) => (
                <tr key={p.id}>
                  <td className="db-nowrap">{dateTimeFr(p.created_at)}</td>
                  <td>{PLAN_LABELS[p.plan_id]}{p.billing === 'yearly' ? ' (annuel)' : ''}</td>
                  <td className="db-nowrap db-strong">{fcfa(p.amount)}</td>
                  <td><PaymentBadge status={p.status} /></td>
                  <td className="adm-mono">{p.provider_ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {sideErr && <div className="db-filter-err" role="alert">{sideErr}</div>}

      <div className="adm-grid-2 adm-grid-2--even">
        <section className="db-card" aria-labelledby="adm-notes-title">
          <div className="db-card-head">
            <div>
              <h2 id="adm-notes-title" className="db-card-title">Notes internes</h2>
              <div className="db-card-sub">Visibles uniquement par l'équipe Margee+.</div>
            </div>
          </div>
          {can(role, 'merchants.notes') && (
            <form className="adm-inline-form" onSubmit={(e) => { e.preventDefault(); if (noteText.trim()) sideAction(() => addAdminNote(id, noteText), () => setNoteText('')); }}>
              <div className="field">
                <label htmlFor="adm-note">Nouvelle note</label>
                <textarea id="adm-note" rows={2} maxLength={2000} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Ex. : a appelé le 21/11 pour un souci de reçu" />
              </div>
              <button type="submit" className="btn btn-dark btn-sm" disabled={!noteText.trim() || sideBusy}><i className="ti ti-plus" aria-hidden="true" /> Ajouter la note</button>
            </form>
          )}
          <ul className="adm-list">
            {(data.admin_notes || []).length === 0 && <li className="adm-list-empty">Aucune note.</li>}
            {(data.admin_notes || []).map((n) => (
              <li key={n.id}>
                <p className="adm-list-text">{n.content}</p>
                <span className="adm-sub">{n.author_email || 'Admin supprimé'} · {dateTimeFr(n.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="db-card" aria-labelledby="adm-flags-title">
          <div className="db-card-head">
            <div>
              <h2 id="adm-flags-title" className="db-card-title">Signalements</h2>
              <div className="db-card-sub">Usage anormal à surveiller.</div>
            </div>
            {openFlags.length > 0 && <span className="adm-head-count">{openFlags.length}</span>}
          </div>
          {can(role, 'merchants.flags') && (
            <form className="adm-inline-form" onSubmit={(e) => { e.preventDefault(); if (flagText.trim()) sideAction(() => addFlag(id, flagText), () => setFlagText('')); }}>
              <div className="field">
                <label htmlFor="adm-flag-reason">Signaler ce compte</label>
                <input id="adm-flag-reason" maxLength={500} value={flagText} onChange={(e) => setFlagText(e.target.value)} placeholder="Ex. : 200 ventes en 1 heure" />
              </div>
              <button type="submit" className="btn btn-outline btn-sm" disabled={!flagText.trim() || sideBusy}><i className="ti ti-flag" aria-hidden="true" /> Signaler</button>
            </form>
          )}
          <ul className="adm-list">
            {(data.flags || []).length === 0 && <li className="adm-list-empty">Aucun signalement.</li>}
            {(data.flags || []).map((f) => (
              <li key={f.id} className={f.resolved_at ? 'is-resolved' : ''}>
                <div className="adm-list-row">
                  <p className="adm-list-text">{f.reason}</p>
                  {!f.resolved_at && can(role, 'merchants.flags') && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={sideBusy} onClick={() => sideAction(() => resolveFlag(f.id), () => setToast('Signalement marqué comme traité.'))}>
                      <i className="ti ti-check" aria-hidden="true" /> Traité
                    </button>
                  )}
                </div>
                <span className="adm-sub">
                  {dateTimeFr(f.created_at)}{f.resolved_at ? ` · traité le ${dateFr(f.resolved_at)}${f.resolved_by_email ? ` par ${f.resolved_by_email}` : ''}` : ' · ouvert'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="db-card db-recent" aria-labelledby="adm-hist-title">
        <div className="db-recent-head">
          <h2 id="adm-hist-title" className="db-recent-title">Actions de l'équipe sur ce compte</h2>
        </div>
        <div className="db-table-scroll">
          <table className="db-table">
            <thead><tr><th>Date</th><th>Action</th><th>Par</th><th>Motif</th></tr></thead>
            <tbody>
              {(data.history || []).length === 0 && <tr><td colSpan={4}><div className="db-empty">Aucune action pour l'instant.</div></td></tr>}
              {(data.history || []).map((h) => (
                <tr key={h.id}>
                  <td className="db-nowrap">{dateTimeFr(h.created_at)}</td>
                  <td className="db-strong">{actionLabel(h.action)}</td>
                  <td>{h.admin_email || '—'}</td>
                  <td>{h.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Fenêtres d'action (motif obligatoire) ── */}
      <ActionDialog
        open={dialog === 'suspend'}
        icon={suspended ? 'ti-player-play' : 'ti-ban'}
        danger={!suspended}
        title={suspended ? `Réactiver ${a.business_name} ?` : `Suspendre ${a.business_name} ?`}
        message={suspended
          ? "Le compte retrouve l'accès à son espace. Son statut est recalculé d'après ses dates d'essai ou d'abonnement."
          : "L'e-commerçant ne pourra plus utiliser son espace. Il verra : « Ton compte est suspendu, contacte le support »."}
        confirmLabel={suspended ? 'Réactiver' : 'Suspendre'}
        onCancel={closeDialog}
        onSubmit={async (reason) => { await setSuspended(id, !suspended, reason); await done(suspended ? 'Compte réactivé.' : 'Compte suspendu.'); }}
      />

      <ActionDialog
        open={dialog === 'plan'}
        icon="ti-switch-horizontal"
        title="Changer de plan"
        message={`Plan actuel : ${s.plan_id ? PLAN_LABELS[s.plan_id] : 'aucun'}. Pro et Elite : la date de fin en cours est gardée si elle est dans le futur, sinon une nouvelle période commence aujourd'hui. Free : un essai gratuit est accordé.`}
        confirmLabel="Changer le plan"
        onCancel={closeDialog}
        onSubmit={async (reason) => { await changePlan(id, plan, plan === 'free' ? null : billing, reason); await done(`Plan changé : ${PLAN_LABELS[plan]}.`); }}
      >
        <div className="adm-dialog-row">
          <div className="field">
            <label htmlFor="adm-new-plan">Nouveau plan</label>
            <select id="adm-new-plan" data-autofocus value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="free">Free (essai)</option>
              <option value="pro">Pro</option>
              <option value="elite">Elite</option>
            </select>
          </div>
          {plan !== 'free' && (
            <div className="field">
              <label htmlFor="adm-new-billing">Facturation</label>
              <select id="adm-new-billing" value={billing} onChange={(e) => setBilling(e.target.value)}>
                <option value="monthly">Mensuelle (30 jours)</option>
                <option value="yearly">Annuelle (365 jours)</option>
              </select>
            </div>
          )}
        </div>
      </ActionDialog>

      <ActionDialog
        open={dialog === 'extend'}
        icon="ti-calendar-plus"
        title={isTrialPlan ? "Prolonger l'essai" : "Prolonger l'abonnement"}
        message={endDate
          ? `Fin actuelle : ${dateFr(endDate)} (${leftLabel(endDate)}). Les jours s'ajoutent à cette date, ou à aujourd'hui si elle est passée.`
          : "Les jours s'ajoutent à partir d'aujourd'hui."}
        confirmLabel="Prolonger"
        canSubmit={Number(days) >= 1 && Number(days) <= 365}
        onCancel={closeDialog}
        onSubmit={async (reason) => { await extendAccount(id, days, reason); await done(`Prolongé de ${days} jour${Number(days) > 1 ? 's' : ''}.`); }}
      >
        <div className="field">
          <label htmlFor="adm-days">Nombre de jours (1 à 365)</label>
          <input id="adm-days" data-autofocus type="number" min={1} max={365} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      </ActionDialog>

      <ActionDialog
        open={dialog === 'reset'}
        icon="ti-key"
        title="Envoyer un email de réinitialisation ?"
        message={`Un lien pour choisir un nouveau mot de passe sera envoyé à ${a.email}. Le mot de passe actuel reste valable tant que le lien n'est pas utilisé.`}
        confirmLabel="Envoyer l'email"
        onCancel={closeDialog}
        onSubmit={async (reason) => { await sendPasswordReset(id, reason); await done(`Email envoyé à ${a.email}.`); }}
      />

      <ActionDialog
        open={dialog === 'delete'}
        icon="ti-trash"
        danger
        title="Supprimer définitivement ce compte ?"
        message="Toutes les données de cet e-commerçant (produits, ventes, notes, épargne, challenges, réglages) seront effacées. Les paiements sont gardés pour la comptabilité, mais anonymisés. Action irréversible."
        confirmLabel="Supprimer définitivement"
        canSubmit={confirmName.trim() === a.business_name.trim()}
        onCancel={closeDialog}
        onSubmit={async (reason) => { await deleteMerchant(id, reason, confirmName.trim()); navigate('/admin/marchands', { replace: true, state: { deleted: a.business_name } }); }}
      >
        <div className="field">
          <label htmlFor="adm-confirm-name">Pour confirmer, tape le nom de la boutique : <strong>{a.business_name}</strong></label>
          <input id="adm-confirm-name" data-autofocus autoComplete="off" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </div>
      </ActionDialog>
    </div>
  );
}
