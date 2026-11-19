import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../services/api';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // onAuthStateChange émet immédiatement l'état courant (session existante ou non)
    // à l'abonnement, puis à chaque connexion/déconnexion/rafraîchissement de session —
    // pas besoin d'un appel getSession() séparé au montage.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAccount(null);
        setReady(true);
      } else {
        api.getCurrentAccount().then((a) => {
          setAccount(a);
          setReady(true);
        });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const a = await api.getCurrentAccount();
    setAccount(a);
    return a;
  }, []);

  const doLogin = useCallback(async (email, password) => {
    const a = await api.login(email, password);
    setAccount(a);
    return a;
  }, []);

  const doSignup = useCallback(async (data) => {
    const a = await api.signup(data);
    // signup ne crée pas de session automatiquement — go straight to login flow
    return a;
  }, []);

  const doLogout = useCallback(() => {
    api.logout();
    setAccount(null);
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
