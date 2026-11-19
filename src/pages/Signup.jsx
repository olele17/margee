import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/AuthShell';

export default function Signup() {
  const { doSignup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    ownerName: '', businessName: '', phone: '', email: '', password: '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.ownerName || !form.businessName || !form.phone || !form.email || !form.password) {
      setErr('Remplis tous les champs.');
      return;
    }
    setLoading(true);
    try {
      const result = await doSignup(form);
      if (result.needsEmailConfirmation) {
        // Supabase envoie un email de confirmation : pas de session avant le clic
        setConfirmEmail(form.email);
        return;
      }
      navigate('/abonnement');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  if (confirmEmail) {
    return (
      <AuthShell label="Inscription" title="Vérifie ta boîte mail" subtitle="Ton compte est créé, il ne reste qu'une étape.">
        <div className="au-info" role="status">
          <i className="ti ti-mail-check" aria-hidden="true" />
          <p>
            Nous avons envoyé un lien de confirmation à <strong>{confirmEmail}</strong>.
            Clique dessus, puis connecte-toi pour choisir ton plan.
          </p>
        </div>
        <p className="au-demo-note">Pas reçu ? Regarde dans les spams, ou attends une minute avant de réessayer.</p>
        <Link to="/connexion" className="au-btn au-btn--gold" style={{ marginTop: 18 }}>Aller à la connexion</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell label="Inscription" title="Crée ton espace business" subtitle="Quelques infos et tu enregistres ta première vente.">
      <form className="au-form" onSubmit={submit}>
        <div className="au-row-2">
          <div className="au-field">
            <label htmlFor="su-owner">Ton nom</label>
            <input id="su-owner" autoComplete="name" value={form.ownerName} onChange={set('ownerName')} placeholder="Prénom Nom" />
          </div>
          <div className="au-field">
            <label htmlFor="su-phone">Téléphone</label>
            <input id="su-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="77 000 00 00" />
          </div>
        </div>
        <div className="au-field">
          <label htmlFor="su-business">Nom de ta boutique</label>
          <input id="su-business" autoComplete="organization" value={form.businessName} onChange={set('businessName')} placeholder="Ex : Fatou Boutique" />
        </div>
        <div className="au-field">
          <label htmlFor="su-email">Email</label>
          <input id="su-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="toi@email.com" />
        </div>
        <div className="au-field">
          <label htmlFor="su-password">Mot de passe</label>
          <input id="su-password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} placeholder="••••••••" />
        </div>
        {err && <div className="au-err" role="alert">{err}</div>}
        <button className="au-btn au-btn--gold" disabled={loading}>
          {loading ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
      <div className="au-switch">
        Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
      </div>
    </AuthShell>
  );
}
