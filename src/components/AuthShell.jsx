import { Link } from 'react-router-dom';
import '../styles/auth.css';

/**
 * Cadre visuel des pages d'accès (connexion, inscription, abonnement) :
 * panneau de marque noir et or à gauche, contenu sur fond crème à droite.
 * Purement visuel : chaque page garde sa propre logique.
 */
export default function AuthShell({ label, title, subtitle, wide = false, children }) {
  return (
    <div className="au">
      <aside className="au-brand">
        <Link to="/" className="au-logo" aria-label="Margee+ — retour à l'accueil">
          <img src="/margee-mark.svg" alt="" width="40" height="40" />
          <span className="au-logo-text">
            <span className="au-logo-name">MARGEE+</span>
            <span className="au-mono au-logo-tag">GÈRE · VENDS · SCALE</span>
          </span>
        </Link>

        <div className="au-brand-copy">
          <span className="au-mono au-brand-label">SUIVI MARGE · VENTES · ROI</span>
          <p className="au-brand-title">Connais ta <span>vraie marge</span>, vente après vente.</p>
          <ul className="au-brand-points">
            <li>Bénéfice calculé à chaque vente</li>
            <li>Reçu PDF numéroté automatiquement</li>
            <li>Pubs et investissements déduits de ta marge</li>
          </ul>
        </div>

        <div className="au-receipt" aria-hidden="true">
          <div className="au-receipt-head">
            <span className="au-mono">REÇU · EXEMPLE</span>
            <span className="au-stamp">VALIDÉ</span>
          </div>
          <div className="au-receipt-row"><span>Sac à main cuir × 1</span><b>18&nbsp;500 F</b></div>
          <div className="au-receipt-row"><span>Coût de revient</span><span>−9&nbsp;500 F</span></div>
          <div className="au-receipt-total"><span>Bénéfice</span><b>9&nbsp;000 F</b></div>
        </div>
      </aside>

      <main className="au-main">
        <div className={`au-panel${wide ? ' au-panel--wide' : ''}`}>
          {label && <span className="au-mono au-label">{label}</span>}
          <h1 className="au-title">{title}</h1>
          {subtitle && <p className="au-subtitle">{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
