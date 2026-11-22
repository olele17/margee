import { NavLink, useLocation, useNavigate } from 'react-router-dom';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const scrollToTop = () => window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });

/**
 * Barre de navigation du bas, affichée seulement dans l'application
 * installée sur mobile (classe html.is-standalone + écran étroit, voir
 * pwa.css). Sur ordinateur et dans un navigateur, rien ne change.
 */
export default function MobileTabBar({ onMenu }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Toucher l'onglet de la page en cours : retour fluide en haut
  const tab = (to, icon, label) => (
    <NavLink
      to={to}
      className={({ isActive }) => `tabbar-item${isActive ? ' active' : ''}`}
      onClick={(e) => { if (location.pathname === to) { e.preventDefault(); scrollToTop(); } }}
    >
      <i className={`ti ${icon}`} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );

  return (
    <nav className="tabbar" aria-label="Navigation rapide">
      {tab('/app/dashboard', 'ti-layout-dashboard', 'Dashboard')}
      {tab('/app/ventes', 'ti-receipt', 'Ventes')}
      <button
        type="button"
        className="tabbar-add"
        aria-label="Ajouter une vente"
        onClick={() => navigate('/app/ventes?nouvelle=1')}
      >
        <span className="tabbar-add-circle"><i className="ti ti-plus" aria-hidden="true" /></span>
      </button>
      {tab('/app/challenges', 'ti-target-arrow', 'Challenges')}
      <button type="button" className="tabbar-item" onClick={onMenu} aria-haspopup="true">
        <i className="ti ti-menu-2" aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
