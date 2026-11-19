import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../services/api';
import AuthShell from '../components/AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('Saisis une adresse email valide.'); return; }
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell label="Mot de passe oublié" title="Regarde ta boîte mail" subtitle="Le lien est valable une heure.">
        <div className="au-info" role="status">
          <i className="ti ti-mail-check" aria-hidden="true" />
          <p>
            Si un compte existe avec <strong>{email.trim()}</strong>, tu vas recevoir un lien pour choisir un nouveau mot de passe.
          </p>
        </div>
        <p className="au-demo-note">Pas reçu ? Regarde dans les spams, ou réessaie dans une minute.</p>
        <Link to="/connexion" className="au-btn au-btn--gold" style={{ marginTop: 18 }}>Retour à la connexion</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell label="Mot de passe oublié" title="Réinitialise ton mot de passe" subtitle="Saisis l'email de ton compte : on t'envoie un lien.">
      <form className="au-form" onSubmit={submit} noValidate>
        <div className="au-field">
          <label htmlFor="fp-email">Email</label>
          <input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@email.com" />
        </div>
        {err && <div className="au-err" role="alert">{err}</div>}
        <button className="au-btn au-btn--gold" disabled={loading}>
          {loading ? 'Envoi…' : 'Recevoir le lien'}
        </button>
      </form>
      <div className="au-switch">
        Tu t'en souviens ? <Link to="/connexion">Se connecter</Link>
      </div>
    </AuthShell>
  );
}
