import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSubscriptionActive, resetDemoAccount } from '../services/api';
import AuthShell from '../components/AuthShell';

export default function Login() {
  const { doLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const account = await doLogin(email, password);
      navigate(isSubscriptionActive(account) ? '/app/dashboard' : '/abonnement');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  // Démo : (re)crée le compte d'exemple puis connecte directement
  const openDemo = async () => {
    setErr('');
    setDemoLoading(true);
    try {
      const creds = await resetDemoAccount();
      await doLogin(creds.email, creds.password);
      navigate('/app/dashboard');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AuthShell label="Connexion" title="Content de te revoir" subtitle="Connecte-toi pour retrouver ton espace business.">
      <form className="au-form" onSubmit={submit}>
        <div className="au-field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@email.com" />
        </div>
        <div className="au-field">
          <label htmlFor="login-password">Mot de passe</label>
          <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {err && <div className="au-err" role="alert">{err}</div>}
        <button className="au-btn au-btn--gold" disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <div className="au-divider">ou</div>
      <button type="button" className="au-btn au-btn--ghost" onClick={openDemo} disabled={demoLoading}>
        {demoLoading ? 'Préparation de la démo…' : 'Explorer la démo'}
      </button>
      <p className="au-demo-note">Un compte d'exemple déjà rempli, remis à zéro à chaque ouverture.</p>

      <div className="au-switch">
        Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
      </div>
    </AuthShell>
  );
}
