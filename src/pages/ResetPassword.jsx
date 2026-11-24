import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasSession, updatePassword, isSubscriptionActive } from '../services/api';
import { getAdminRole } from '../admin/adminApi';
import AuthShell from '../components/AuthShell';

/**
 * Page ouverte depuis le lien reçu par email. Supabase lit le jeton dans
 * l'URL et ouvre une session temporaire de récupération ; l'utilisateur
 * choisit alors son nouveau mot de passe.
 */
export default function ResetPassword() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  // Lien d'invitation : membre de l'équipe (=1) ou e-commerçant (=boutique)
  const invParam = useSearchParams()[0].get('invitation');
  const invitation = invParam === '1';
  const shopInvite = invParam === 'boutique';
  const [status, setStatus] = useState('checking'); // checking | ready | invalid
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Laisse à Supabase le temps de lire le jeton présent dans l'URL
    const check = async (attempt = 0) => {
      const ok = await hasSession().catch(() => false);
      if (cancelled) return;
      if (ok) setStatus('ready');
      else if (attempt < 6) setTimeout(() => check(attempt + 1), 500);
      else setStatus('invalid');
    };
    check();
    return () => { cancelled = true; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) { setErr('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (password !== confirm) { setErr('Les deux mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      await updatePassword(password);
      const account = await refresh();
      // Membre de l'équipe : direction l'espace admin
      const role = await getAdminRole().catch(() => null);
      if (role) { navigate('/admin', { replace: true }); return; }
      navigate(isSubscriptionActive(account) ? '/app/dashboard' : '/abonnement', { replace: true });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <AuthShell label="Nouveau mot de passe" title="Vérification du lien…" subtitle="Un instant.">
        <div className="au-info" role="status"><i className="ti ti-loader-2" aria-hidden="true" /><p>On vérifie ton lien de réinitialisation.</p></div>
      </AuthShell>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthShell label={invitation || shopInvite ? "Invitation" : "Nouveau mot de passe"} title="Lien invalide ou expiré" subtitle={invitation ? "Ce lien d'invitation a déjà servi ou a expiré. Demande une nouvelle invitation au super admin." : shopInvite ? "Ce lien d'invitation a déjà servi ou a expiré. Demande un nouveau lien à l'équipe Margee+, ou utilise « mot de passe oublié » avec ton adresse." : "Les liens de réinitialisation ne servent qu'une fois et expirent après une heure."}>
        <Link to="/mot-de-passe-oublie" className="au-btn au-btn--gold">Demander un nouveau lien</Link>
        <div className="au-switch"><Link to="/connexion">Retour à la connexion</Link></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell label={invitation ? "Équipe Margee+" : shopInvite ? "Invitation" : "Nouveau mot de passe"} title={invitation ? "Bienvenue dans l'équipe" : shopInvite ? "Bienvenue sur Margee+" : "Choisis ton nouveau mot de passe"} subtitle={invitation ? "Choisis ton mot de passe pour accéder à l'espace admin (8 caractères minimum)." : shopInvite ? "Choisis ton mot de passe pour accéder à ton espace (8 caractères minimum)." : "8 caractères minimum."}>
      <form className="au-form" onSubmit={submit} noValidate>
        <div className="au-field">
          <label htmlFor="rp-password">Nouveau mot de passe</label>
          <input id="rp-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="au-field">
          <label htmlFor="rp-confirm">Confirme le mot de passe</label>
          <input id="rp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
        </div>
        {err && <div className="au-err" role="alert">{err}</div>}
        <button className="au-btn au-btn--gold" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer et me connecter'}
        </button>
      </form>
    </AuthShell>
  );
}
