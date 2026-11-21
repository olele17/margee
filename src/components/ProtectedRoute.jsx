import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSubscriptionActive } from '../services/api';
import AuthShell from './AuthShell';

/**
 * Compte suspendu par l'équipe Margee+ : aucune page privée n'est
 * accessible (ni l'espace, ni le choix d'un plan). La base refuse de
 * toute façon les écritures d'un compte suspendu.
 */
function SuspendedScreen() {
  const { doLogout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell label="COMPTE SUSPENDU" title="Accès suspendu" subtitle="Ton compte est suspendu, contacte le support.">
      <div className="au-info" role="alert">
        Tes données sont conservées. L'accès à ton espace sera rétabli dès que le support aura réactivé ton compte.
      </div>
      <button
        type="button"
        className="au-btn"
        disabled={busy}
        onClick={async () => { setBusy(true); await doLogout(); navigate('/connexion', { replace: true }); }}
      >
        Se déconnecter
      </button>
    </AuthShell>
  );
}

/**
 * Wrap any private page with this. requireActiveSub=true blocks access
 * until the account's subscription is active (used for the whole
 * business-management area).
 */
export default function ProtectedRoute({ children, requireActiveSub = true }) {
  const { account, ready } = useAuth();

  if (!ready) return null; // could render a spinner here
  if (!account) return <Navigate to="/connexion" replace />;
  if (account.subscription?.status === 'suspended') return <SuspendedScreen />;
  if (requireActiveSub && !isSubscriptionActive(account)) {
    return <Navigate to="/abonnement" replace />;
  }
  return children;
}
