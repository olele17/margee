import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSubscriptionActive } from '../services/api';
import AuthShell from '../components/AuthShell';

export default function Login() {
  const { doLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <AuthShell label="Connexion" title="Content de te revoir" subtitle="Connecte-toi pour retrouver ton espace business.">
      <form className="au-form" onSubmit={submit}>
        <div className="au-field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@email.com" />
        </div>
        <div className="au-field">
          <div className="au-field-row">
            <label htmlFor="login-password">Mot de passe</label>
            <Link to="/mot-de-passe-oublie" className="au-link-small">Mot de passe oublié ?</Link>
          </div>
          <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {err && <div className="au-err" role="alert">{err}</div>}
        <button className="au-btn au-btn--gold" disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <div className="au-switch">
        Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
      </div>
    </AuthShell>
  );
}
