import { useCallback, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from './ConfirmDialog';
import InstallButton from '../pwa/InstallButton';
import usePlans from '../hooks/usePlans';
import { getPlanOffer } from '../utils/planOffer';
import { fmt } from '../utils/calc';

const MENU_LINKS = [
  { to: '/app/dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
  { to: '/app/produits', icon: 'ti-package', label: 'Produits' },
  { to: '/app/ventes', icon: 'ti-receipt', label: 'Ventes' },
  { to: '/app/documents', icon: 'ti-file-invoice', label: 'Factures & devis' },
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
  const { doLogout, account } = useAuth();
  const catalog = usePlans();
  const offer = getPlanOffer(account, catalog);
  // Encart d'abonnement : essai, plan Pro (passer à Elite) ou abonnement expiré
  const showOffer = !!offer.action && (offer.action.kind === 'upgrade' || offer.expired);
  const target = offer.action ? catalog.all[offer.action.plan] : null;
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
        {/* Visible tant que l'application n'est pas installée */}
        <InstallButton className="sidebar-link sidebar-install" onDone={onClose}>
          <div className="sidebar-link-content">
            <i className="ti ti-device-mobile-down" aria-hidden="true" />
            <span>Installer l'app</span>
          </div>
        </InstallButton>
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

      {showOffer && target && (
        <div className="sidebar-cta-card" role="region" aria-label="Abonnement">
          <div className="sidebar-cta-icon" aria-hidden="true"><i className="ti ti-crown" /></div>
          <div className="sidebar-cta-label">
            {offer.trialActive
              ? `Essai gratuit · ${offer.daysLeft} jour${offer.daysLeft > 1 ? 's' : ''}`
              : offer.paidActive
                ? `Plan ${offer.currentLabel}${offer.endsAt ? ` · jusqu'au ${new Date(offer.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}`
                : 'Abonnement expiré'}
          </div>
          <div className="sidebar-cta-title">{target.label}</div>
          <div className="sidebar-cta-sub">
            {fmt(target.price)} / mois
            {target.receiptLimit == null ? ' · reçus illimités' : ` · ${target.receiptLimit} reçus / mois`}
          </div>
          <Link to={offer.href} className="sidebar-cta-btn" onClick={onClose}>
            {offer.action.label} <i className="ti ti-arrow-right" aria-hidden="true" style={{ marginLeft: 6 }} />
          </Link>
        </div>
      )}

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
