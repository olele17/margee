import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import useBusinessData from '../hooks/useBusinessData';
import { generateInsights, generateActivity } from '../utils/insights';

const TYPE_ICON_CLASS = { up: 'notif-icon up', down: 'notif-icon down', warning: 'notif-icon warning', info: 'notif-icon info' };

export default function AppLayout() {
  const { account } = useAuth();
  const { sales, ads, investments, ready } = useBusinessData();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'messages' | 'notifications'
  const panelRef = useRef(null);

  const ownerName = account?.ownerName || 'Totok Michael';
  const ownerEmail = account?.email || 'tmichael20@mail.com';
  const initials = ownerName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

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

          <div className="topbar-actions" ref={panelRef}>
            <div className="topbar-dropdown-wrap">
              <button
                className="topbar-icon-btn"
                title="Activité"
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
                <span className="topbar-user-email">{ownerEmail}</span>
              </div>
            </div>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
