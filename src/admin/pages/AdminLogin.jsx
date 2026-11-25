import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthShell from '../../components/AuthShell';
import { getAdminRole } from '../adminApi';
import Turnstile, { captchaEnabled, CAPTCHA_WAIT } from '../../components/Turnstile';

/**
 * Connexion à l'espace admin (Supabase Auth, email + mot de passe).
 * L'accès n'est accordé que si le compte figure dans la table admins ;
 * sinon il est déconnecté et voit « Accès refusé ».
 */
export default function AdminLogin() {
  const { doLogin, doLogout, account } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(location.state?.denied ? 'Accès refusé : ce compte n\'a pas accès à l\'administration.' : '');
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (captchaEnabled && !captcha) { setErr(CAPTCHA_WAIT); return; }
    setLoading(true);
    try {
      await doLogin(email, password, captcha);
      const role = await getAdminRole();
      if (!role) {
        await doLogout();
        setErr('Accès refusé : ce compte n\'a pas accès à l\'administration.');
        return;
      }
      navigate(location.state?.from && location.state.from.startsWith('/admin') ? location.state.from : '/admin', { replace: true });
    } catch (e2) {
      setErr(e2.message);
      setCaptchaKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell label="Administration Margee+" title="Espace administrateur" subtitle="Connexion réservée à l'équipe Margee+.">
      {account && location.state?.denied && (
        <div className="au-info" role="status">
          <i className="ti ti-user-exclamation" aria-hidden="true" />
          <p>Tu es connecté avec <strong>{account.email}</strong>, qui n'est pas un compte administrateur. Connecte-toi ci-dessous avec un compte admin.</p>
        </div>
      )}
      <form className="au-form" onSubmit={submit}>
        <div className="au-field">
          <label htmlFor="adm-email">Email</label>
          <input id="adm-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="au-field">
          <label htmlFor="adm-password">Mot de passe</label>
          <input id="adm-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Turnstile onToken={setCaptcha} resetKey={captchaKey} />
        {err && <div className="au-err" role="alert">{err}</div>}
        <button className="au-btn au-btn--gold" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      <div className="au-switch"><Link to="/">Retour au site</Link></div>
    </AuthShell>
  );
}
