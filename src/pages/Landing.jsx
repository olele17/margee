import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div>
      <nav className="landing-nav">
        <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, color: 'var(--emerald-bright)', letterSpacing: 2 }}>
          ⚡ EASY SWAP
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/connexion" className="btn btn-ghost">Se connecter</Link>
          <Link to="/inscription" className="btn btn-primary">Démarrer</Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div>
          <h1>
            Gère ton business e-commerce <span className="accent">de A à Z</span>.
          </h1>
          <p>
            Produits, ventes, reçus automatiques, pubs dépensées, investissements et ROI —
            tout au même endroit. Inscris-toi et lance ton espace en quelques minutes.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/inscription" className="btn btn-primary btn-lg">
              Créer mon compte →
            </Link>
            <Link to="/connexion" className="btn btn-ghost btn-lg" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}>
              J'ai déjà un compte
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
