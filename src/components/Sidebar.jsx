import { useCallback, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from './ConfirmDialog';

const MENU_LINKS = [
  { to: '/app/dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
  { to: '/app/produits', icon: 'ti-package', label: 'Produits' },
  { to: '/app/ventes', icon: 'ti-receipt', label: 'Ventes' },
  { to: '/app/pubs', icon: 'ti-speakerphone', label: 'Pubs' },
  { to: '/app/depenses', icon: 'ti-wallet', label: 'Dépenses' },
  { to: '/app/investissements', icon: 'ti-chart-pie', label: 'Investissements' },
  { to: '/app/notes', icon: 'ti-notebook', label: 'Notes' },
  { to: '/app/challenges', icon: 'ti-target-arrow', label: 'Challenges' },
];

const GENERAL_LINKS = [
  { to: '/app/parametres', icon: 'ti-settings', label: 'Paramètres' },
];

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { doLogout } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const cancelLogout = useCallback(() => setConfirmLogout(false), []);

  const logout = () => {
    setConfirmLogout(false);
    onClose();
    doLogout();
    navigate('/connexion', { replace: true });
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-logo">
        <img src="/margee-mark.svg" alt="" width="36" height="36" className="sidebar-logo-mark" />
        <span className="sidebar-logo-text">
          <span className="sidebar-logo-name">MARGEE+</span>
          <span className="sidebar-logo-tag">GÈRE · VENDS · SCALE</span>
        </span>
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
          type="button"
          onClick={() => setConfirmLogout(true)}
          aria-haspopup="dialog"
          style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <div className="sidebar-link-content">
            <i className="ti ti-logout" />
            <span>Déconnexion</span>
          </div>
        </button>
      </nav>

      <ConfirmDialog
        open={confirmLogout}
        icon="ti-logout"
        title="Se déconnecter ?"
        message="Tu devras saisir ton email et ton mot de passe pour revenir dans ton espace."
        cancelLabel="Annuler"
        confirmLabel="Me déconnecter"
        onCancel={cancelLogout}
        onConfirm={logout}
      />
    </aside>
  );
}
