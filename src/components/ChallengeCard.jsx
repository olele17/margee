import { useEffect, useState } from 'react';
import { CHALLENGE_TYPES, fmt, fmtN } from '../utils/calc';
import { money, useAmountsHidden } from '../utils/amountPrivacy';

export const STATUS_LABELS = {
  upcoming: 'À venir',
  ongoing: 'En cours',
  success: 'Réussi',
  failed: 'Échoué',
};

// Mémorise les challenges déjà célébrés pour n'animer qu'une seule fois
// (confort d'affichage propre à ce navigateur, pas une donnée métier).
const CELEBRATED_KEY = 'margee_celebrated_challenges';
function alreadyCelebrated(id) {
  try { return (JSON.parse(localStorage.getItem(CELEBRATED_KEY)) || []).includes(id); } catch { return true; }
}
function markCelebrated(id) {
  try {
    const list = JSON.parse(localStorage.getItem(CELEBRATED_KEY)) || [];
    if (!list.includes(id)) localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...list, id]));
  } catch { /* stockage indisponible : on ignore */ }
}

const dateFr = (s, withYear = true) =>
  new Date(`${s}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
const plural = (n, one, many) => (Math.abs(n) > 1 ? many : one);

/** Texte du rythme nécessaire / du bilan, selon le statut. */
export function challengeAdvice(challenge, pr) {
  const isProduct = challenge.type === 'product_units';
  const noun = (n) => (isProduct ? plural(n, 'pièce', 'pièces') : plural(n, 'vente', 'ventes'));
  const value = (n) => (pr.unit === 'money' ? money(Math.round(n)) : `${fmtN(Math.round(n))} ${noun(Math.round(n))}`);

  if (pr.status === 'upcoming') {
    return `Commence dans ${pr.daysUntilStart} ${plural(pr.daysUntilStart, 'jour', 'jours')}.`;
  }
  if (pr.isBudget) {
    if (pr.status === 'failed') return `Budget dépassé de ${money(Math.round(-pr.remaining))}.`;
    if (pr.status === 'success') return `Budget respecté : ${money(Math.round(pr.remaining))} non dépensés.`;
    return `Il te reste ${money(Math.round(pr.remaining))} à dépenser, soit ${money(Math.floor(pr.perDay))} max par jour.`;
  }
  if (pr.status === 'success') {
    const extra = pr.realized - pr.target;
    return extra > 0 ? `Objectif dépassé de ${value(extra)}.` : 'Objectif atteint pile.';
  }
  if (pr.status === 'failed') return `Il a manqué ${value(pr.remaining)}.`;
  // En cours
  if (pr.unit === 'money') return `Il te faut ${money(Math.ceil(pr.perDay))} par jour pour réussir.`;
  if (pr.perDay >= 1) {
    const n = Math.ceil(pr.perDay);
    return `Il te faut ${n} ${noun(n)} par jour pour réussir.`;
  }
  // Moins d'une vente par jour nécessaire
  const every = Math.floor(pr.daysLeft / pr.remaining);
  if (every < 2) return `Il te faut environ 1 ${noun(1)} par jour pour réussir.`;
  return `1 ${noun(1)} tous les ${every} jours suffit pour réussir.`;
}

export default function ChallengeCard({ challenge, progress: pr, productName, onEdit, onDelete, compact = false }) {
  useAmountsHidden(); // se réaffiche quand le mode discret change
  const type = CHALLENGE_TYPES[challenge.type];
  const isProduct = challenge.type === 'product_units';
  const fmtVal = (n) => (pr.unit === 'money' ? money(Math.round(n)) : fmtN(Math.round(n)));
  const unitWord = pr.unit === 'count' ? ` ${isProduct ? 'pièces' : 'ventes'}` : '';
  const pctShown = Math.round(pr.percent);
  const barWidth = Math.min(pr.percent, 100);

  // Animation sobre, une seule fois, quand un challenge est réussi
  const [celebrate] = useState(() => pr.status === 'success' && !alreadyCelebrated(challenge.id));
  useEffect(() => { if (celebrate) markCelebrated(challenge.id); }, [celebrate, challenge.id]);

  const barClass = pr.status === 'failed' ? 'is-failed' : pr.status === 'success' ? 'is-success' : '';

  return (
    <article className={`nc-ch nc-ch--${pr.status}${celebrate ? ' nc-ch--celebrate' : ''}${compact ? ' nc-ch--compact' : ''}`}>
      <div className="nc-ch-top">
        <span className="nc-ch-type"><i className={`ti ${type?.icon || 'ti-target'}`} aria-hidden="true" />{type?.short}</span>
        <span className={`nc-status nc-status--${pr.status}`}>{STATUS_LABELS[pr.status]}</span>
      </div>

      <h3 className="nc-ch-title">{challenge.title}</h3>
      <div className="nc-ch-period">
        <i className="ti ti-calendar" aria-hidden="true" /> Du {dateFr(challenge.startDate, false)} au {dateFr(challenge.endDate)}
        {isProduct && (
          <span className="nc-ch-product">
            <i className="ti ti-package" aria-hidden="true" />{pr.productMissing ? 'Produit supprimé' : productName}
          </span>
        )}
      </div>

      {pr.status === 'success' && (
        <div className="nc-ch-achieved"><i className="ti ti-trophy" aria-hidden="true" /> Objectif atteint</div>
      )}

      <div className="nc-ch-progress">
        <div
          className="nc-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(pctShown, 100)}
          aria-label={pr.isBudget ? 'Part du budget pub dépensée' : "Progression vers l'objectif"}
        >
          <div className={`nc-bar-fill ${barClass}`} style={{ width: `${barWidth}%` }} />
        </div>
        <span className="nc-bar-pct">{pctShown}%</span>
      </div>

      <dl className="nc-ch-figures">
        <div><dt>{pr.isBudget ? 'Dépensé' : 'Réalisé'}</dt><dd>{fmtVal(pr.realized)}{unitWord}</dd></div>
        <div><dt>{pr.isBudget ? 'Budget max' : 'Objectif'}</dt><dd>{fmtVal(pr.target)}{unitWord}</dd></div>
        {(pr.status === 'ongoing' || pr.status === 'upcoming') && (
          <>
            <div>
              <dt>{pr.isBudget ? 'Reste à dépenser' : 'Reste'}</dt>
              <dd>{fmtVal(Math.max(pr.remaining, 0))}{unitWord}</dd>
            </div>
            <div>
              <dt>{pr.status === 'upcoming' ? 'Durée' : 'Temps restant'}</dt>
              <dd>{pr.daysLeft} {plural(pr.daysLeft, 'jour', 'jours')}{pr.status === 'ongoing' ? ' restants' : ''}</dd>
            </div>
          </>
        )}
      </dl>

      <p className={`nc-ch-advice nc-ch-advice--${pr.status}`}>
        <i className={`ti ${pr.status === 'failed' ? 'ti-alert-circle' : pr.status === 'success' ? 'ti-circle-check' : 'ti-bolt'}`} aria-hidden="true" />
        {challengeAdvice(challenge, pr)}
      </p>

      {(onEdit || onDelete) && (
        <div className="nc-ch-actions">
          {onEdit && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(challenge)} aria-label={`Modifier « ${challenge.title} »`}>
              <i className="ti ti-pencil" /> Modifier
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(challenge)} aria-label={`Supprimer « ${challenge.title} »`}>
              <i className="ti ti-trash" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
