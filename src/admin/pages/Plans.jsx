import { useEffect, useMemo, useState } from 'react';
import { listPlansAdmin, getPlanStats, updatePlan } from '../adminApi';
import { useAdmin } from '../AdminRoute';
import { can } from '../permissions';
import { num, fcfa, dateTimeFr } from '../format';
import ActionDialog from '../components/ActionDialog';
import { PlanCard } from '../../pages/Landing';
import { mapPlanRow, FREE_AUTO_LINE } from '../../services/api';
import usePlans, { reloadPlans } from '../../hooks/usePlans';
import '../../styles/dashboard.css';

/* Formulaire ⇄ ligne de la table plans */
function toForm(row) {
  return {
    name: row.name,
    price: String(row.price ?? 0),
    oldPrice: row.old_price == null ? '' : String(row.old_price),
    durationDays: row.duration_days == null ? '' : String(row.duration_days),
    // Free : la ligne « Sans limite de durée » est ajoutée à l'affichage ;
    // elle n'est pas saisie ici.
    features: (row.features || [])
      .filter((f) => !(Number(row.price) === 0 && FREE_AUTO_LINE.test(f)))
      .join('\n'),
    sortOrder: String(row.sort_order ?? 0),
    highlight: !!row.highlight,
    isActive: row.is_active !== false,
  };
}

const intOrNull = (s) => (String(s).trim() === '' ? null : Number(String(s).replace(/\s/g, '')));
const featureList = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/* Mêmes règles que admin_update_plan (la base revérifie tout) */
function validate(form, free, otherPaidActive) {
  const errors = {};
  const name = form.name.trim();
  if (name.length < 2 || name.length > 30) errors.name = 'Entre 2 et 30 caractères.';
  const price = intOrNull(form.price);
  const old = intOrNull(form.oldPrice);
  if (!free) {
    if (!Number.isInteger(price) || price < 100 || price > 10000000) errors.price = 'Entre 100 F et 10 000 000 F.';
    if (old !== null && (!Number.isInteger(old) || old <= (price || 0) || old > 10000000)) errors.oldPrice = 'Doit être plus élevé que le prix.';
    const d = intOrNull(form.durationDays);
    if (!Number.isInteger(d) || d < 1 || d > 366) errors.durationDays = 'Entre 1 et 366 jours.';
    if (!form.isActive && !otherPaidActive) errors.isActive = 'Il faut garder au moins un plan payant actif.';
  }
  const feats = featureList(form.features);
  if (feats.length < 1 || feats.length > 12) errors.features = 'Entre 1 et 12 avantages (un par ligne).';
  else if (feats.some((f) => f.length < 2 || f.length > 120)) errors.features = 'Chaque avantage : 2 à 120 caractères.';
  const so = intOrNull(form.sortOrder);
  if (!Number.isInteger(so) || so < 0 || so > 99) errors.sortOrder = 'Entre 0 et 99.';
  return errors;
}

function FieldError({ id, children }) {
  if (!children) return null;
  return <div id={id} className="adm-field-err" role="alert">{children}</div>;
}

function PlanEditor({ row, stats, canEdit, otherPaidActive, annualMonths, trialDays, onSaved }) {
  const free = Number(row.price) === 0;
  // Réinitialisé seulement si la ligne change vraiment en base (un simple
  // rechargement de la liste ne doit pas effacer une saisie en cours).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => toForm(row), [row.id, row.updated_at]);
  const [form, setForm] = useState(initial);
  const [yearly, setYearly] = useState(false);
  const [dialog, setDialog] = useState(false);
  useEffect(() => { setForm(initial); }, [initial]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const errors = validate(form, free, otherPaidActive);
  const valid = Object.keys(errors).length === 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const subscribers = Number(stats?.[row.id] || 0);

  // Aperçu : exactement la carte de la landing, avec les valeurs saisies
  const preview = mapPlanRow({
    ...row,
    name: form.name.trim() || row.name,
    price: free ? 0 : (intOrNull(form.price) || 0),
    old_price: free ? null : intOrNull(form.oldPrice),
    duration_days: free ? null : intOrNull(form.durationDays),
    features: featureList(form.features),
    highlight: form.highlight,
    is_active: form.isActive,
  }, trialDays);

  const payload = () => ({
    name: form.name.trim(),
    price: free ? 0 : intOrNull(form.price),
    oldPrice: free ? null : intOrNull(form.oldPrice),
    durationDays: free ? null : intOrNull(form.durationDays),
    features: featureList(form.features),
    sortOrder: intOrNull(form.sortOrder),
    highlight: form.highlight,
    isActive: free ? true : form.isActive,
  });

  // Résumé des changements montré avant d'enregistrer
  const changes = [];
  if (form.name.trim() !== initial.name) changes.push(`Nom : ${initial.name} → ${form.name.trim()}`);
  if (!free && intOrNull(form.price) !== intOrNull(initial.price)) changes.push(`Prix : ${fcfa(initial.price)} → ${fcfa(intOrNull(form.price))} / mois`);
  if (!free && intOrNull(form.oldPrice) !== intOrNull(initial.oldPrice)) changes.push(`Prix barré : ${initial.oldPrice ? fcfa(initial.oldPrice) : 'aucun'} → ${form.oldPrice ? fcfa(intOrNull(form.oldPrice)) : 'aucun'}`);
  if (!free && intOrNull(form.durationDays) !== intOrNull(initial.durationDays)) changes.push(`Durée : ${initial.durationDays} → ${form.durationDays} jours`);
  if (featureList(form.features).join('\n') !== featureList(initial.features).join('\n')) changes.push('Avantages modifiés');
  if (intOrNull(form.sortOrder) !== intOrNull(initial.sortOrder)) changes.push(`Ordre : ${initial.sortOrder} → ${form.sortOrder}`);
  if (form.highlight !== initial.highlight) changes.push(form.highlight ? 'Mis en avant' : 'Plus mis en avant');
  if (form.isActive !== initial.isActive) changes.push(form.isActive ? 'Réactivé : de nouveau proposé' : 'Désactivé : plus proposé aux nouveaux clients');

  const id = (k) => `plan-${row.id}-${k}`;
  const disabled = !canEdit;

  return (
    <section className="db-card adm-plan" aria-labelledby={id('title')}>
      <header className="adm-plan-head">
        <div>
          <h2 id={id('title')} className="adm-plan-title">
            {row.name}
            <span className={`badge ${row.is_active ? 'ok' : 'off'}`}>
              <i className={`ti ${row.is_active ? 'ti-circle-check' : 'ti-eye-off'}`} aria-hidden="true" />{row.is_active ? 'Proposé' : 'Désactivé'}
            </span>
          </h2>
          <div className="adm-sub">
            {num(subscribers)} abonné{subscribers > 1 ? 's' : ''} {free ? 'en essai ou Free' : `actif${subscribers > 1 ? 's' : ''}`}
            {' · '}Reçus : {row.receipt_limit == null ? 'illimités' : `${row.receipt_limit}${free ? ' au total' : ' par mois'}`}
            {' · '}Modifié le {dateTimeFr(row.updated_at)}
          </div>
        </div>
      </header>

      <div className="adm-plan-grid">
        <form className="adm-plan-form" onSubmit={(e) => { e.preventDefault(); if (valid && dirty) setDialog(true); }} noValidate>
          <div className="adm-plan-fields">
            <div className="field">
              <label htmlFor={id('name')}>Nom affiché</label>
              <input id={id('name')} value={form.name} onChange={set('name')} maxLength={30} disabled={disabled} aria-invalid={!!errors.name} aria-describedby={errors.name ? id('name-err') : undefined} />
              <FieldError id={id('name-err')}>{errors.name}</FieldError>
            </div>
            <div className="field">
              <label htmlFor={id('sort')}>Ordre d'affichage</label>
              <input id={id('sort')} type="number" min="0" max="99" value={form.sortOrder} onChange={set('sortOrder')} disabled={disabled} aria-invalid={!!errors.sortOrder} />
              <FieldError id={id('sort-err')}>{errors.sortOrder}</FieldError>
            </div>
            {free ? (
              <div className="adm-plan-note">
                <i className="ti ti-info-circle" aria-hidden="true" />
                <span>Le plan Free reste gratuit, toujours proposé et sans date de fin. Sa limite est le nombre d'essais ci-dessous.</span>
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor={id('price')}>Prix mensuel (F CFA)</label>
                  <input id={id('price')} type="number" inputMode="numeric" min="100" step="100" value={form.price} onChange={set('price')} disabled={disabled} aria-invalid={!!errors.price} />
                  <FieldError id={id('price-err')}>{errors.price}</FieldError>
                </div>
                <div className="field">
                  <label htmlFor={id('old')}>Prix barré (optionnel)</label>
                  <input id={id('old')} type="number" inputMode="numeric" min="0" step="100" value={form.oldPrice} onChange={set('oldPrice')} disabled={disabled} placeholder="Aucun" aria-invalid={!!errors.oldPrice} />
                  <FieldError id={id('old-err')}>{errors.oldPrice}</FieldError>
                </div>
                <div className="field">
                  <label htmlFor={id('days')}>Durée d'un mois payé (jours)</label>
                  <input id={id('days')} type="number" min="1" max="366" value={form.durationDays} onChange={set('durationDays')} disabled={disabled} aria-invalid={!!errors.durationDays} />
                  <FieldError id={id('days-err')}>{errors.durationDays}</FieldError>
                </div>
                <div className="field">
                  <span className="adm-label">Paiement annuel</span>
                  <div className="adm-readonly">{fcfa((intOrNull(form.price) || 0) * annualMonths)} / an ({annualMonths} mois payés, 365 jours)</div>
                </div>
              </>
            )}
            <div className="field adm-plan-wide">
              <label htmlFor={id('features')}>Avantages (un par ligne)</label>
              <textarea id={id('features')} rows={6} value={form.features} onChange={set('features')} disabled={disabled} aria-invalid={!!errors.features} />
              {free && <div className="adm-sub">La ligne « Sans limite de durée » est ajoutée automatiquement en tête.</div>}
              <FieldError id={id('features-err')}>{errors.features}</FieldError>
            </div>
            <div className="adm-plan-wide adm-plan-checks">
              <label className="adm-check">
                <input type="checkbox" checked={form.highlight} onChange={set('highlight')} disabled={disabled} />
                Mettre en avant (badge « Le plus complet »)
              </label>
              {!free && (
                <label className="adm-check">
                  <input type="checkbox" checked={form.isActive} onChange={set('isActive')} disabled={disabled} />
                  Proposé aux nouveaux clients
                </label>
              )}
              <FieldError id={id('active-err')}>{errors.isActive}</FieldError>
            </div>
          </div>

          {canEdit && (
            <div className="adm-plan-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(initial)} disabled={!dirty}>
                <i className="ti ti-arrow-back-up" aria-hidden="true" /> Annuler les modifications
              </button>
              <button type="submit" className="btn btn-primary" disabled={!dirty || !valid}>
                <i className="ti ti-device-floppy" aria-hidden="true" /> Enregistrer
              </button>
            </div>
          )}
        </form>

        <div className="adm-plan-preview-col">
          <div className="adm-plan-preview-head">
            <span className="adm-label">Aperçu sur la landing</span>
            <div className="adm-seg" role="group" aria-label="Période de l'aperçu">
              <button type="button" aria-pressed={!yearly} className={!yearly ? 'is-on' : ''} onClick={() => setYearly(false)}>Mensuel</button>
              <button type="button" aria-pressed={yearly} className={yearly ? 'is-on' : ''} onClick={() => setYearly(true)}>Annuel</button>
            </div>
          </div>
          <div className={`lp adm-plan-preview${form.isActive ? '' : ' is-off'}`}>
            <PlanCard planKey={row.id} plan={preview} yearly={yearly} annualMonths={annualMonths} preview />
          </div>
          {!form.isActive && <div className="adm-sub">Désactivé : cette carte n'apparaît plus sur la landing ni sur la page d'abonnement.</div>}
        </div>
      </div>

      <ActionDialog
        open={dialog}
        icon="ti-tags"
        title={`Enregistrer le plan ${row.name} ?`}
        message={`${changes.join(' · ')}. Visible tout de suite sur la landing et la page d'abonnement. Les abonnements en cours ne changent pas : le nouveau prix s'applique aux prochains paiements.`}
        confirmLabel="Enregistrer"
        onCancel={() => setDialog(false)}
        onSubmit={async (reason) => {
          await updatePlan(row.id, payload(), reason);
          setDialog(false);
          await onSaved(`Plan ${form.name.trim()} enregistré.`);
        }}
      />
    </section>
  );
}

export default function Plans() {
  const { role } = useAdmin();
  const canEdit = can(role, 'plans.edit');
  const { annualMonths, trialDays } = usePlans();
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState({});
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  const load = async () => {
    const [r, s] = await Promise.all([listPlansAdmin(), getPlanStats().catch(() => ({}))]);
    setRows(r);
    setStats(s);
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, []);

  const onSaved = async (message) => {
    setToast(message);
    await Promise.all([load().catch((e) => setErr(e.message)), reloadPlans()]);
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">Plans et tarifs</h1>
          <div className="adm-page-sub">Les changements s'affichent tout de suite sur la landing et la page d'abonnement. Les abonnements en cours ne changent pas.</div>
        </div>
      </div>

      {toast && <div className="adm-toast" role="status"><i className="ti ti-circle-check" aria-hidden="true" /> {toast}</div>}
      {err && <div className="db-filter-err" role="alert">{err}</div>}
      {!rows && !err && <div className="db-card adm-loading" aria-busy="true">Chargement…</div>}

      {rows?.map((row) => (
        <PlanEditor
          key={row.id}
          row={row}
          stats={stats}
          canEdit={canEdit}
          otherPaidActive={rows.some((r) => r.id !== row.id && Number(r.price) > 0 && r.is_active)}
          annualMonths={annualMonths}
          trialDays={trialDays}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}
