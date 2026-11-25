import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyPartnerAccess, isSubscriptionActive } from '../services/api';
import Partner from '../admin/pages/Partner';
import '../admin/admin.css';
import '../styles/dashboard.css';

/**
 * Tableau partenaire pour un compte normal (e-commerçant ou partenaire
 * invité) : mêmes chiffres que dans l'admin, sans aucun accès admin.
 * Accessible même sans abonnement actif.
 */
export default function PartnerBoard() {
  const { account, doLogout } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState(undefined);

  useEffect(() => {
    let alive = true;
    getMyPartnerAccess().then((a) => { if (alive) setAccess(a); }).catch(() => { if (alive) setAccess(false); });
    return () => { alive = false; };
  }, []);

  if (access === undefined) return null;
  if (!access) return <Navigate to="/app/dashboard" replace />;

  const logout = async () => { await doLogout(); navigate('/connexion', { replace: true }); };

  return (
    <div className="pb-shell">
      <header className="pb-header">
        <Link to="/" className="pb-logo" aria-label="Margee+ — accueil">
          <img src="/margee-mark.svg" alt="" width="34" height="34" />
          <span>MARGEE+ <em>Partenaire</em></span>
        </Link>
        <div className="pb-actions">
          {isSubscriptionActive(account) && (
            <Link to="/app/dashboard" className="btn btn-outline btn-sm"><i className="ti ti-building-store" aria-hidden="true" /> Mon espace</Link>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}><i className="ti ti-logout" aria-hidden="true" /> Déconnexion</button>
        </div>
      </header>
      <main className="pb-main">
        <Partner />
      </main>
    </div>
  );
}
