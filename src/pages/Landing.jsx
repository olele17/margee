import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ANNUAL_MONTHS_PAID, annualPrice } from '../services/api';
import usePlans from '../hooks/usePlans';
import InstallButton from '../pwa/InstallButton';
import './Landing.css';

/* ══════════════════════════════════════════════════════════════
   LANDING MARGEE+ — identité propre : noir, or, crème, capitales.
   Hero sombre (tableau de bord + ticket de reçu) · bande or qui
   défile · avant / avec Margee+ · grille des outils · calculateur
   de marge · 3 étapes · pour qui · tarifs · FAQ · bloc or final.
   Les montants des maquettes sont des exemples.
   ══════════════════════════════════════════════════════════════ */

const ti = (name) => <i className={`ti ti-${name}`} aria-hidden="true" />;

// Montants : séparateur de milliers = espace insécable (2 400)
const money = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function Logo({ dark = false }) {
  return (
    <Link to="/" className={`lp-logo${dark ? ' lp-logo--dark' : ''}`} aria-label="Margee+ — accueil">
      <img src="/margee-mark.svg" alt="" width="40" height="40" />
      <span className="lp-logo-text">
        <span className="lp-logo-name">MARGEE+</span>
        <span className="lp-mono lp-logo-tag">GÈRE · VENDS · SCALE</span>
      </span>
    </Link>
  );
}

function Label({ children, light = false }) {
  return <span className={`lp-label${light ? ' lp-label--light' : ''}`}>{children}</span>;
}

/* ══ Maquettes ══════════════════════════════════════════════════ */
const BARS = [['Juin', 38], ['Juil', 52], ['Août', 46], ['Sept', 64], ['Oct', 71], ['Nov', 92]];

function DashboardWindow() {
  return (
    <div className="lp-win" role="img" aria-label="Exemple de tableau de bord Margee+ : chiffre d'affaires 485 000 F, bénéfice net 172 300 F, ROI des pubs × 4,5">
      <div className="lp-win-bar" aria-hidden="true">
        <span className="lp-win-dots"><i /><i /><i /></span>
        <span className="lp-win-url">{ti('lock')} margeeplus.com/app</span>
      </div>
      <div className="lp-win-body" aria-hidden="true">
        <div className="lp-win-head">
          <span>Tableau de bord <b>· novembre</b></span>
          <span className="lp-win-flag">Exemple</span>
        </div>
        <div className="lp-win-kpis">
          <div><small>Chiffre d'affaires</small><b>485 000 F</b><em>+12 %</em></div>
          <div className="gold"><small>Bénéfice net</small><b>172 300 F</b><em>+14 %</em></div>
          <div><small>ROI des pubs</small><b>× 4,5</b><em>TikTok</em></div>
        </div>
        <div className="lp-win-chart">
          <small>Bénéfice net · 6 mois</small>
          <div className="lp-win-bars">
            {BARS.map(([m, h]) => <span key={m}><i style={{ height: `${h}%` }} /><em>{m}</em></span>)}
          </div>
        </div>
        <div className="lp-win-sales">
          <div><span className="lp-win-ic">{ti('receipt')}</span><span>Robe wax <small>Fatou D.</small></span><b>+11 000 F</b></div>
          <div><span className="lp-win-ic">{ti('receipt')}</span><span>Sac en cuir <small>Moussa K.</small></span><b>+9 500 F</b></div>
        </div>
      </div>
    </div>
  );
}

function ReceiptTicket({ className = '' }) {
  return (
    <div className={`lp-ticket ${className}`} role="img" aria-label="Exemple de reçu Margee+ n° 0042, total 26 500 F, envoyé sur WhatsApp">
      <div aria-hidden="true">
        <div className="lp-ticket-head"><b>BOUTIQUE AWA</b><span>Reçu n° 0042 · 23/11</span></div>
        <div className="lp-ticket-line"><span>Robe wax × 1</span><b>25 000 F</b></div>
        <div className="lp-ticket-line"><span>Livraison</span><b>1 500 F</b></div>
        <div className="lp-ticket-total"><span>TOTAL</span><b>26 500 F</b></div>
        <div className="lp-ticket-sent">{ti('brand-whatsapp')} Envoyé à Fatou</div>
      </div>
    </div>
  );
}

/* ══ Contenus ═══════════════════════════════════════════════════ */
const NAV = [
  { href: '#outils', label: 'Outils' },
  { href: '#calculateur', label: 'Calculateur' },
  { href: '#tarifs', label: 'Tarifs' },
  { href: '#faq', label: 'FAQ' },
];

const TICKER = [
  'Robe wax · +11 000 F', 'Reçu n° 0042 envoyé', 'Sac en cuir · +9 500 F', 'Pub TikTok déduite · 5 000 F',
  'Ensemble bazin · +12 500 F', 'Facture FAC-2026-0012 payée', 'Bénéfice du mois · 172 300 F', 'Devis DEV-2026-0007 envoyé',
];

const BEFORE = [
  'Les ventes dans un cahier, sur WhatsApp ou dans la tête',
  'Le coût de revient oublié, les pubs jamais déduites',
  'Des reçus écrits à la main, ou pas de reçu du tout',
  'Fin du mois : « je crois que j\'ai gagné… »',
];
const AFTER = [
  'Chaque vente enregistrée en quelques secondes',
  'Ta marge calculée : coût, pubs et livraisons compris',
  'Un reçu PDF numéroté, prêt à envoyer sur WhatsApp',
  'Fin du mois : ton bénéfice net exact, comparé au mois d\'avant',
];

const STEPS = [
  { n: '01', icon: 'user-plus', title: 'Crée ton espace', text: 'Inscription gratuite en 2 minutes, depuis ton téléphone ou ton ordinateur.' },
  { n: '02', icon: 'package', title: 'Ajoute tes produits', text: 'Prix de vente et coût de revient : ta marge par article est calculée.' },
  { n: '03', icon: 'chart-arrows-vertical', title: 'Vends et pilote', text: 'Chaque vente génère un reçu et met à jour ton bénéfice net en direct.' },
];

const PROFILES = [
  { icon: 'brand-tiktok', title: 'Tu vends en live et en story', text: 'TikTok, Instagram, statuts WhatsApp : enregistre la commande entre deux lives et envoie le reçu dans la foulée.' },
  { icon: 'building-store', title: 'Tu as une boutique', text: 'Produits, dépenses du local, factures et devis pour tes clients professionnels : tout est au même endroit.' },
  { icon: 'truck-delivery', title: 'Tu vends en gros ou tu importes', text: 'Suis tes investissements de stock et sache combien te rapporte chaque franc engagé.' },
];

const FAQ = [
  { q: 'Est-ce que je dois savoir faire de la comptabilité ?', a: 'Non. Tu saisis tes produits, tes ventes et tes dépenses : Margee+ fait tous les calculs à ta place, y compris ta vraie marge après pubs et livraisons.' },
  { q: 'Combien coûte Margee+ ?', a: 'Tu commences gratuitement avec quelques reçus pour tester. Ensuite, tu choisis Pro ou Elite, au mois ou à l\'année (avec des mois offerts). Les prix sont en F CFA, sans engagement.' },
  { q: 'Comment je paie mon abonnement ?', a: 'En ligne et en toute sécurité, avec Wave, Orange Money ou une carte bancaire. Ton abonnement s\'active automatiquement dès que le paiement est confirmé.' },
  { q: 'Mes données sont-elles privées ?', a: 'Oui. Chaque e-commerçant a son espace personnel : tes ventes, tes clients et tes chiffres ne sont visibles que par toi.' },
  { q: 'Que se passe-t-il après mes reçus gratuits ?', a: 'Le plan Free te permet de tester avec quelques reçus. Pour continuer, tu choisis Pro ou Elite : tes données restent là, rien n\'est perdu.' },
  { q: 'Je peux l\'utiliser sur mon téléphone ?', a: 'Oui. Margee+ s\'installe comme une application sur ton téléphone, Android ou iPhone, sans passer par un store : touche « Installer l\'app » en haut de cette page (sur mobile) ou dans le menu de ton espace. Elle s\'ouvre ensuite en plein écran depuis ton écran d\'accueil. Si tu arrives depuis TikTok ou WhatsApp, ouvre d\'abord le lien dans Chrome (Android) ou Safari (iPhone).' },
  { q: 'Je peux personnaliser mes reçus et mes factures ?', a: 'Oui : ton logo, tes coordonnées, ta signature et tes couleurs apparaissent sur tes reçus, tes factures et tes devis.' },
];

/* ── Apparition au scroll ───────────────────────────────────── */
function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let pending = [...root.querySelectorAll('.lp-reveal')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pending.forEach((el) => el.classList.add('lp-in'));
      return undefined;
    }
    let frame = 0;
    const detach = () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
    const check = () => {
      frame = 0;
      const limit = window.innerHeight * 0.92;
      pending = pending.filter((el) => {
        if (el.getBoundingClientRect().top < limit) { el.classList.add('lp-in'); return false; }
        return true;
      });
      if (!pending.length) detach();
    };
    function onScroll() { if (!frame) frame = requestAnimationFrame(check); }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    check();
    return () => { detach(); if (frame) cancelAnimationFrame(frame); };
  }, [rootRef]);
}

/* ── Carte tarif (aussi utilisée par l'aperçu de /admin/plans) ── */
export function PlanCard({ planKey, plan, yearly = false, annualMonths = ANNUAL_MONTHS_PAID, preview = false }) {
  const featured = !!plan.highlight;
  const paid = plan.price > 0;
  const freeMonths = 12 - annualMonths;
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
        {paid ? (yearly ? `Soit ${money(plan.price)} F × ${annualMonths} mois` : 'Sans engagement') : 'Pour tester Margee+'}
      </p>
      <ul className="lp-plan-list">
        {plan.features.map((f, i) => (
          <li key={`${i}-${f}`}>{ti('check')}{f}</li>
        ))}
        {paid && yearly && <li>{ti('check')}{freeMonths} mois offerts en payant à l'année</li>}
      </ul>
      {preview ? (
        <span className={btnClass} aria-hidden="true">{cta}</span>
      ) : (
        <Link to={`/inscription?plan=${planKey}`} className={btnClass}>{cta}</Link>
      )}
    </article>
  );
}

/* ══ Sections ═══════════════════════════════════════════════════ */
function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy lp-reveal">
          <span className="lp-mono lp-hero-kicker"><i />GÈRE · VENDS · SCALE</span>
          <h1 id="lp-hero-title" className="lp-h1">
            Ton business <span className="lp-nowrap">e-commerce,</span> <mark>enfin clair.</mark>
          </h1>
          <p className="lp-hero-sub">
            Ventes, reçus, pubs, dépenses et factures dans une seule app. Margee+ calcule
            ta <b>vraie marge</b> à chaque vente et t'envoie le reçu prêt à partager.
          </p>
          <div className="lp-hero-cta">
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--lg">Démarrer gratuitement {ti('arrow-right')}</Link>
            <Link to="/connexion" className="lp-btn lp-btn--outline lp-btn--lg">J'ai déjà un compte</Link>
          </div>
          <ul className="lp-hero-trust">
            <li>{ti('gift')}3 reçus offerts</li>
            <li>{ti('device-mobile')}S'installe sur ton téléphone</li>
            <li>{ti('wallet')}Wave · Orange Money · carte</li>
          </ul>
        </div>
        <div className="lp-hero-visual lp-reveal lp-reveal--delay">
          <DashboardWindow />
          <ReceiptTicket className="lp-hero-ticket" />
        </div>
      </div>
    </section>
  );
}

function Ticker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="lp-ticker" aria-label="Exemples d'activité dans Margee+">
      <ul className="lp-ticker-track">
        {items.map((t, i) => <li key={i} aria-hidden={i >= TICKER.length}><span className="lp-ticker-dot" />{t}</li>)}
      </ul>
    </div>
  );
}

function BeforeAfter() {
  return (
    <section className="lp-section" aria-labelledby="lp-ba-title">
      <div className="lp-wrap">
        <div className="lp-head lp-reveal">
          <Label>Pourquoi Margee+</Label>
          <h2 id="lp-ba-title" className="lp-h2">LE CAHIER, <span className="lp-gold">C'EST FINI.</span></h2>
          <p className="lp-lead">Beaucoup d'e-commerçants vendent bien sans savoir ce qu'ils gagnent vraiment. Margee+ remplace le cahier, la calculette et les reçus faits à la main.</p>
        </div>
        <div className="lp-ba lp-reveal">
          <div className="lp-ba-col lp-ba-col--before">
            <div className="lp-ba-title"><span>{ti('notebook')}</span>Sans Margee+</div>
            <ul>{BEFORE.map((b) => <li key={b}>{ti('x')}{b}</li>)}</ul>
          </div>
          <div className="lp-ba-arrow" aria-hidden="true">{ti('arrow-right')}</div>
          <div className="lp-ba-col lp-ba-col--after">
            <div className="lp-ba-title"><span><img src="/margee-mark.svg" alt="" width="22" height="22" /></span>Avec Margee+</div>
            <ul>{AFTER.map((a) => <li key={a}>{ti('check')}{a}</li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tools() {
  return (
    <section id="outils" className="lp-section lp-section--cream" aria-labelledby="lp-tools-title">
      <div className="lp-wrap">
        <div className="lp-head lp-reveal">
          <Label>Les outils</Label>
          <h2 id="lp-tools-title" className="lp-h2">TOUT TON BUSINESS, <span className="lp-gold">UNE SEULE APP.</span></h2>
        </div>
        <div className="lp-bento">
          <article className="lp-tile lp-tile--marge lp-reveal">
            <div className="lp-tile-copy">
              <span className="lp-tile-ic">{ti('chart-pie')}</span>
              <h3>Ta vraie marge, à chaque vente</h3>
              <p>Coût de revient, pubs et livraisons sont déduits automatiquement. Tu vois ce qui reste vraiment dans ta poche.</p>
            </div>
            <div className="lp-calc-mini" aria-hidden="true">
              <div><span>Chiffre d'affaires</span><b>485 000 F</b></div>
              <div className="neg"><span>Coût de revient</span><b>− 262 000 F</b></div>
              <div className="neg"><span>Pubs</span><b>− 38 500 F</b></div>
              <div className="neg"><span>Livraisons</span><b>− 12 200 F</b></div>
              <div className="net"><span>Bénéfice net</span><b>172 300 F</b></div>
            </div>
          </article>

          <article className="lp-tile lp-tile--receipt lp-reveal">
            <span className="lp-tile-ic">{ti('receipt')}</span>
            <h3>Reçus PDF en 1 clic</h3>
            <p>Numérotés, à ton logo et à tes couleurs, prêts pour WhatsApp.</p>
            <ReceiptTicket className="lp-tile-ticket" />
          </article>

          <article className="lp-tile lp-reveal">
            <span className="lp-tile-ic">{ti('speakerphone')}</span>
            <h3>Pubs et ROI</h3>
            <p>Chaque campagne TikTok ou Facebook comparée à ce qu'elle rapporte.</p>
            <div className="lp-roi" aria-hidden="true"><span>ROI</span><b>× 4,5</b></div>
          </article>

          <article className="lp-tile lp-reveal">
            <span className="lp-tile-ic">{ti('file-invoice')}</span>
            <h3>Factures et devis</h3>
            <p>Numérotation automatique, devis converti en facture en un clic.</p>
            <div className="lp-docs" aria-hidden="true"><span>FAC-2026-0012 <em className="ok">Payée</em></span><span>DEV-2026-0007 <em>Envoyé</em></span></div>
          </article>

          <article className="lp-tile lp-reveal">
            <span className="lp-tile-ic">{ti('wallet')}</span>
            <h3>Dépenses et investissements</h3>
            <p>Loyer, stock, matériel : tout est suivi, ton retour sur investissement aussi.</p>
          </article>

          <article className="lp-tile lp-tile--dark lp-tile--wide lp-reveal">
            <div className="lp-tile-copy">
              <span className="lp-tile-ic">{ti('device-mobile')}</span>
              <h3>Une vraie app sur ton téléphone</h3>
              <p>Margee+ s'installe sur ton écran d'accueil, sans store, et s'ouvre en plein écran.</p>
            </div>
            <InstallButton className="lp-btn lp-btn--gold" label="Installer l'app" icon="ti-device-mobile-down" />
          </article>

          <article className="lp-tile lp-tile--wide lp-reveal">
            <div className="lp-tile-copy">
              <span className="lp-tile-ic">{ti('target-arrow')}</span>
              <h3>Objectifs, challenges et notes</h3>
              <p>Fixe-toi un chiffre à atteindre, suis ta progression et garde tes idées et contacts fournisseurs au même endroit.</p>
            </div>
            <div className="lp-goal" aria-hidden="true"><span>Objectif de novembre</span><div><i style={{ width: '72%' }} /></div><b>72 %</b></div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Calculator() {
  const [v, setV] = useState({ price: 25000, cost: 14000, ads: 2000, delivery: 1500, qty: 40 });
  const r = useMemo(() => {
    const n = (x) => Math.max(0, Number(x) || 0);
    const unit = n(v.price) - n(v.cost) - n(v.ads) - n(v.delivery);
    const pct = n(v.price) ? (unit / n(v.price)) * 100 : 0;
    return { unit, pct, month: unit * n(v.qty) };
  }, [v]);
  const field = (key, label, hint) => (
    <label className="lp-calc-field" htmlFor={`lp-calc-${key}`}>
      <span>{label}</span>
      <span className="lp-calc-input">
        <input id={`lp-calc-${key}`} type="number" inputMode="numeric" min="0" step={key === 'qty' ? 1 : 500}
          value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
        <em>{hint}</em>
      </span>
    </label>
  );
  const loss = r.unit < 0;
  return (
    <section id="calculateur" className="lp-section" aria-labelledby="lp-calc-title">
      <div className="lp-wrap">
        <div className="lp-head lp-reveal">
          <Label>Calculateur</Label>
          <h2 id="lp-calc-title" className="lp-h2">ET TOI, <span className="lp-gold">TU GAGNES COMBIEN&nbsp;?</span></h2>
          <p className="lp-lead">Entre les chiffres d'un de tes produits : tu vois tout de suite ce qu'il te rapporte vraiment. C'est ce calcul que Margee+ fait pour chaque vente.</p>
        </div>
        <div className="lp-calc lp-reveal">
          <form className="lp-calc-form" onSubmit={(e) => e.preventDefault()}>
            {field('price', 'Prix de vente', 'F')}
            {field('cost', 'Coût de revient', 'F')}
            {field('ads', 'Pub par vente', 'F')}
            {field('delivery', 'Livraison à ta charge', 'F')}
            {field('qty', 'Ventes par mois', 'ventes')}
          </form>
          <div className={`lp-calc-result${loss ? ' is-loss' : ''}`} aria-live="polite">
            <span className="lp-mono">Ta vraie marge</span>
            <strong>{loss ? '− ' : ''}{money(Math.abs(r.unit))} F <small>par vente</small></strong>
            <div className="lp-calc-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }} /></div>
            <dl>
              <div><dt>Marge nette</dt><dd>{r.pct.toFixed(0).replace('-0', '0')} %</dd></div>
              <div><dt>Bénéfice sur le mois</dt><dd>{loss ? '− ' : ''}{money(Math.abs(r.month))} F</dd></div>
            </dl>
            <p>{loss
              ? 'Attention : à ce prix, chaque vente te fait perdre de l\'argent. Margee+ te le signale avant qu\'il ne soit trop tard.'
              : 'Margee+ fait ce calcul à chaque vente, avec tes vrais chiffres, et l\'additionne sur le mois.'}</p>
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--block">Suivre ma marge avec Margee+ {ti('arrow-right')}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section id="demarrer" className="lp-section lp-section--ink" aria-labelledby="lp-steps-title">
      <div className="lp-wrap">
        <div className="lp-head lp-reveal">
          <Label light>Démarrer</Label>
          <h2 id="lp-steps-title" className="lp-h2">PRÊT EN <span className="lp-gold">3 ÉTAPES.</span></h2>
        </div>
        <ol className="lp-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="lp-step lp-reveal">
              <span className="lp-step-n" aria-hidden="true">{s.n}</span>
              <span className="lp-step-ic">{ti(s.icon)}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Profiles() {
  return (
    <section id="pour-qui" className="lp-section" aria-labelledby="lp-who-title">
      <div className="lp-wrap">
        <div className="lp-head lp-reveal">
          <Label>Pour qui</Label>
          <h2 id="lp-who-title" className="lp-h2">FAIT POUR LES <span className="lp-gold"><span className="lp-nowrap">E-COMMERÇANTS</span> D'ICI.</span></h2>
          <p className="lp-lead">Prix en F CFA, paiement mobile money, reçus à envoyer sur WhatsApp : Margee+ est pensé pour la façon dont on vend en Afrique francophone.</p>
        </div>
        <div className="lp-profiles">
          {PROFILES.map((p) => (
            <article key={p.title} className="lp-profile lp-reveal">
              <span className="lp-profile-ic">{ti(p.icon)}</span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [yearly, setYearly] = useState(false);
  const { plans, annualMonths } = usePlans();
  const freeMonths = 12 - annualMonths;
  return (
    <section id="tarifs" className="lp-section lp-section--cream" aria-labelledby="lp-tarifs-title">
      <div className="lp-wrap">
        <div className="lp-head lp-head--center lp-reveal">
          <Label>Tarifs</Label>
          <h2 id="lp-tarifs-title" className="lp-h2">DES PRIX <span className="lp-gold">EN F CFA.</span></h2>
          <p className="lp-lead">Commence gratuitement, passe à la vitesse supérieure quand ton business décolle.</p>
          <div className="lp-toggle" role="group" aria-label="Période de facturation">
            <button type="button" aria-pressed={!yearly} className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Mensuel</button>
            <button type="button" aria-pressed={yearly} className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>
              Annuel <span className="lp-toggle-badge">{freeMonths} mois offerts</span>
            </button>
          </div>
        </div>
        <div className="lp-plans lp-reveal">
          {Object.entries(plans).map(([key, plan]) => (
            <PlanCard key={key} planKey={key} plan={plan} yearly={yearly} annualMonths={annualMonths} />
          ))}
        </div>
        <p className="lp-pricing-note lp-reveal">{ti('shield-check')} Paiement sécurisé par Wave, Orange Money ou carte · abonnement activé automatiquement</p>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="lp-section" aria-labelledby="lp-faq-title">
      <div className="lp-wrap lp-wrap--narrow">
        <div className="lp-head lp-head--center lp-reveal">
          <Label>FAQ</Label>
          <h2 id="lp-faq-title" className="lp-h2">QUESTIONS <span className="lp-gold">FRÉQUENTES.</span></h2>
        </div>
        <div className="lp-faq lp-reveal">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className={`lp-faq-item${isOpen ? ' open' : ''}`}>
                <h3>
                  <button type="button" id={`lp-faq-q${i}`} aria-expanded={isOpen} aria-controls={`lp-faq-a${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                    <span className="lp-faq-n lp-mono" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <span className="lp-faq-q">{item.q}</span>
                    <span className="lp-faq-sign">{ti('chevron-down')}</span>
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

function FinalCta() {
  return (
    <section className="lp-section lp-section--tight" aria-labelledby="lp-final-title">
      <div className="lp-wrap">
        <div className="lp-final lp-reveal">
          <img src="/margee-mark.svg" alt="" width="64" height="64" className="lp-final-mark" />
          <h2 id="lp-final-title" className="lp-final-title">PRÊT À CONNAÎTRE TA VRAIE MARGE&nbsp;?</h2>
          <p>Crée ton espace en 2 minutes et enregistre ta première vente aujourd'hui.</p>
          <div className="lp-final-cta">
            <Link to="/inscription" className="lp-btn lp-btn--dark lp-btn--lg">Créer mon compte gratuit {ti('arrow-right')}</Link>
            <Link to="/connexion" className="lp-btn lp-btn--line lp-btn--lg">Se connecter</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

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
            <Logo dark />
            <p>La gestion simple et claire des e-commerçants d'Afrique francophone : ventes, reçus, marge et ROI au même endroit.</p>
          </div>
          <nav className="lp-footer-col" aria-label="Découvrir">
            <h2 className="lp-footer-title">Découvrir</h2>
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
            <a href="#pour-qui">Pour qui</a>
          </nav>
          <nav className="lp-footer-col" aria-label="Ton compte">
            <h2 className="lp-footer-title">Ton compte</h2>
            <Link to="/inscription">Créer un compte</Link>
            <Link to="/connexion">Se connecter</Link>
            <InstallButton className="lp-footer-install" label="Installer l'app" icon="ti-device-mobile-down" />
          </nav>
          <div className="lp-footer-col">
            <h2 className="lp-footer-title">Plans</h2>
            <ul className="lp-footer-plans">
              {Object.entries(plans).map(([key, p]) => (
                <li key={key}><a href="#tarifs"><span>{p.label}</span><span>{p.price ? `${money(p.price)} F/mois` : 'Gratuit'}</span></a></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="lp-footer-word" aria-hidden="true">MARGEE+</div>
        <div className="lp-footer-bottom">
          <span>© 2026 Margee+</span>
          <span className="lp-mono lp-footer-motto">MEUN NA NEK</span>
          <button type="button" className="lp-footer-top" onClick={toTop}>Retour en haut {ti('arrow-up')}</button>
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
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="lp" ref={rootRef}>
      <a href="#lp-main" className="lp-skip">Aller au contenu</a>

      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <Logo dark />
          <nav className="lp-nav" aria-label="Navigation principale">
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
          <div className="lp-header-cta">
            <Link to="/connexion" className="lp-btn lp-btn--outline lp-btn--sm">Se connecter</Link>
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
            {ti(menuOpen ? 'x' : 'menu-2')}
          </button>
        </div>
        <div id="lp-mobile-menu" className={`lp-mobile-menu${menuOpen ? ' open' : ''}`} hidden={!menuOpen}>
          {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>{n.label}</a>)}
          <div className="lp-mobile-cta">
            <Link to="/connexion" className="lp-btn lp-btn--outline lp-btn--block">Se connecter</Link>
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--block">Démarrer</Link>
          </div>
        </div>
      </header>

      <main id="lp-main">
        <Hero />
        <Ticker />
        <BeforeAfter />
        <Tools />
        <Calculator />
        <Steps />
        <Profiles />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}
