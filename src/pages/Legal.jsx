import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LEGAL, PROVIDERS } from '../legal/legalInfo';
import '../styles/legal.css';

/** Pages légales : mentions, confidentialité, CGU/CGV, cookies. */
// Mentions légales : en attente des informations de l'éditeur
// (src/legal/legalInfo.js). Remettre `MENTIONS_ONLINE = true` pour la publier.
const MENTIONS_ONLINE = false;
export const LEGAL_PAGES = [
  ...(MENTIONS_ONLINE ? [{ path: '/mentions-legales', label: 'Mentions légales' }] : []),
  { path: '/confidentialite', label: 'Confidentialité' },
  { path: '/cgu', label: 'CGU / CGV' },
  { path: '/cookies', label: 'Cookies' },
];

const Contact = () => (
  <>
    {LEGAL.email ? <>par e-mail à <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>, ou </> : null}
    depuis la messagerie « Aide » de ton espace Margee+
  </>
);

function Editor() {
  const rows = [
    ['Nom', LEGAL.editorName],
    ['Forme juridique', LEGAL.legalForm],
    ['RCCM', LEGAL.rccm],
    ['NINEA', LEGAL.ninea],
    ['Adresse', LEGAL.address],
    ['E-mail', LEGAL.email],
    ['Téléphone', LEGAL.phone],
    ['Directeur de la publication', LEGAL.publicationDirector],
  ].filter(([, v]) => v);
  return (
    <dl className="lg-dl">
      <div><dt>Service</dt><dd>{LEGAL.brand} ({LEGAL.site})</dd></div>
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

function Providers() {
  return (
    <div className="lg-table-wrap">
      <table className="lg-table">
        <thead><tr><th>Prestataire</th><th>Rôle</th><th>Où</th></tr></thead>
        <tbody>
          {PROVIDERS.map((p) => (
            <tr key={p.name}>
              <td data-label="Prestataire"><a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a></td>
              <td data-label="Rôle">{p.role}</td>
              <td data-label="Où">{p.place}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Mentions légales ─────────────────────────────────────────────
function Mentions() {
  return (
    <>
      <h2>Éditeur du site</h2>
      <p>Le site {LEGAL.site} et l'application {LEGAL.brand} sont édités par :</p>
      <Editor />
      <h2>Hébergement</h2>
      <p>Le site est hébergé par <strong>Vercel Inc.</strong>, 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (vercel.com). Les données des comptes sont hébergées par <strong>Supabase</strong> dans l'Union européenne (Irlande).</p>
      <h2>Propriété intellectuelle</h2>
      <p>La marque {LEGAL.brand}, son logo, les textes, le design et le code du site sont protégés. Toute reproduction sans autorisation écrite est interdite. Les données que tu saisis (produits, ventes, clients, logo de ta boutique) restent à toi.</p>
      <h2>Nous contacter</h2>
      <p>Pour toute question, écris-nous <Contact />.</p>
    </>
  );
}

// ── Politique de confidentialité ─────────────────────────────────
function Privacy() {
  return (
    <>
      <p className="lg-lead">Cette politique explique quelles données {LEGAL.brand} utilise, pourquoi, combien de temps, et quels sont tes droits. Elle s'appuie sur la loi sénégalaise n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel.</p>

      <h2>1. Qui est responsable ?</h2>
      <p>{LEGAL.editorName ? <><strong>{LEGAL.editorName}</strong>, éditeur de {LEGAL.brand},</> : (MENTIONS_ONLINE ? <>L'éditeur de {LEGAL.brand} (voir les <Link to="/mentions-legales">mentions légales</Link>)</> : <>L'éditeur de {LEGAL.brand}</>)} est responsable des données de ton compte. Pour les données de <strong>tes clients</strong> que tu enregistres dans {LEGAL.brand} (nom, téléphone, adresse sur une vente ou une facture), c'est <strong>toi</strong> le responsable : {LEGAL.brand} les conserve pour ton compte, comme un prestataire, et ne s'en sert jamais pour autre chose.</p>

      <h2>2. Les données utilisées</h2>
      <ul>
        <li><strong>Ton compte</strong> : nom, nom de la boutique, téléphone, adresse e-mail, mot de passe (chiffré, jamais lisible par nous), date de dernière connexion.</li>
        <li><strong>Ton activité</strong> : produits, ventes, stock, pubs, dépenses, investissements, notes, challenges, épargne, reçus, factures et devis, logo et signature de tes reçus.</li>
        <li><strong>Les données de tes clients</strong> que tu choisis de saisir (nom, téléphone, adresse, e-mail sur une facture).</li>
        <li><strong>Ton abonnement et tes paiements</strong> : plan, dates, montants, référence et moyen de paiement (opérateur seulement : nous ne voyons jamais ton code secret ni ta carte).</li>
        <li><strong>Tes échanges avec le support</strong> (messagerie « Aide »).</li>
        <li><strong>Données techniques</strong> : type d'appareil quand tu installes l'application, et les éléments nécessaires à la sécurité (vérification anti-robots).</li>
      </ul>

      <h2>3. Pourquoi ?</h2>
      <ul>
        <li>Faire fonctionner ton espace : calculer ta marge, éditer tes reçus et factures, suivre ton stock (exécution du contrat).</li>
        <li>Gérer ton abonnement et tes paiements (exécution du contrat, obligations comptables).</li>
        <li>Sécuriser les comptes et bloquer les robots (intérêt légitime).</li>
        <li>T'envoyer les e-mails utiles au compte : confirmation, mot de passe oublié, invitation. Aucun e-mail publicitaire n'est envoyé sans ton accord.</li>
        <li>Répondre à tes messages au support.</li>
      </ul>
      <p><strong>Ce que nous ne faisons jamais</strong> : vendre tes données, les louer, faire de la publicité ciblée, ou utiliser les données de tes clients.</p>

      <h2>4. Qui y a accès ?</h2>
      <ul>
        <li><strong>Toi seul</strong> vois le contenu de ton espace. Chaque compte est cloisonné dans la base de données.</li>
        <li><strong>L'équipe {LEGAL.brand}</strong> ne voit que ce qui sert à gérer les abonnements (nom de la boutique, e-mail, plan, paiements, totaux). Elle ne voit <strong>jamais</strong> tes notes, ton épargne, tes challenges, ton stock détaillé, ni les noms et numéros de tes clients, et ne peut pas se connecter à ta place.</li>
        <li><strong>Les partenaires</strong> de {LEGAL.brand} ne voient que des totaux (nombre d'inscrits, d'abonnés, montants), sans aucune donnée personnelle.</li>
        <li><strong>Nos prestataires techniques</strong>, uniquement pour leur mission :</li>
      </ul>
      <Providers />
      <p>Certains de ces prestataires traitent des données hors du Sénégal (Union européenne, États-Unis). Nous les choisissons pour leurs garanties de sécurité et ne leur transmettons que le nécessaire.</p>

      <h2>5. Combien de temps ?</h2>
      <ul>
        <li>Les données de ton compte et de ton activité sont gardées <strong>tant que ton compte existe</strong>.</li>
        <li>Quand ton compte est supprimé, ton profil et <strong>toutes</strong> tes données (produits, ventes, clients, notes…) sont effacés. Seuls les paiements sont gardés, <strong>anonymisés</strong>, pour la comptabilité.</li>
        <li>Une invitation non utilisée expire au bout de 24 heures.</li>
      </ul>

      <h2>6. Sécurité</h2>
      <p>Connexion chiffrée (HTTPS), mots de passe chiffrés, cloisonnement de chaque compte dans la base de données, clés secrètes uniquement côté serveur, vérification anti-robots, journal des actions de l'équipe.</p>

      <h2>7. Tes droits</h2>
      <p>Tu peux à tout moment <strong>accéder</strong> à tes données, les <strong>corriger</strong> (la plupart directement dans Paramètres), t'<strong>opposer</strong> à un traitement ou demander la <strong>suppression</strong> de ton compte. Pour cela, écris-nous <Contact />. Nous répondons dans un délai d'un mois au plus.</p>
      <p>Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la <strong>Commission de Protection des Données Personnelles (CDP)</strong> du Sénégal : <a href="https://www.cdp.sn" target="_blank" rel="noopener noreferrer">www.cdp.sn</a>.</p>

      <h2>8. Changements</h2>
      <p>Si cette politique change de façon importante, nous te prévenons dans l'application ou par e-mail avant que le changement s'applique.</p>
    </>
  );
}

// ── CGU / CGV ────────────────────────────────────────────────────
function Terms() {
  return (
    <>
      <p className="lg-lead">Ces conditions s'appliquent à toute personne qui crée un compte {LEGAL.brand}. En créant ton compte, tu les acceptes.</p>

      <h2>1. Le service</h2>
      <p>{LEGAL.brand} est une application en ligne de gestion pour les e-commerçants : produits, ventes et reçus, factures et devis, stock, pubs, dépenses, investissements, marge et ROI. Elle s'utilise dans un navigateur ou installée sur le téléphone.</p>

      <h2>2. Ton compte</h2>
      <ul>
        <li>Tu dois donner des informations exactes et garder ton mot de passe secret. Tout ce qui est fait depuis ton compte est réputé fait par toi.</li>
        <li>Le compte est réservé à ton activité. Tu es responsable des données que tu saisis, notamment celles de tes clients : tu dois avoir le droit de les enregistrer.</li>
        <li>Interdit : utiliser {LEGAL.brand} pour une activité illégale, tenter d'accéder aux données d'un autre compte, perturber le service ou le copier.</li>
      </ul>

      <h2>3. Les plans</h2>
      <ul>
        <li><strong>Free</strong> : un essai gratuit, limité en nombre de documents (reçus, factures et devis) et en fonctionnalités.</li>
        <li><strong>Pro</strong> et <strong>Elite</strong> : abonnements payants donnant accès à plus de documents et à tous les outils (dépenses, investissements, challenges, stock…).</li>
        <li>Le contenu, les limites et les prix de chaque plan sont ceux affichés sur la page <Link to="/#tarifs">Tarifs</Link> et sur la page d'abonnement au moment du paiement. Les prix sont en francs CFA (F CFA / XOF).</li>
      </ul>

      <h2>4. Paiement</h2>
      <ul>
        <li>Le paiement se fait en ligne via notre prestataire <strong>Bictorys</strong> (Wave, Orange Money et autres moyens proposés à l'écran), ou par transfert Wave / Orange Money déclaré dans l'application puis validé par l'équipe.</li>
        <li>L'abonnement est payé <strong>à l'avance</strong> pour un mois ou pour un an (le paiement annuel donne des mois offerts, selon l'offre affichée).</li>
        <li><strong>Pas de renouvellement automatique</strong> : à la fin de la période, ton plan s'arrête et tu choisis librement de payer à nouveau.</li>
        <li>Si tu changes de plan payant en cours de période, les jours restants de l'ancien plan sont convertis au prorata des prix et ajoutés au nouveau plan.</li>
      </ul>

      <h2>5. Remboursement</h2>
      <p>Comme le service est accessible dès le paiement, une période payée n'est pas remboursable, sauf en cas de double paiement, d'erreur de facturation, ou d'impossibilité d'utiliser le service due à {LEGAL.brand}. Dans ces cas, écris-nous <Contact /> : nous remboursons ou prolongeons ton abonnement.</p>

      <h2>6. Tes documents (reçus, factures, devis)</h2>
      <p>{LEGAL.brand} t'aide à éditer tes documents, mais ils restent <strong>les tiens</strong> : tu es responsable de leur contenu et du respect de tes obligations (fiscales, comptables, envers tes clients). Les calculs (marge, bénéfice, ROI, stock) sont faits à partir des données que tu saisis.</p>

      <h2>7. Disponibilité</h2>
      <p>Nous faisons notre possible pour que {LEGAL.brand} soit disponible en permanence, mais des coupures peuvent arriver (maintenance, panne d'un prestataire, réseau). Pense à télécharger les documents importants.</p>

      <h2>8. Suspension et fin du compte</h2>
      <ul>
        <li>Tu peux demander la suppression de ton compte à tout moment <Contact />. Toutes tes données sont alors effacées (voir la <Link to="/confidentialite">politique de confidentialité</Link>).</li>
        <li>En cas de non-respect de ces conditions (fraude, abus, tentative d'accès à d'autres comptes), nous pouvons suspendre le compte, après t'avoir prévenu sauf urgence.</li>
      </ul>

      <h2>9. Responsabilité</h2>
      <p>{LEGAL.brand} est un outil d'aide à la gestion. Nous ne sommes pas responsables des décisions prises à partir de tes chiffres, ni des pertes dues à des données mal saisies. Notre responsabilité est limitée au montant que tu as payé pour la période en cours.</p>

      <h2>10. Changements des conditions</h2>
      <p>Nous pouvons faire évoluer ces conditions. Tu seras prévenu dans l'application ou par e-mail avant tout changement important. Les prix d'une période déjà payée ne changent pas.</p>

      <h2>11. Droit applicable</h2>
      <p>Ces conditions sont soumises au droit sénégalais. En cas de litige, nous cherchons d'abord une solution à l'amiable ; à défaut, les tribunaux de Dakar sont compétents.</p>
    </>
  );
}

// ── Cookies ──────────────────────────────────────────────────────
const STORAGE = [
  ['Session de connexion (sb-…-auth-token)', 'Te garder connecté', 'Jusqu\'à la déconnexion'],
  ['margee.hideAmounts', 'Se souvenir du « mode discret » (montants masqués)', 'Jusqu\'à ce que tu le changes'],
  ['margee.ref', 'Garder le code du lien de parrainage jusqu\'à ton inscription', '60 jours'],
  ['margee.pwa.*', 'Se souvenir si l\'application est installée ou si tu as reporté la proposition', 'Jusqu\'à effacement'],
  ['margee_celebrated_challenges', 'Ne pas répéter l\'animation d\'un challenge réussi', 'Jusqu\'à effacement'],
];

function Cookies() {
  return (
    <>
      <p className="lg-lead">{LEGAL.brand} n'utilise <strong>aucun cookie publicitaire</strong> et <strong>aucun outil de mesure d'audience</strong>. Nous ne te suivons pas d'un site à l'autre.</p>

      <h2>Ce qui est gardé sur ton appareil</h2>
      <p>Pour fonctionner, {LEGAL.brand} garde quelques informations dans le stockage de ton navigateur. Elles sont <strong>indispensables</strong> ou servent seulement ton confort ; elles ne quittent pas ton appareil, sauf la session de connexion qui est envoyée à notre serveur pour t'identifier.</p>
      <div className="lg-table-wrap">
        <table className="lg-table">
          <thead><tr><th>Élément</th><th>À quoi il sert</th><th>Durée</th></tr></thead>
          <tbody>
            {STORAGE.map(([k, v, d]) => (
              <tr key={k}><td data-label="Élément"><code>{k}</code></td><td data-label="À quoi il sert">{v}</td><td data-label="Durée">{d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Services tiers</h2>
      <ul>
        <li><strong>Cloudflare Turnstile</strong> (anti-robots, sur la connexion et l'inscription) peut utiliser des données techniques pour vérifier que tu n'es pas un robot.</li>
        <li><strong>Google</strong> : si tu choisis « Continuer avec Google », la connexion se fait sur une page de Google, selon ses propres règles. Les polices d'écriture du site sont aussi chargées depuis Google Fonts.</li>
        <li><strong>Paiement</strong> : la page de paiement Bictorys a ses propres règles.</li>
      </ul>

      <h2>Comment les effacer ?</h2>
      <p>Tu peux effacer ces informations à tout moment dans les réglages de ton navigateur (« Effacer les données du site »). Tu seras alors déconnecté et tes préférences seront remises à zéro. Comme aucun de ces éléments n'est publicitaire, aucun bandeau de consentement n'est nécessaire.</p>
    </>
  );
}

const CONTENT = {
  '/mentions-legales': { title: 'Mentions légales', body: Mentions },
  '/confidentialite': { title: 'Politique de confidentialité', body: Privacy },
  '/cgu': { title: 'Conditions générales d\'utilisation et de vente', body: Terms },
  '/cookies': { title: 'Cookies et stockage', body: Cookies },
};

export default function Legal({ page }) {
  const c = CONTENT[page];
  useEffect(() => {
    document.title = `${c.title} · ${LEGAL.brand}`;
    window.scrollTo(0, 0);
    return () => { document.title = 'Margee+'; };
  }, [c.title]);
  const Body = c.body;
  return (
    <div className="lg">
      <header className="lg-header">
        <Link to="/" className="lg-logo" aria-label="Margee+ — accueil">
          <img src="/margee-mark.svg" alt="" width="32" height="32" />
          <span>MARGEE+</span>
        </Link>
        <Link to="/" className="lg-back"><i className="ti ti-arrow-left" aria-hidden="true" /> Retour au site</Link>
      </header>
      <nav className="lg-tabs" aria-label="Pages légales">
        {LEGAL_PAGES.map((p) => (
          <NavLink key={p.path} to={p.path} className={({ isActive }) => (isActive ? 'is-on' : '')}>{p.label}</NavLink>
        ))}
      </nav>
      <main className="lg-main">
        <h1>{c.title}</h1>
        <p className="lg-date">Dernière mise à jour : {LEGAL.updatedAt}</p>
        <Body />
      </main>
      <footer className="lg-footer">© 2026 {LEGAL.brand}</footer>
    </div>
  );
}
