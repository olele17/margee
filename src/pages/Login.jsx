import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSubscriptionActive } from '../services/api';

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
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-logo">⚡ EASY SWAP</div>
          <div className="auth-tagline">Connexion</div>
        </div>
        <form className="auth-body" onSubmit={submit}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@email.com" />
          </div>
          <div className="field" style={{ marginBottom: 6 }}>
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn btn-dark btn-lg btn-block" style={{ marginTop: 16 }} disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
          {err && <div className="auth-err">{err}</div>}
          <div className="auth-switch">
            Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
