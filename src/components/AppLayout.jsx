import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import useBusinessData from '../hooks/useBusinessData';
import { generateInsights, generateActivity } from '../utils/insights';

const PAGE_TITLES = {
  '/app/dashboard': 'Dashboard',
  '/app/produits': 'Produits',
  '/app/ventes': 'Ventes',
  '/app/pubs': 'Pubs',
  '/app/depenses': 'Dépenses',
  '/app/investissements': 'Investissements',
  '/app/notes': 'Notes',
  '/app/challenges': 'Challenges',
  '/app/parametres': 'Paramètres',
};

const TYPE_ICON_CLASS = { up: 'notif-icon up', down: 'notif-icon down', warning: 'notif-icon warning', info: 'notif-icon info' };

export default function AppLayout() {
  const { account } = useAuth();
  const { sales, ads, investments, ready } = useBusinessData();
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = PAGE_TITLES[location.pathname] || 'Margee+';
  const [search, setSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'messages' | 'notifications'

  // Erreur non affichée par une page (enregistrement refusé, réseau…) :
  // on la montre dans un bandeau plutôt que de la laisser passer en silence.
  const [toast, setToast] = useState(null);
  useEffect(() => {
    let timer;
    const onRejection = (e) => {
      const message = e.reason?.message;
      if (!message) return;
      setToast(message);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 7000);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('unhandledrejection', onRejection); clearTimeout(timer); };
  }, []);
  const panelRef = useRef(null);

  const ownerName = account?.ownerName || account?.businessName || 'Mon compte';
  const ownerEmail = account?.email || '';
  const initials = ownerName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Recherche globale : ouvre la page Ventes filtrée (reçu, client ou produit)
  const submitSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/app/ventes?q=${encodeURIComponent(q)}` : '/app/ventes');
  };

  const insights = useMemo(() => (ready ? generateInsights(sales, ads, investments) : []), [ready, sales, ads, investments]);
  const activity = useMemo(() => (ready ? generateActivity(sales, ads, investments) : []), [ready, sales, ads, investments]);
  const alertCount = insights.filter((i) => i.type === 'down' || i.type === 'warning').length;

  useEffect(() => {
    function onClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setPanel(null);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}
      <div className="main-area">
        <header className="topbar">
          <button
            className="topbar-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <i className="ti ti-menu-2" />
          </button>

          <div className="topbar-title">
            <i className="ti ti-layout-dashboard" aria-hidden="true" />
            <span>{pageTitle}</span>
          </div>

          <div className="topbar-actions" ref={panelRef}>
            <form className="topbar-search" role="search" onSubmit={submitSearch}>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une vente…"
                aria-label="Rechercher une vente par reçu, client ou produit"
              />
              <button type="submit" className="topbar-search-btn" aria-label="Lancer la recherche">
                <i className="ti ti-search" />
              </button>
            </form>

            <div className="topbar-dropdown-wrap">
              <button
                className="topbar-icon-btn"
                title="Activité"
                aria-label="Activité récente"
                onClick={() => setPanel(panel === 'messages' ? null : 'messages')}
              >
                <i className="ti ti-mail" />
                {activity.length > 0 && <span className="topbar-icon-dot" />}
              </button>
              {panel === 'messages' && (
                <div className="topbar-dropdown">
                  <div className="topbar-dropdown-title">Activité récente</div>
                  {activity.length === 0 ? (
                    <div className="topbar-dropdown-empty">Aucune activité pour l'instant.</div>
                  ) : (
                    activity.map((item, i) => (
                      <div className="notif-item" key={i}>
                        <div className="notif-icon info"><i className={`ti ${item.icon}`} /></div>
                        <div>
                          <div className="notif-title">{item.title}</div>
                          <div className="notif-detail">{item.detail}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="topbar-dropdown-wrap">
              <button
                className="topbar-icon-btn"
                title="Notifications"
                aria-label="Notifications"
                onClick={() => setPanel(panel === 'notifications' ? null : 'notifications')}
              >
                <i className="ti ti-bell" />
                {alertCount > 0 && <span className="topbar-icon-badge">{alertCount}</span>}
              </button>
              {panel === 'notifications' && (
                <div className="topbar-dropdown">
                  <div className="topbar-dropdown-title">Notifications</div>
                  {insights.map((item, i) => (
                    <div className="notif-item" key={i}>
                      <div className={TYPE_ICON_CLASS[item.type]}><i className={`ti ${item.icon}`} /></div>
                      <div>
                        <div className="notif-title">{item.title}</div>
                        <div className="notif-detail">{item.detail}</div>
                      </div>
                    </div>
                  ))}
                  <Link to="/app/dashboard" className="topbar-dropdown-footer" onClick={() => setPanel(null)}>
                    Voir le dashboard complet
                  </Link>
                </div>
              )}
            </div>

            <div className="topbar-user-menu">
              <div className="topbar-avatar">
                {initials}
              </div>
              <div className="topbar-user-info">
                <span className="topbar-user-name">{ownerName}</span>
                {ownerEmail && <span className="topbar-user-email">{ownerEmail}</span>}
              </div>
            </div>
          </div>
        </header>

        <main>
          <Outlet />
        </main>

        {toast && (
          <div className="app-toast" role="alert">
            <i className="ti ti-alert-circle" aria-hidden="true" />
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Fermer le message">
              <i className="ti ti-x" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
