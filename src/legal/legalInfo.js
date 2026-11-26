/**
 * Informations légales de l'éditeur de Margee+ : UN SEUL endroit à
 * mettre à jour. Une valeur à null n'est pas affichée.
 * Ne jamais inventer : ces informations engagent l'éditeur.
 */
export const LEGAL = {
  updatedAt: '26 novembre 2026',
  brand: 'Margee+',
  site: 'www.margeeplus.com',
  // Éditeur (personne ou société qui exploite Margee+)
  editorName: null,        // ex. « OLELE Systems SARL » ou « Prénom Nom, entrepreneur individuel »
  legalForm: null,         // ex. « SARL au capital de 1 000 000 F CFA »
  rccm: null,              // ex. « SN-DKR-2026-B-12345 »
  ninea: null,
  address: null,           // ex. « Dakar, Sénégal »
  email: null,             // ex. « contact@margeeplus.com »
  phone: null,
  publicationDirector: null,
  country: 'Sénégal',
};

/** Prestataires techniques (vérifiés dans le code et la configuration). */
export const PROVIDERS = [
  { name: 'Vercel Inc.', role: 'Hébergement du site web', place: 'États-Unis (réseau mondial)', url: 'https://vercel.com' },
  { name: 'Supabase Inc.', role: 'Base de données, comptes et connexion', place: 'Union européenne (Irlande)', url: 'https://supabase.com' },
  { name: 'Resend', role: 'Envoi des e-mails (confirmation, mot de passe, invitations)', place: 'États-Unis', url: 'https://resend.com' },
  { name: 'Bictorys', role: 'Paiement en ligne des abonnements (Wave, Orange Money…)', place: 'Sénégal', url: 'https://bictorys.com' },
  { name: 'Cloudflare (Turnstile)', role: 'Vérification anti-robots sur la connexion et l\'inscription', place: 'États-Unis (réseau mondial)', url: 'https://www.cloudflare.com' },
  { name: 'jsDelivr', role: 'Diffusion des icônes du site', place: 'Réseau mondial', url: 'https://www.jsdelivr.com' },
  { name: 'Google', role: 'Connexion avec Google (si tu la choisis) et polices d\'écriture du site', place: 'États-Unis (réseau mondial)', url: 'https://policies.google.com/privacy' },
];
