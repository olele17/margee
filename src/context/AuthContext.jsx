import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../services/api';

const AuthContext = createContext(null);

/**
 * Session de l'utilisateur, branchée sur Supabase Auth (via api.js).
 * Expose la même interface qu'avant : account, ready, refresh, doLogin,
 * doSignup, doLogout. ProtectedRoute garde la même logique d'abonnement.
 */
export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await api.getCurrentAccount();
      setAccount(a);
      return a;
    } catch {
      // Réseau indisponible ou profil illisible : on reste déconnecté
      setAccount(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
    // Connexion / déconnexion depuis un autre onglet, session expirée,
    // retour par un lien de confirmation ou de réinitialisation.
    // Les appels Supabase sont différés (setTimeout) : la doc Supabase
    // déconseille d'attendre une requête dans ce rappel.
    return api.onAuthChange((event) => {
      if (event === 'SIGNED_OUT') { setAccount(null); return; }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        setTimeout(load, 0);
      }
    });
  }, [load]);

  const refresh = useCallback(async () => {
    const a = await api.getCurrentAccount();
    setAccount(a);
    return a;
  }, []);

  const doLogin = useCallback(async (email, password, captchaToken) => {
    const a = await api.login(email, password, captchaToken);
    setAccount(a);
    return a;
  }, []);

  // Si Supabase ouvre une session dès l'inscription (confirmation d'email
  // désactivée), on charge le compte ; sinon l'utilisateur doit d'abord
  // confirmer son email (needsEmailConfirmation).
  const doSignup = useCallback(async (data) => {
    const result = await api.signup(data);
    if (!result.needsEmailConfirmation) {
      const a = await api.getCurrentAccount();
      setAccount(a);
    }
    return result;
  }, []);

  const doLogout = useCallback(async () => {
    setAccount(null);
    await api.logout();
  }, []);

  return (
    <AuthContext.Provider value={{ account, ready, refresh, doLogin, doSignup, doLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
