import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { finishGoogleLogin, isSubscriptionActive, getMyPartnerAccess } from '../services/api';
import AuthShell from '../components/AuthShell';

/**
 * Retour de Google : Supabase ouvre la session (jeton dans l'URL), puis
 * on rattache le parrain éventuel et on envoie au bon écran.
 */
export default function GoogleCallback() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await finishGoogleLogin();
        const account = await refresh();
        if (!alive) return;
        if (!account) throw new Error('Connexion Google impossible. Réessaie.');
        if (isSubscriptionActive(account)) { navigate('/app/dashboard', { replace: true }); return; }
        const partner = await getMyPartnerAccess().catch(() => false);
        navigate(partner ? '/partenaire' : '/abonnement', { replace: true });
      } catch (e) {
        if (alive) setErr(e.message);
      }
    })();
    return () => { alive = false; };
  }, [navigate, refresh]);

  if (!err) {
    return (
      <AuthShell label="Google" title="Connexion en cours…" subtitle="Encore un instant, on ouvre ton espace.">
        <div className="au-info" role="status"><i className="ti ti-loader-2" aria-hidden="true" /><p>Vérification de ton compte Google.</p></div>
      </AuthShell>
    );
  }
  return (
    <AuthShell label="Google" title="Connexion impossible" subtitle="La connexion avec Google n'a pas abouti.">
      <div className="au-err" role="alert">{err}</div>
      <Link to="/connexion" className="au-btn au-btn--gold" style={{ marginTop: 18 }}>Retour à la connexion</Link>
    </AuthShell>
  );
}
