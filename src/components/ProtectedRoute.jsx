import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSubscriptionActive } from '../services/api';

/**
 * Wrap any private page with this. requireActiveSub=true blocks access
 * until the account's subscription is active (used for the whole
 * business-management area).
 */
export default function ProtectedRoute({ children, requireActiveSub = true }) {
  const { account, ready } = useAuth();

  if (!ready) return null; // could render a spinner here
  if (!account) return <Navigate to="/connexion" replace />;
  if (requireActiveSub && !isSubscriptionActive(account)) {
    return <Navigate to="/abonnement" replace />;
  }
  return children;
}
