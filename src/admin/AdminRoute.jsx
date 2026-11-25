import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAdminRole } from './adminApi';
import { can } from './permissions';

const AdminContext = createContext({ role: null, email: '' });
export const useAdmin = () => useContext(AdminContext);

/**
 * Protège toutes les routes /admin/*.
 * - Pas de session → /admin/login
 * - Session sans rôle admin → /admin/login avec « Accès refusé »
 * - permission (facultative) non accordée au rôle → retour à /admin
 * La base refait ces vérifications à chaque requête.
 */
export default function AdminRoute({ children, permission }) {
  const { account, ready } = useAuth();
  const location = useLocation();
  const [role, setRole] = useState(undefined); // undefined = en cours de vérification

  useEffect(() => {
    let cancelled = false;
    if (!ready) return undefined;
    if (!account) { setRole(null); return undefined; }
    getAdminRole()
      .then((r) => { if (!cancelled) setRole(r); })
      .catch(() => { if (!cancelled) setRole(null); });
    return () => { cancelled = true; };
  }, [ready, account]);

  if (!ready || role === undefined) return null;
  if (!account) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (!role) return <Navigate to="/admin/login" replace state={{ denied: true }} />;
  // Partenaire : uniquement son tableau (lecture seule)
  if (role === 'partner' && !location.pathname.startsWith('/admin/partenaire')) return <Navigate to="/admin/partenaire" replace />;
  if (permission && !can(role, permission)) return <Navigate to="/admin" replace />;

  return (
    <AdminContext.Provider value={{ role, email: account.email }}>
      {children}
    </AdminContext.Provider>
  );
}
