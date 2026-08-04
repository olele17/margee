import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MENU_LINKS = [
  { to: '/app/dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
  { to: '/app/produits', icon: 'ti-package', label: 'Produits', badge: '12+' },
  { to: '/app/ventes', icon: 'ti-receipt', label: 'Ventes' },
  { to: '/app/pubs', icon: 'ti-speakerphone', label: 'Pubs' },
  { to: '/app/depenses', icon: 'ti-wallet', label: 'Dépenses' },
  { to: '/app/investissements', icon: 'ti-chart-pie', label: 'Investissements' },
];

const GENERAL_LINKS = [
  { to: '/app/parametres', icon: 'ti-settings', label: 'Paramètres' },
];

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { doLogout } = useAuth();

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <i className="ti ti-bolt" />
        </div>
        <span>EasySwap</span>
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Fermer le menu">
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="sidebar-section-title">MENU</div>
      <nav className="sidebar-nav">
        {MENU_LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            onClick={onClose}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <div className="sidebar-link-content">
              <i className={`ti ${l.icon}`} />
              <span>{l.label}</span>
            </div>
            {l.badge && <span className="sidebar-badge">{l.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-section-title">GENERAL</div>
      <nav className="sidebar-nav">
        {GENERAL_LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            onClick={onClose}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <div className="sidebar-link-content">
              <i className={`ti ${l.icon}`} />
              <span>{l.label}</span>
            </div>
          </NavLink>
        ))}
        <button
          className="sidebar-link"
          onClick={doLogout}
          style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <div className="sidebar-link-content">
            <i className="ti ti-logout" />
            <span>Déconnexion</span>
          </div>
        </button>
      </nav>
    </aside>
  );
}
