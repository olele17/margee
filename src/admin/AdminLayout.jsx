import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAdmin } from './AdminRoute';
import { ADMIN_NAV, ROLES, can } from './permissions';
import { getUnreadThreads } from './adminApi';
import './admin.css';

/**
 * Cadre de l'espace admin : mêmes composants visuels que /app (barre
 * latérale noire, barre du haut, fond crème), badge or « ADMIN » et
 * mise en page plus dense.
 */
export default function AdminLayout() {
  const { role, email } = useAdmin();
  const { doLogout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const cancelLogout = useCallback(() => setConfirmLogout(false), []);

  const nav = ADMIN_NAV.filter((n) => can(role, n.permission));

  // Badge « Messages » : conversations qui attendent une réponse
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  useEffect(() => {
    if (!can(role, 'messages.view')) return undefined;
    let alive = true;
    const tick = () => getUnreadThreads().then((n) => { if (alive) setUnreadMsgs(n); });
    tick();
    const t = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [role, location.pathname]);
  const current = [...nav].sort((a, b) => b.to.length - a.to.length).find((n) => location.pathname.startsWith(n.to));

  const logout = async () => {
    setConfirmLogout(false);
    await doLogout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="app-shell adm">
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Menu administrateur">
        <div className="sidebar-logo">
          <img src="/margee-mark.svg" alt="" width="36" height="36" className="sidebar-logo-mark" />
          <span className="sidebar-logo-text">
            <span className="sidebar-logo-name">MARGEE+</span>
            <span className="sidebar-logo-tag">ADMINISTRATION</span>
          </span>
          <span className="adm-badge" aria-label="Espace administrateur">ADMIN</span>
          <button className="sidebar-close-btn" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="sidebar-section-title">PILOTAGE</div>
        <nav className="sidebar-nav">
          {nav.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <div className="sidebar-link-content">
                <i className={`ti ${l.icon}`} />
                <span>{l.label}</span>
              </div>
              {l.to === '/admin/messages' && unreadMsgs > 0 && (
                <span className="sidebar-badge" aria-label={`${unreadMsgs} conversation${unreadMsgs > 1 ? 's' : ''} en attente de réponse`}>{unreadMsgs}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-section-title">COMPTE</div>
        <nav className="sidebar-nav">
          <div className="adm-me">
            <span className="adm-me-email">{email}</span>
            <span className="adm-role">{ROLES[role]?.label || role}</span>
          </div>
          <button
            className="sidebar-link"
            type="button"
            onClick={() => setConfirmLogout(true)}
            aria-haspopup="dialog"
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div className="sidebar-link-content"><i className="ti ti-logout" /><span>Déconnexion</span></div>
          </button>
        </nav>
      </aside>
      {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />}

      <div className="main-area">
        <header className="topbar">
          <button className="topbar-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
            <i className="ti ti-menu-2" />
          </button>
          <div className="topbar-title">
            <i className={`ti ${current?.icon || 'ti-shield-lock'}`} aria-hidden="true" />
            <span>{current?.label || 'Administration'}</span>
          </div>
          <div className="topbar-actions">
            <span className="adm-badge adm-badge--top">ADMIN · {ROLES[role]?.label || role}</span>
          </div>
        </header>

        <main className="adm-main">
          <Outlet />
        </main>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        icon="ti-logout"
        title="Quitter l'administration ?"
        message="Tu seras déconnecté de l'espace administrateur."
        confirmLabel="Me déconnecter"
        onCancel={cancelLogout}
        onConfirm={logout}
      />
    </div>
  );
}
