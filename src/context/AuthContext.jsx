import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.getCurrentAccount().then((a) => {
      setAccount(a);
      setReady(true);
    });
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
    // signup doesn't create a session by itself — go straight to login flow
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
