const ONES = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function underHundred(n) {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7 || ten === 9) return `${TENS[ten]}-${ONES[10 + unit]}`;
  if (unit === 0) return ten === 8 ? `${TENS[ten]}s` : TENS[ten];
  if (unit === 1 && ten !== 8) return `${TENS[ten]}-et-un`;
  return `${TENS[ten]}-${ONES[unit]}`;
}

function underThousand(n) {
  if (n < 100) return underHundred(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const hWord = h === 1 ? 'cent' : `${ONES[h]} cent`;
  if (rest === 0) return h > 1 ? `${hWord}s` : hWord;
  return `${hWord} ${underHundred(rest)}`;
}

/** Convertit un montant entier en toutes lettres, en français. */
export function numberToWordsFr(num) {
  const n = Math.round(Math.abs(Number(num) || 0));
  if (n === 0) return 'zéro';

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts = [];
  if (millions) parts.push(`${millions === 1 ? 'un' : underThousand(millions)} million${millions > 1 ? 's' : ''}`);
  if (thousands) parts.push(`${thousands === 1 ? '' : underThousand(thousands) + ' '}mille`.trim());
  if (rest) parts.push(underThousand(rest));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Montant en toutes lettres, prêt pour affichage sur un reçu FCFA. */
export function amountInWordsFcfa(num) {
  return `${numberToWordsFr(num).toUpperCase()} FRANCS CFA`;
}
