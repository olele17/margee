import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ANNUAL_MONTHS_PAID, annualPrice } from '../services/api';
import usePlans from '../hooks/usePlans';
import InstallButton from '../pwa/InstallButton';
import './Landing.css';

/* ── Icônes outline (style lucide, trait fin) ───────────────── */
const ICONS = {
  box: <><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6" /></>,
  receipt: <><path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  megaphone: <><path d="M3 10.5v3a1 1 0 0 0 1 1h3l7 4.5v-14L7 9.5H4a1 1 0 0 0-1 1Z" /><path d="M18 8.5a5 5 0 0 1 0 7" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  layout: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.6" /><path d="M12 17h.01" /></>,
  scatter: <><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

function Icon({ name, size = 22 }) {
  return (
    <svg className="lp-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

// Montants : séparateur de milliers = espace insécable (2 400)
const money = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function Logo({ dark = true }) {
  return (
    <Link to="/" className={`lp-logo${dark ? '' : ' lp-logo--light'}`} aria-label="Margee+ — accueil">
      <img src="/margee-mark.svg" alt="" width="40" height="40" />
      <span className="lp-logo-text">
        <span className="lp-logo-name">MARGEE+</span>
        <span className="lp-mono lp-logo-tag">GÈRE · VENDS · SCALE</span>
      </span>
    </Link>
  );
}

/* ── Contenus ───────────────────────────────────────────────── */
const PROBLEMS = [
  { icon: 'help', title: 'Tu ne connais pas ta vraie marge', text: 'Sans le coût de revient et les pubs, ton bénéfice est une estimation.' },
  { icon: 'scatter', title: 'Tes chiffres sont éparpillés', text: 'Cahier, notes du téléphone, WhatsApp… impossible de comparer tes mois.' },
  { icon: 'pen', title: 'Tu fais tes reçus à la main', text: 'Du temps perdu et une image peu professionnelle face au client.' },
];

const FEATURES = [
  { icon: 'box', title: 'Produits et coût de revient', text: 'Ta marge calculée sur chaque produit.' },
  { icon: 'cart', title: 'Ventes en un clic', text: 'Chaque vente calcule ton bénéfice automatiquement.' },
  { icon: 'receipt', title: 'Reçus automatiques', text: 'Un reçu PDF numéroté à chaque vente, prêt à envoyer au client.' },
  { icon: 'megaphone', title: 'Pubs dépensées', text: 'Tes dépenses pub déduites de ton bénéfice réel.' },
  { icon: 'trend', title: 'Investissements et ROI', text: 'Sache ce que chaque franc investi te rapporte.' },
  { icon: 'layout', title: 'Tableau de bord', text: 'CA, bénéfice et comparaison mois par mois.' },
];

const STEPS = [
  { n: '01', title: 'Crée ton compte gratuitement' },
  { n: '02', title: 'Ajoute tes produits et leur coût de revient' },
  { n: '03', title: 'Enregistre tes ventes et suis ta marge en temps réel' },
];

const FAQ = [
  { q: 'Est-ce que je dois savoir faire de la comptabilité ?', a: 'Non. Tu saisis tes produits, tes ventes et tes dépenses : Margee+ fait tous les calculs à ta place.' },
  { q: 'Mes données sont-elles privées ?', a: 'Oui. Chaque e-commerçant a son espace personnel, personne d\'autre n\'y a accès.' },
  { q: 'Comment je paie mon abonnement ?', a: 'Paiement en ligne sécurisé, avec activation automatique de ton abonnement.' },
  { q: 'Que se passe-t-il après mes reçus gratuits ?', a: 'Le plan Free te permet de tester avec quelques reçus. Pour continuer, tu choisis Pro ou Elite.' },
  { q: 'Je peux l\'utiliser sur mon téléphone ?', a: 'Oui. Margee+ s\'installe comme une application sur ton téléphone, Android ou iPhone, sans passer par un store : touche « Installer l\'app » en haut de cette page (sur mobile) ou dans le menu de ton espace. Elle s\'ouvre ensuite en plein écran depuis ton écran d\'accueil. Si tu arrives depuis TikTok ou WhatsApp, ouvre d\'abord le lien dans Chrome (Android) ou Safari (iPhone).' },
];

const NAV = [
  { href: '#fonctionnalites', label: 'Fonctionnalités' },
  { href: '#comment', label: 'Comment ça marche' },
  { href: '#tarifs', label: 'Tarifs' },
  { href: '#faq', label: 'FAQ' },
];

/* ── Apparition au scroll ───────────────────────────────────── */
function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let pending = [...root.querySelectorAll('.lp-reveal')];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      pending.forEach((el) => el.classList.add('lp-in'));
      return;
    }
    // Révèle tout bloc dont le haut est entré dans l'écran, y compris ceux
    // dépassés lors d'un défilement rapide (un IntersectionObserver les rate).
    let frame = 0;
    const check = () => {
      frame = 0;
      const limit = window.innerHeight * 0.92;
      pending = pending.filter((el) => {
        if (el.getBoundingClientRect().top < limit) { el.classList.add('lp-in'); return false; }
        return true;
      });
      if (!pending.length) detach();
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check); };
    const detach = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    check();
    return () => { detach(); if (frame) cancelAnimationFrame(frame); };
  }, [rootRef]);
}

/* ── Maquette du tableau de bord (HTML/CSS) ─────────────────── */
const MOCK_BARS = [
  { m: 'Juin', h: 42 }, { m: 'Juil', h: 55 }, { m: 'Août', h: 48 },
  { m: 'Sept', h: 68 }, { m: 'Oct', h: 74 }, { m: 'Nov', h: 92 },
];

function DashboardMock() {
  return (
    <div className="lp-mock" role="img" aria-label="Exemple de tableau de bord Margee+ : chiffre d'affaires, bénéfice, pubs, ROI et ventes sur 6 mois">
      <div className="lp-mock-head">
        <span className="lp-mock-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="lp-mono lp-mock-flag">Exemple</span>
      </div>
      <div className="lp-mock-kpis">
        <div className="lp-mock-kpi"><span>CA du mois</span><strong>485&nbsp;000 F</strong><em>+12 %</em></div>
        <div className="lp-mock-kpi"><span>Bénéfice</span><strong>142&nbsp;300 F</strong><em>+8 %</em></div>
        <div className="lp-mock-kpi"><span>Pubs dépensées</span><strong>38&nbsp;500 F</strong></div>
        <div className="lp-mock-kpi"><span>ROI</span><strong>+36 %</strong></div>
      </div>
      <div className="lp-mock-chart">
        <div className="lp-mock-chart-title">Bénéfice · 6 derniers mois</div>
        <div className="lp-mock-bars">
          {MOCK_BARS.map((b) => (
            <div key={b.m} className="lp-mock-bar">
              <div className="lp-mock-bar-fill" style={{ height: `${b.h}%` }} />
              <span>{b.m}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="lp-mock-receipt">
        <div className="lp-mock-receipt-icon"><Icon name="check" size={16} /></div>
        <div>
          <div className="lp-mock-receipt-title">Vente enregistrée ✓</div>
          <div className="lp-mock-receipt-sub">Reçu n° 0042 · Sac en cuir × 1 · 18&nbsp;500 F</div>
        </div>
      </div>
    </div>
  );
}

/* ── Carte tarif (aussi utilisée par l'aperçu de /admin/plans) ── */
export function PlanCard({ planKey, plan, yearly = false, annualMonths = ANNUAL_MONTHS_PAID, preview = false }) {
  const featured = !!plan.highlight;
  const paid = plan.price > 0;
  const freeMonths = 12 - annualMonths;
  // Prix barré : celui saisi dans l'admin (mensuel), ou 12 mois en annuel
  const oldPrice = yearly ? plan.price * 12 : plan.oldPrice;
  const cta = paid ? `Choisir ${plan.label}` : 'Commencer gratuitement';
  const btnClass = `lp-btn ${featured ? 'lp-btn--gold' : 'lp-btn--dark'} lp-btn--block`;
  return (
    <article className={`lp-plan${featured ? ' lp-plan--featured' : ''}`}>
      {featured && <span className="lp-plan-badge">Le plus complet</span>}
      <h3 className="lp-plan-name">{plan.label}</h3>
      <div className="lp-plan-price">
        {paid ? (
          <>
            {oldPrice > 0 && <s className="lp-plan-old">{money(oldPrice)} F</s>}
            <strong>{money(yearly ? annualPrice(plan, annualMonths) : plan.price)} F</strong>
            <span>{yearly ? '/an' : '/mois'}</span>
          </>
        ) : (
          <strong>Gratuit</strong>
        )}
      </div>
      <p className="lp-plan-note">
        {paid
          ? (yearly ? `Soit ${money(plan.price)} F × ${annualMonths} mois` : 'Sans engagement')
          : 'Pour tester Margee+'}
      </p>
      <ul className="lp-plan-list">
        {plan.features.map((f, i) => (
          <li key={`${i}-${f}`}><Icon name="check" size={18} />{f}</li>
        ))}
        {paid && yearly && <li><Icon name="check" size={18} />{freeMonths} mois offerts en payant à l'année</li>}
      </ul>
      {preview ? (
        <span className={btnClass} aria-hidden="true">{cta}</span>
      ) : (
        <Link to={`/inscription?plan=${planKey}`} className={btnClass}>{cta}</Link>
      )}
    </article>
  );
}

/* ── Tarifs (lus dans la base, modifiables depuis /admin/plans) ── */
function Pricing() {
  const [yearly, setYearly] = useState(false);
  const { plans, annualMonths } = usePlans();
  const freeMonths = 12 - annualMonths;

  return (
    <section id="tarifs" className="lp-section" aria-labelledby="lp-tarifs-title">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <span className="lp-mono lp-label">Tarifs</span>
          <h2 id="lp-tarifs-title" className="lp-h2">TARIFS</h2>
          <p className="lp-lead">Commence gratuitement, passe à la vitesse supérieure quand tu es prêt.</p>
          <div className="lp-toggle" role="group" aria-label="Période de facturation">
            <button type="button" aria-pressed={!yearly} className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Mensuel</button>
            <button type="button" aria-pressed={yearly} className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>
              Annuel <span className="lp-toggle-badge">{freeMonths} mois offerts</span>
            </button>
          </div>
        </div>

        {/* L'animation d'apparition porte sur le bloc entier : les cartes
            peuvent changer quand les plans arrivent de la base. */}
        <div className="lp-plans lp-reveal">
          {Object.entries(plans).map(([key, plan]) => (
            <PlanCard key={key} planKey={key} plan={plan} yearly={yearly} annualMonths={annualMonths} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FAQ (une seule question ouverte à la fois) ─────────────── */
function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="lp-section" aria-labelledby="lp-faq-title">
      <div className="lp-wrap lp-wrap--narrow">
        <div className="lp-section-head lp-reveal">
          <span className="lp-mono lp-label">Questions fréquentes</span>
          <h2 id="lp-faq-title" className="lp-h2">FAQ</h2>
        </div>
        <div className="lp-faq lp-reveal">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className={`lp-faq-item${isOpen ? ' open' : ''}`}>
                <h3>
                  <button
                    type="button"
                    id={`lp-faq-q${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`lp-faq-a${i}`}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                  >
                    <span>{item.q}</span>
                    <span className="lp-faq-sign"><Icon name="plus" size={20} /></span>
                  </button>
                </h3>
                <div id={`lp-faq-a${i}`} role="region" aria-labelledby={`lp-faq-q${i}`} className="lp-faq-a" hidden={!isOpen}>
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Footer ─────────────────────────────────────────────────── */
function Footer() {
  const { plans } = usePlans();
  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <Logo />
            <p>La gestion simple et claire pour les e&#8209;commerçants d'Afrique francophone : marge, ventes, reçus et ROI au même endroit.</p>
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--sm">
              Démarrer gratuitement <Icon name="chevron" size={16} />
            </Link>
          </div>

          <nav className="lp-footer-col" aria-label="Découvrir">
            <h2 className="lp-mono lp-footer-title">Découvrir</h2>
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>

          <nav className="lp-footer-col" aria-label="Ton compte">
            <h2 className="lp-mono lp-footer-title">Ton compte</h2>
            <Link to="/inscription">Créer un compte</Link>
            <Link to="/connexion">Se connecter</Link>
          </nav>

          <div className="lp-footer-col">
            <h2 className="lp-mono lp-footer-title">Plans</h2>
            <ul className="lp-footer-plans">
              {Object.entries(plans).map(([key, p]) => (
                <li key={key}>
                  <a href="#tarifs">
                    <span>{p.label}</span>
                    <span className="lp-footer-plan-price">{p.price ? `${money(p.price)} F/mois` : 'Gratuit'}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lp-footer-word" aria-hidden="true">MARGEE+</div>

        <div className="lp-footer-bottom">
          <span>© 2026 Margee+ · OLELE Systems</span>
          <span className="lp-mono lp-footer-motto">MEUN NA NEK</span>
          <button type="button" className="lp-footer-top" onClick={toTop}>
            Retour en haut
            <span className="lp-footer-top-icon"><Icon name="chevron" size={16} /></span>
          </button>
        </div>
      </div>
    </footer>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function Landing() {
  const rootRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useReveal(rootRef);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="lp" ref={rootRef}>
      <a href="#lp-main" className="lp-skip">Aller au contenu</a>

      {/* 1. HEADER */}
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <Logo />
          <nav className="lp-nav" aria-label="Navigation principale">
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
          <div className="lp-header-cta">
            <Link to="/connexion" className="lp-btn lp-btn--white lp-btn--sm">Se connecter</Link>
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--sm">Démarrer</Link>
          </div>
          {/* Mobile : bouton discret, tant que l'app n'est pas installée */}
          <InstallButton className="lp-install" />
          <button
            type="button"
            className="lp-burger"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="lp-mobile-menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={24} />
          </button>
        </div>
        <div id="lp-mobile-menu" className={`lp-mobile-menu${menuOpen ? ' open' : ''}`} hidden={!menuOpen}>
          {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>{n.label}</a>)}
          <div className="lp-mobile-cta">
            <Link to="/connexion" className="lp-btn lp-btn--white lp-btn--block">Se connecter</Link>
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--block">Démarrer</Link>
          </div>
        </div>
      </header>

      <main id="lp-main">
        {/* 2. HERO */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy lp-reveal">
              <span className="lp-tag"><Icon name="gift" size={16} />3 REÇUS GRATUITS POUR TESTER</span>
              <h1 className="lp-h1">Gère ton business e-commerce <span className="lp-accent">de A à Z.</span></h1>
              <p className="lp-hero-sub">
                Produits, ventes, reçus automatiques, pubs dépensées, investissements et ROI : tout au même endroit.
                Inscris-toi et lance ton espace en quelques minutes.
              </p>
              <div className="lp-hero-cta">
                <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--lg">Créer mon compte <Icon name="arrow" size={18} /></Link>
                <Link to="/connexion" className="lp-btn lp-btn--dark lp-btn--lg">J'ai déjà un compte</Link>
              </div>
            </div>
            <div className="lp-reveal lp-reveal--delay">
              <DashboardMock />
            </div>
          </div>
        </section>

        {/* 3. LE PROBLÈME */}
        <section className="lp-section" aria-labelledby="lp-pb-title">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <span className="lp-mono lp-label">Le problème</span>
              <h2 id="lp-pb-title" className="lp-h2">TU VENDS. MAIS COMBIEN TU GAGNES VRAIMENT&nbsp;?</h2>
            </div>
            <div className="lp-grid lp-grid--3">
              {PROBLEMS.map((p) => (
                <article key={p.title} className="lp-card lp-reveal">
                  <div className="lp-icon-circle"><Icon name={p.icon} /></div>
                  <h3 className="lp-h3">{p.title}</h3>
                  <p>{p.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 4. FONCTIONNALITÉS */}
        <section id="fonctionnalites" className="lp-section" aria-labelledby="lp-ft-title">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <span className="lp-mono lp-label">Tout au même endroit</span>
              <h2 id="lp-ft-title" className="lp-h2">FONCTIONNALITÉS</h2>
            </div>
            <div className="lp-grid lp-grid--3">
              {FEATURES.map((f) => (
                <article key={f.title} className="lp-card lp-card--hover lp-reveal">
                  <div className="lp-icon-circle"><Icon name={f.icon} /></div>
                  <h3 className="lp-h3">{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. BANDEAU OR */}
        <section className="lp-section lp-section--tight">
          <div className="lp-wrap">
            <div className="lp-banner lp-reveal">
              <div className="lp-icon-circle lp-icon-circle--lg"><Icon name="receipt" size={26} /></div>
              <div className="lp-banner-copy">
                <h2 className="lp-banner-title">CHAQUE VENTE = UN REÇU PROFESSIONNEL</h2>
                <p>Produit, prix, nom du client : ton reçu est prêt en une seconde.</p>
              </div>
              <Link to="/inscription" className="lp-btn lp-btn--dark">Essayer gratuitement <Icon name="chevron" size={18} /></Link>
            </div>
          </div>
        </section>

        {/* 6. COMMENT ÇA MARCHE */}
        <section id="comment" className="lp-section" aria-labelledby="lp-how-title">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <span className="lp-mono lp-label">En 3 étapes</span>
              <h2 id="lp-how-title" className="lp-h2">COMMENT ÇA MARCHE</h2>
            </div>
            <ol className="lp-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="lp-step lp-reveal">
                  <span className="lp-step-n" aria-hidden="true">{s.n}</span>
                  <h3 className="lp-h3">{s.title}</h3>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 7. TARIFS */}
        <Pricing />

        {/* 8. FAQ */}
        <Faq />

        {/* 9. CTA FINAL */}
        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-final lp-reveal">
              <img src="/margee-mark.svg" alt="" width="64" height="64" />
              <h2 className="lp-final-title">Prêt à connaître ta vraie marge&nbsp;?</h2>
              <p>Crée ton espace en quelques minutes et enregistre ta première vente aujourd'hui.</p>
              <div className="lp-final-cta">
                <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--lg">Créer mon compte gratuitement</Link>
                <Link to="/connexion" className="lp-btn lp-btn--outline lp-btn--lg">Se connecter</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 10. FOOTER */}
      <Footer />
    </div>
  );
}
