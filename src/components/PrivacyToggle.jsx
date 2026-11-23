import { useAmountsHidden } from '../utils/amountPrivacy';

/**
 * Bouton « mode discret » : masque / affiche les montants dans tout
 * l'espace. Même état partout (mémorisé sur l'appareil).
 */
export default function PrivacyToggle({ className = '' }) {
  const [hidden, toggle] = useAmountsHidden();
  const label = hidden ? 'Afficher les montants' : 'Masquer les montants';
  return (
    <button
      type="button"
      className={`btn btn-outline privacy-btn${hidden ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      onClick={toggle}
      title={label}
      aria-label={label}
    >
      <i className={`ti ti-${hidden ? 'eye' : 'eye-off'}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
