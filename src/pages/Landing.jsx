import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ANNUAL_MONTHS_PAID, annualPrice } from '../services/api';
import usePlans from '../hooks/usePlans';
import InstallButton from '../pwa/InstallButton';
import './Landing.css';

/* ══════════════════════════════════════════════════════════════
   LANDING MARGEE+
   Structure : hero · chiffres · problème · pour qui · comment ça
   marche · démo · tarifs · FAQ · appel final · pied de page.
   Les écrans de téléphone sont dessinés en HTML/CSS (données
   d'exemple). Les photos : déposer les fichiers dans public/landing/
   et renseigner PHOTOS ci-dessous ; sans fichier, un visuel
   décoratif s'affiche à la place.
   ══════════════════════════════════════════════════════════════ */

const PHOTOS = {
  hero: null,       // ex. '/landing/hero.webp' : e-commerçante qui vend depuis son téléphone
  quotidien: null,  // vendeur débordé entre cahier, colis et téléphone
  clients: null,    // cliente qui reçoit sa commande
  reseaux: null,    // vendeuse en live / en story
  boutique: null,   // gérant de boutique au comptoir
  final: null,      // e-commerçante souriante avec un colis
};

const ti = (name) => <i className={`ti ti-${name}`} aria-hidden="true" />;

// Montants : séparateur de milliers = espace insécable (2 400)
const money = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function Logo({ light = false }) {
  return (
    <Link to="/" className={`lp-logo${light ? ' lp-logo--light' : ''}`} aria-label="Margee+ — accueil">
      <img src="/margee-mark.svg" alt="" width="40" height="40" />
      <span className="lp-logo-text">
        <span className="lp-logo-name">MARGEE+</span>
        <span className="lp-mono lp-logo-tag">GÈRE · VENDS · SCALE</span>
      </span>
    </Link>
  );
}

/* ── Photo (ou visuel décoratif tant qu'il n'y a pas de fichier) ── */
function Photo({ src, alt, tone = 'warm', icon, caption, className = '' }) {
  if (src) {
    return <div className={`lp-photo ${className}`}><img src={src} alt={alt} loading="lazy" /></div>;
  }
  return (
    <div className={`lp-photo lp-photo--art lp-photo--${tone} ${className}`} role="img" aria-label={alt}>
      <svg className="lp-photo-pattern" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={`wax-${tone}`} width="64" height="64" patternUnits="userSpaceOnUse">
            <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="32" cy="32" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="32" cy="32" r="3" fill="currentColor" />
            <path d="M0 0 L8 8 M56 56 L64 64 M64 0 L56 8 M8 56 L0 64" stroke="currentColor" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#wax-${tone})`} />
      </svg>
      {icon && (
        <div className="lp-photo-badge" aria-hidden="true">
          <span className="lp-photo-badge-icon">{ti(icon)}</span>
          {caption && <span>{caption}</span>}
        </div>
      )}
    </div>
  );
}

/* ══ Écrans de téléphone (exemples) ═══════════════════════════ */
function Phone({ children, label, className = '' }) {
  return (
    <div className={`lp-phone ${className}`} role="img" aria-label={label}>
      <div className="lp-phone-screen">
        <div className="lp-phone-status" aria-hidden="true"><span>9:41</span><span className="lp-phone-notch" /><span>{ti('wifi')}{ti('battery-3')}</span></div>
        {children}
      </div>
    </div>
  );
}

function TabBar({ active = 'dash' }) {
  const item = (key, icon, label) => (
    <span className={`lp-tab${active === key ? ' on' : ''}`}>{ti(icon)}<em>{label}</em></span>
  );
  return (
    <div className="lp-tabbar" aria-hidden="true">
      {item('dash', 'layout-dashboard', 'Dashboard')}
      {item('sales', 'receipt', 'Ventes')}
      <span className="lp-tab-add">{ti('plus')}</span>
      {item('ch', 'target-arrow', 'Challenges')}
      {item('menu', 'menu-2', 'Menu')}
    </div>
  );
}

const BARS = [38, 52, 46, 64, 71, 92];
function ScreenDashboard() {
  return (
    <div className="lp-scr">
      <div className="lp-scr-top"><span>Bonjour <b>Awa</b></span><span className="lp-scr-avatar">AW</span></div>
      <div className="lp-scr-hero">
        <span>Bénéfice net · novembre</span>
        <strong>172 300 F</strong>
        <em>{ti('trending-up')} +14 % vs octobre</em>
      </div>
      <div className="lp-scr-kpis">
        <div><span>Chiffre d'affaires</span><b>485 000 F</b></div>
        <div><span>Ventes</span><b>38</b></div>
      </div>
      <div className="lp-scr-chart">
        <span>Bénéfice · 6 mois</span>
        <div className="lp-scr-bars">{BARS.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
      </div>
      <div className="lp-scr-row"><span className="lp-scr-dot">{ti('receipt')}</span><span><b>Robe wax</b><small>Fatou D. · reçu 0042</small></span><b>25 000 F</b></div>
      <TabBar active="dash" />
    </div>
  );
}

function ScreenProducts() {
  const rows = [['Robe wax', '14 000', '25 000', '11 000'], ['Sac en cuir', '9 000', '18 500', '9 500'], ['Ensemble bazin', '19 500', '32 000', '12 500']];
  return (
    <div className="lp-scr">
      <div className="lp-scr-title">Produits <span className="lp-scr-btn">{ti('plus')} Ajouter</span></div>
      {rows.map(([n, c, p, m]) => (
        <div key={n} className="lp-scr-card">
          <b>{n}</b>
          <div className="lp-scr-cols"><span>Coût<b>{c} F</b></span><span>Prix<b>{p} F</b></span><span className="gold">Marge<b>{m} F</b></span></div>
        </div>
      ))}
      <TabBar active="menu" />
    </div>
  );
}

function ScreenSale() {
  return (
    <div className="lp-scr">
      <div className="lp-scr-title">Nouvelle vente</div>
      <label className="lp-scr-field"><span>Produit</span><b>Robe wax · 25 000 F {ti('chevron-down')}</b></label>
      <div className="lp-scr-2">
        <label className="lp-scr-field"><span>Quantité</span><b>1</b></label>
        <label className="lp-scr-field"><span>Livraison</span><b>1 500 F</b></label>
      </div>
      <label className="lp-scr-field"><span>Client</span><b>Fatou Diop</b></label>
      <label className="lp-scr-check">{ti('square-check')} Livraison payée par le client</label>
      <div className="lp-scr-total"><span>Bénéfice de la vente</span><b>+11 000 F</b></div>
      <span className="lp-scr-cta">Enregistrer la vente</span>
      <TabBar active="sales" />
    </div>
  );
}

function ScreenReceipt() {
  return (
    <div className="lp-scr lp-scr--receipt">
      <div className="lp-scr-paper">
        <div className="lp-scr-paper-head"><b>BOUTIQUE AWA</b><span>Reçu n° 0042</span></div>
        <div className="lp-scr-paper-line"><span>Robe wax × 1</span><b>25 000 F</b></div>
        <div className="lp-scr-paper-line"><span>Livraison</span><b>1 500 F</b></div>
        <div className="lp-scr-paper-total"><span>Total payé</span><b>26 500 F</b></div>
        <div className="lp-scr-paper-foot">Merci Fatou ! · Dakar, le 23/11</div>
      </div>
      <span className="lp-scr-share">{ti('brand-whatsapp')} Envoyer sur WhatsApp</span>
      <span className="lp-scr-share lp-scr-share--ghost">{ti('download')} Télécharger le PDF</span>
    </div>
  );
}

function ScreenMargin() {
  const rows = [['Chiffre d\'affaires', '485 000 F', ''], ['Coût de revient', '− 262 000 F', 'neg'], ['Pubs TikTok & Facebook', '− 38 500 F', 'neg'], ['Livraisons à ta charge', '− 12 200 F', 'neg']];
  return (
    <div className="lp-scr">
      <div className="lp-scr-title">Ta vraie marge · novembre</div>
      {rows.map(([l, v, c]) => <div key={l} className={`lp-scr-line ${c}`}><span>{l}</span><b>{v}</b></div>)}
      <div className="lp-scr-net"><span>Bénéfice net</span><b>172 300 F</b><em>ROI des pubs : × 4,5</em></div>
      <TabBar active="dash" />
    </div>
  );
}

function ScreenInvoice() {
  return (
    <div className="lp-scr">
      <div className="lp-scr-title">Factures & devis</div>
      <div className="lp-scr-doc"><span className="lp-scr-doc-tag">Facture</span><b>FAC-2026-0012</b><small>Hôtel Teranga · 12 ensembles bazin</small><div><b>384 000 F</b><em className="ok">Payée</em></div></div>
      <div className="lp-scr-doc"><span className="lp-scr-doc-tag dev">Devis</span><b>DEV-2026-0007</b><small>Mariage Ndiaye · 30 tenues</small><div><b>960 000 F</b><em>Envoyé</em></div></div>
      <span className="lp-scr-cta">{ti('file-plus')} Nouvelle facture</span>
      <TabBar active="menu" />
    </div>
  );
}

/* ══ Contenus ═══════════════════════════════════════════════════ */
const NAV = [
  { href: '#pour-qui', label: 'Pour qui' },
  { href: '#comment', label: 'Comment ça marche' },
  { href: '#tarifs', label: 'Tarifs' },
  { href: '#faq', label: 'FAQ' },
];

const HERO_POINTS = ['Reçu PDF en 1 clic', 'Bénéfice net en temps réel', 'Factures et devis inclus', 'S\'installe sur ton téléphone'];

const STATS = [
  { n: '3', unit: '', text: 'reçus gratuits pour tester' },
  { n: '1', unit: ' clic', text: 'pour un reçu PDF professionnel' },
  { n: '7', unit: '', text: 'outils réunis dans une seule app' },
];

const PAY_MEANS = [
  { name: 'Wave', icon: 'wave-sine' },
  { name: 'Orange Money', icon: 'device-mobile' },
  { name: 'Free Money', icon: 'device-mobile' },
  { name: 'Carte bancaire', icon: 'credit-card' },
];

const PAINS = [
  {
    photo: 'quotidien', tone: 'warm', icon: 'notebook', caption: 'Cahier · WhatsApp · captures',
    who: 'Dans ton quotidien', whoIcon: 'building-store',
    list: ['Ventes notées dans un cahier ou sur WhatsApp', 'Coût de revient oublié dans le calcul', 'Pubs TikTok et Facebook jamais déduites', 'Livraisons payées de ta poche', 'Fin du mois : aucune idée du vrai bénéfice'],
  },
  {
    photo: 'clients', tone: 'sand', icon: 'receipt-off', caption: 'Reçus écrits à la main',
    who: 'Face à tes clients', whoIcon: 'users',
    list: ['Reçus écrits à la main ou pas de reçu du tout', 'Factures et devis bricolés sur Word', 'Une image moins professionnelle que tes concurrents', 'Aucun historique de ce que chaque client a acheté'],
  },
];

const EQUATION = [
  { v: 'Chiffre d\'affaires', op: '' },
  { v: 'Coût de revient', op: '−' },
  { v: 'Pubs', op: '−' },
  { v: 'Livraisons', op: '−' },
];

const STEPS = [
  { n: '01', icon: 'package', title: 'Ajoute tes produits', text: 'Prix de vente et coût de revient : Margee+ calcule ta marge sur chaque article.', screen: <ScreenProducts />, label: 'Écran Produits : coût, prix et marge de chaque article' },
  { n: '02', icon: 'shopping-cart', title: 'Enregistre une vente', text: 'Produit, quantité, client, livraison : quelques secondes depuis ton téléphone.', screen: <ScreenSale />, label: 'Écran Nouvelle vente avec le bénéfice calculé' },
  { n: '03', icon: 'receipt', title: 'Le reçu part au client', text: 'Un reçu PDF numéroté, à ton nom, prêt à envoyer sur WhatsApp.', screen: <ScreenReceipt />, label: 'Reçu PDF numéroté prêt à être envoyé sur WhatsApp' },
  { n: '04', icon: 'chart-pie', title: 'Lis ta vraie marge', text: 'Coût de revient, pubs et livraisons déduits : ton bénéfice net, en direct.', screen: <ScreenMargin />, label: 'Écran Ta vraie marge : bénéfice net après coûts, pubs et livraisons' },
];

const DEMOS = {
  reseaux: {
    tab: 'Je vends sur les réseaux',
    steps: [
      { icon: 'package', t: 'Produit ajouté', s: 'Robe wax · marge 11 000 F' },
      { icon: 'shopping-cart', t: 'Vente enregistrée', s: '25 000 F · Fatou D.' },
      { icon: 'brand-whatsapp', t: 'Reçu envoyé', s: 'PDF n° 0042 sur WhatsApp' },
      { icon: 'speakerphone', t: 'Pub déduite', s: 'Campagne TikTok · 5 000 F' },
      { icon: 'chart-line', t: 'Bénéfice net', s: 'Mis à jour en direct' },
    ],
    note: 'De la commande au bénéfice net : tout se calcule pendant que tu vends.',
  },
  boutique: {
    tab: 'J\'ai une boutique',
    steps: [
      { icon: 'file-description', t: 'Devis envoyé', s: 'DEV-2026-0007' },
      { icon: 'file-check', t: 'Devis accepté', s: 'Converti en facture' },
      { icon: 'cash', t: 'Facture payée', s: 'FAC-2026-0012 · payée' },
      { icon: 'wallet', t: 'Dépense notée', s: 'Loyer de la boutique' },
      { icon: 'layout-dashboard', t: 'Mois comparés', s: 'Octobre vs novembre' },
    ],
    note: 'Devis, factures, dépenses et investissements : ta boutique gérée comme une entreprise.',
  },
};

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
          <span className="lp-pill">{ti('gift')} 3 reçus gratuits pour tester · sans engagement</span>
          <h1 id="lp-hero-title" className="lp-h1">
            Vends sur les réseaux.
            <span className="lp-h1-accent">Connais ta vraie marge.</span>
          </h1>
          <p className="lp-hero-sub">
            <b>Margee+ calcule ton bénéfice net à chaque vente</b>, coût de revient, pubs et livraisons compris,
            et <b>envoie un reçu professionnel à ton client</b>. Fini le cahier, fini les calculs de tête.
          </p>
          <ul className="lp-hero-points">
            {HERO_POINTS.map((p) => <li key={p}>{ti('circle-check')}{p}</li>)}
          </ul>
          <div className="lp-hero-cta">
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--lg">Créer mon compte gratuit {ti('arrow-right')}</Link>
            <Link to="/connexion" className="lp-btn lp-btn--ghost lp-btn--lg">Se connecter</Link>
          </div>
          <InstallButton className="lp-textlink" label="Ou installe l'app sur ton téléphone" icon="ti-device-mobile-down" />
        </div>

        <div className="lp-hero-visual lp-reveal lp-reveal--delay">
          <Photo src={PHOTOS.hero} alt="E-commerçante qui gère ses ventes depuis son téléphone" tone="warm" icon="building-store" caption="Ta boutique, dans ta poche" className="lp-hero-photo" />
          <Phone label="Exemple de tableau de bord Margee+ : bénéfice net 172 300 F en novembre" className="lp-hero-phone"><ScreenDashboard /></Phone>
          <div className="lp-float lp-float--top" aria-hidden="true">
            <span className="lp-float-icon">{ti('circle-check')}</span>
            <span><small>Vente enregistrée</small><b>+25 000 F</b></span>
          </div>
          <div className="lp-float lp-float--bottom" aria-hidden="true">
            <span className="lp-float-icon lp-float-icon--dark">{ti('brand-whatsapp')}</span>
            <span><small>Reçu n° 0042</small><b>Envoyé à Fatou</b></span>
          </div>
        </div>
      </div>

      <div className="lp-wrap">
        <div className="lp-stats lp-reveal">
          {STATS.map((s) => (
            <div key={s.text} className="lp-stat">
              <strong>{s.n}<span>{s.unit}</span></strong>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
        <div className="lp-means lp-reveal">
          <p>Paie ton abonnement avec le moyen que tu utilises déjà</p>
          <ul>
            {PAY_MEANS.map((m) => <li key={m.name}>{ti(m.icon)}{m.name}</li>)}
          </ul>
          <ul className="lp-means-sub">
            <li>Prix en F CFA</li><li>Activation automatique</li><li>Paiement sécurisé</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="lp-section lp-section--tint" aria-labelledby="lp-pb-title">
      <div className="lp-wrap">
        <div className="lp-head lp-reveal">
          <span className="lp-label">Le problème</span>
          <h2 id="lp-pb-title" className="lp-h2">Tu vends. Mais combien tu gagnes <em>vraiment&nbsp;?</em></h2>
        </div>
        <div className="lp-pains">
          {PAINS.map((p) => (
            <article key={p.who} className="lp-pain lp-reveal">
              <Photo src={PHOTOS[p.photo]} alt={p.who} tone={p.tone} icon={p.icon} caption={p.caption} className="lp-pain-photo" />
              <div className="lp-pain-body">
                <div className="lp-pain-who"><span>{ti(p.whoIcon)}</span>{p.who}</div>
                <ul>{p.list.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
        <div className="lp-equation lp-reveal" aria-label="Chiffre d'affaires moins coût de revient, moins pubs, moins livraisons, égale ta vraie marge">
          {EQUATION.map((e) => (
            <div key={e.v} className="lp-eq-item" aria-hidden="true">{e.op && <span className="lp-eq-op">{e.op}</span>}<span>{e.v}</span></div>
          ))}
          <div className="lp-eq-item lp-eq-result" aria-hidden="true"><span className="lp-eq-op">=</span><span>Ta vraie marge</span></div>
          <p className="lp-eq-note">Le calcul que personne ne fait à la main. Margee+ le fait à chaque vente.</p>
        </div>
      </div>
    </section>
  );
}

function Audience() {
  return (
    <section id="pour-qui" className="lp-section" aria-labelledby="lp-who-title">
      <div className="lp-wrap">
        <div className="lp-head lp-head--center lp-reveal">
          <span className="lp-chip">Pour qui&nbsp;?</span>
          <h2 id="lp-who-title" className="lp-h2">Pensé pour celles et ceux qui vendent <em>sur les réseaux.</em></h2>
          <p className="lp-lead">Vendeuses TikTok, boutiques WhatsApp et Instagram, commerçants et grossistes : Margee+ remplace le cahier, la calculette et les reçus faits à la main.</p>
        </div>

        <div className="lp-row lp-reveal">
          <div className="lp-row-visual">
            <Photo src={PHOTOS.reseaux} alt="Vendeuse qui prépare une commande reçue sur les réseaux" tone="warm" icon="brand-tiktok" caption="Live, story, statut WhatsApp" className="lp-row-photo" />
            <Phone label="Écran Nouvelle vente" className="lp-row-phone"><ScreenSale /></Phone>
          </div>
          <div className="lp-row-copy">
            <span className="lp-label">Tu vends sur TikTok, WhatsApp, Instagram</span>
            <h3 className="lp-h3">Encaisse, envoie le reçu, passe à la commande suivante.</h3>
            <ul className="lp-checks">
              <li>{ti('circle-check')}Une vente enregistrée en quelques secondes, depuis ton téléphone</li>
              <li>{ti('circle-check')}Un reçu PDF numéroté envoyé à ton client sur WhatsApp</li>
              <li>{ti('circle-check')}Tes pubs déduites : tu sais quelle campagne rapporte vraiment</li>
              <li>{ti('circle-check')}Livraison payée par le client ou par toi : tout est compté</li>
            </ul>
            <Link to="/inscription" className="lp-btn lp-btn--gold">Créer mon espace {ti('arrow-right')}</Link>
          </div>
        </div>

        <div className="lp-row lp-row--reverse lp-reveal">
          <div className="lp-row-visual">
            <Photo src={PHOTOS.boutique} alt="Gérant de boutique au comptoir avec sa tablette" tone="sand" icon="building-warehouse" caption="Boutique, atelier, vente en gros" className="lp-row-photo" />
            <Phone label="Écran Factures et devis" className="lp-row-phone"><ScreenInvoice /></Phone>
          </div>
          <div className="lp-row-copy">
            <span className="lp-label">Tu as une boutique ou tu vends en gros</span>
            <h3 className="lp-h3">Pilote tes produits et tes chiffres comme une entreprise.</h3>
            <ul className="lp-checks">
              <li>{ti('circle-check')}Coût de revient et marge calculés pour chaque produit</li>
              <li>{ti('circle-check')}Factures et devis numérotés, à ton logo et à tes couleurs</li>
              <li>{ti('circle-check')}Dépenses et investissements suivis, ROI calculé pour toi</li>
              <li>{ti('circle-check')}Tes mois comparés d'un coup d'œil sur ton tableau de bord</li>
            </ul>
            <a href="#comment" className="lp-btn lp-btn--dark">Voir comment ça marche {ti('arrow-down')}</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="comment" className="lp-section lp-section--tint" aria-labelledby="lp-how-title">
      <div className="lp-wrap">
        <div className="lp-head lp-reveal">
          <span className="lp-label">Comment ça marche</span>
          <h2 id="lp-how-title" className="lp-h2">Quatre étapes. <em>Zéro calcul.</em></h2>
          <p className="lp-lead">Le même parcours simple pour chaque vente, depuis ton téléphone ou ton ordinateur.</p>
        </div>
        <ol className="lp-timeline">
          {STEPS.map((s, i) => (
            <li key={s.n} className={`lp-tl-step lp-reveal${i % 2 ? ' lp-tl-step--alt' : ''}`}>
              <div className="lp-tl-copy">
                <span className="lp-tl-tag">{ti(s.icon)} Étape {s.n}</span>
                <h3 className="lp-h3">{s.title}</h3>
                <p>{s.text}</p>
              </div>
              <span className="lp-tl-node" aria-hidden="true">{s.n}</span>
              <div className="lp-tl-visual">
                <Phone label={s.label} className="lp-tl-phone">{s.screen}</Phone>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Demo() {
  const [track, setTrack] = useState('reseaux');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const steps = DEMOS[track].steps;

  useEffect(() => {
    if (paused || reduce) return undefined;
    const t = setTimeout(() => setActive((a) => (a + 1) % steps.length), 2600);
    return () => clearTimeout(t);
  }, [active, paused, reduce, steps.length]);

  const choose = (k) => { setTrack(k); setActive(0); };

  return (
    <section id="demo" className="lp-section lp-section--tint lp-demo" aria-labelledby="lp-demo-title"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="lp-wrap">
        <div className="lp-head lp-reveal">
          <span className="lp-label">Démo</span>
          <h2 id="lp-demo-title" className="lp-h2">Vis le parcours, <em>en 10 secondes.</em></h2>
        </div>
        <div className="lp-reveal">
          <div className="lp-switch" role="tablist" aria-label="Type d'activité">
            {Object.entries(DEMOS).map(([k, d]) => (
              <button key={k} type="button" role="tab" aria-selected={track === k} className={track === k ? 'on' : ''} onClick={() => choose(k)}>{d.tab}</button>
            ))}
          </div>
          <ol className="lp-demo-steps">
            {steps.map((s, i) => (
              <li key={`${track}-${s.t}`}>
                <button type="button" className={`lp-demo-card${i === active ? ' on' : ''}${i < active ? ' done' : ''}`} onClick={() => setActive(i)} aria-current={i === active ? 'step' : undefined}>
                  <span className="lp-demo-top"><span className="lp-demo-icon">{ti(i < active ? 'check' : s.icon)}</span><span className="lp-demo-n">0{i + 1}</span></span>
                  <b>{s.t}</b>
                  <small>{s.s}</small>
                  {i === active && !reduce && !paused && <span className="lp-demo-progress" />}
                </button>
              </li>
            ))}
          </ol>
          <p className="lp-demo-note">{DEMOS[track].note}</p>
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
    <section id="tarifs" className="lp-section lp-section--dark" aria-labelledby="lp-tarifs-title">
      <div className="lp-wrap">
        <div className="lp-head lp-head--center lp-reveal">
          <span className="lp-chip lp-chip--dark">Tarifs</span>
          <h2 id="lp-tarifs-title" className="lp-h2">Un prix simple, <em>en F CFA.</em></h2>
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
        <ul className="lp-pricing-notes lp-reveal">
          <li>{ti('shield-check')}Paiement sécurisé Wave, Orange Money ou carte</li>
          <li>{ti('bolt')}Abonnement activé automatiquement</li>
          <li>{ti('lock')}Tes données restent privées</li>
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="lp-section" aria-labelledby="lp-faq-title">
      <div className="lp-wrap lp-faq-grid">
        <div className="lp-faq-side lp-reveal">
          <span className="lp-label">FAQ</span>
          <h2 id="lp-faq-title" className="lp-h2">On te dit <em>tout.</em></h2>
          <p className="lp-lead">Une question qui n'est pas listée&nbsp;? Écris à l'équipe depuis ton espace : on te répond directement dans l'app.</p>
        </div>
        <div className="lp-faq lp-reveal">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className={`lp-faq-item${isOpen ? ' open' : ''}`}>
                <h3>
                  <button type="button" id={`lp-faq-q${i}`} aria-expanded={isOpen} aria-controls={`lp-faq-a${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                    <span>{item.q}</span>
                    <span className="lp-faq-sign">{ti(isOpen ? 'minus' : 'plus')}</span>
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
    <section className="lp-section lp-final" aria-labelledby="lp-final-title">
      <div className="lp-wrap lp-final-grid">
        <div className="lp-final-copy lp-reveal">
          <Logo />
          <h2 id="lp-final-title" className="lp-h1 lp-final-title">
            Vends sur les réseaux.
            <span className="lp-h1-accent">Connais ta vraie marge.</span>
          </h2>
          <p className="lp-lead">Crée ton espace en quelques minutes et enregistre ta première vente aujourd'hui. Inscription gratuite, sans engagement.</p>
          <div className="lp-hero-cta">
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--lg">Créer mon compte gratuit {ti('arrow-right')}</Link>
            <Link to="/connexion" className="lp-btn lp-btn--ghost lp-btn--lg">Se connecter</Link>
          </div>
        </div>
        <div className="lp-final-visual lp-reveal lp-reveal--delay">
          <Photo src={PHOTOS.final} alt="E-commerçante souriante qui prépare un colis" tone="warm" icon="heart-handshake" caption="Prête pour la prochaine commande" className="lp-final-photo" />
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
            <Logo light />
            <p>La gestion simple et claire des e-commerçants d'Afrique francophone : ventes, reçus, marge et ROI au même endroit.</p>
          </div>
          <nav className="lp-footer-col" aria-label="Produit">
            <h2 className="lp-footer-title">Produit</h2>
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
            <a href="#demo">Démo</a>
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
        <div className="lp-footer-means">
          {PAY_MEANS.map((m) => <span key={m.name}>{m.name}</span>)}
        </div>
        <div className="lp-footer-bottom">
          <span>© 2026 Margee+ · OLELE Systems</span>
          <span className="lp-mono">MEUN NA NEK</span>
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
  const [scrolled, setScrolled] = useState(false);
  useReveal(rootRef);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lp" ref={rootRef}>
      <a href="#lp-main" className="lp-skip">Aller au contenu</a>

      <header className={`lp-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="lp-wrap lp-header-inner">
          <Logo />
          <nav className="lp-nav" aria-label="Navigation principale">
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
          <div className="lp-header-cta">
            <Link to="/connexion" className="lp-btn lp-btn--text lp-btn--sm">Connexion</Link>
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--sm">Créer un compte</Link>
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
            <Link to="/connexion" className="lp-btn lp-btn--ghost lp-btn--block">Se connecter</Link>
            <Link to="/inscription" className="lp-btn lp-btn--gold lp-btn--block">Créer un compte</Link>
          </div>
        </div>
      </header>

      <main id="lp-main">
        <Hero />
        <Problem />
        <Audience />
        <HowItWorks />
        <Demo />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}
