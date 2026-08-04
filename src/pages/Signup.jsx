import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const { doSignup, doLogin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    ownerName: '', businessName: '', phone: '', email: '', password: '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

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
      await doSignup(form);
      await doLogin(form.email, form.password);
      navigate('/abonnement');
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
          <div className="auth-tagline">Crée ton espace business</div>
        </div>
        <form className="auth-body" onSubmit={submit}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Ton nom</label>
            <input value={form.ownerName} onChange={set('ownerName')} placeholder="Prénom Nom" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Nom de ton business</label>
            <input value={form.businessName} onChange={set('businessName')} placeholder="Ex: Fatou Boutique" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Téléphone</label>
            <input value={form.phone} onChange={set('phone')} placeholder="77 000 00 00" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Email</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="toi@email.com" />
          </div>
          <div className="field" style={{ marginBottom: 6 }}>
            <label>Mot de passe</label>
            <input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" />
          </div>
          <button className="btn btn-dark btn-lg btn-block" style={{ marginTop: 16 }} disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
          {err && <div className="auth-err">{err}</div>}
          <div className="auth-switch">
            Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
