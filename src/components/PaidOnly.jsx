import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import usePlans from '../hooks/usePlans';
import { isSubscriptionActive } from '../services/api';
import { fmt } from '../utils/calc';

/** Abonnement payant actif (même règle que private.has_paid_plan en base) */
export function useHasPaidPlan() {
  const { account } = useAuth();
  const { all } = usePlans();
  const plan = all[account?.subscription?.plan];
  return !!plan && plan.price > 0 && account?.subscription?.status === 'active' && isSubscriptionActive(account);
}

const FEATURES = {
  stock: {
    icon: 'ti-building-warehouse',
    title: 'Stock',
    text: "Sache à tout moment combien il te reste de chaque produit, sois alerté avant la rupture et vois combien d'argent dort dans ton stock.",
  },
  depenses: {
    icon: 'ti-wallet',
    title: 'Dépenses',
    text: 'Suis tout ce que tu dépenses (loyer, stock, transport, matériel…) et sache si chaque dépense est un actif ou un passif.',
  },
  challenges: {
    icon: 'ti-target-arrow',
    title: 'Challenges',
    text: "Fixe-toi un objectif (chiffre d'affaires, bénéfice, nombre de ventes) : Margee+ suit ta progression tout seul et te dit le rythme à tenir.",
  },
  investissements: {
    icon: 'ti-chart-pie',
    title: 'Investissements',
    text: 'Note ce que tu investis dans ton business et vois combien te rapporte chaque franc (ROI), mois après mois.',
  },
};

/**
 * Page réservée aux plans payants (Pro, Elite). Pendant l'essai Free,
 * affiche ce que la page permet et le bouton pour choisir un plan.
 * La base refuse de toute façon les écritures (private.has_paid_plan).
 */
export default function PaidOnly({ feature, children }) {
  const paid = useHasPaidPlan();
  const { all } = usePlans();
  if (paid) return children;

  const f = FEATURES[feature];
  const pro = all.pro;
  return (
    <div className="page-content">
      <div className="paid-lock card">
        <span className="paid-lock-icon" aria-hidden="true"><i className={`ti ${f.icon}`} /><i className="ti ti-lock paid-lock-badge" /></span>
        <h2 className="paid-lock-title">{f.title} : disponible avec Pro ou Elite</h2>
        <p className="paid-lock-text">{f.text}</p>
        <p className="paid-lock-sub">Pendant l'essai gratuit, tu découvres les ventes, les reçus, les factures et le tableau de bord. Passe à un plan payant pour débloquer {f.title.toLowerCase()} et tous les outils.</p>
        <div className="paid-lock-actions">
          <Link to="/abonnement?plan=pro" className="btn btn-primary">
            <i className="ti ti-crown" aria-hidden="true" /> {pro ? `Passer à Pro · ${fmt(pro.price)} / mois` : 'Voir les plans'}
          </Link>
          <Link to="/app/dashboard" className="btn btn-outline">Retour au tableau de bord</Link>
        </div>
      </div>
    </div>
  );
}
