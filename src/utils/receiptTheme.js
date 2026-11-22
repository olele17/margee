/**
 * Couleurs du reçu (Paramètres → Personnalisation du reçu).
 * Une seule source pour l'aperçu de Paramètres ET le PDF : ce que
 * l'e-commerçant voit est ce qui sort à l'impression.
 *
 *   primary : bandeau du tableau « Description / Montant »
 *   accent  : bande « Total payé » et « Merci pour votre confiance »
 * Les teintes claires (bloc client, notes) et la couleur du texte posé
 * sur chaque couleur (blanc ou noir) sont calculées pour rester lisibles.
 */
export const DEFAULT_RECEIPT_COLORS = { primary: '#14161C', accent: '#D4A03A' };

export const RECEIPT_THEMES = [
  { id: 'margee', label: 'Margee+', primary: '#14161C', accent: '#D4A03A' },
  { id: 'nuit', label: 'Bleu nuit', primary: '#1E3A5F', accent: '#4EA8DE' },
  { id: 'foret', label: 'Forêt', primary: '#1B4332', accent: '#52B788' },
  { id: 'bordeaux', label: 'Bordeaux', primary: '#5C1A2E', accent: '#E07A5F' },
  { id: 'violet', label: 'Violet', primary: '#3C1E70', accent: '#B388EB' },
  { id: 'terre', label: 'Terre', primary: '#5A3A22', accent: '#E9A23B' },
  { id: 'rose', label: 'Rose', primary: '#7A1E48', accent: '#F28CB1' },
  { id: 'ocean', label: 'Océan', primary: '#0B4F6C', accent: '#20BF55' },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;
export const isHexColor = (v) => HEX.test(String(v || ''));

export function hexToRgb(hex) {
  const h = isHexColor(hex) ? hex.slice(1) : '000000';
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
/** Mélange vers une autre couleur (t = 0 : couleur d'origine, 1 : cible) */
const mix = (rgb, target, t) => rgb.map((c, i) => c + (target[i] - c) * t);

// Luminance relative (WCAG) et contraste
function luminance([r, g, b]) {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const WHITE = [255, 255, 255];
const INK = [20, 22, 28];

/** Texte lisible (blanc ou encre) posé sur une couleur de fond */
const onColor = (rgb) => (contrast(rgb, WHITE) >= contrast(rgb, INK) ? WHITE : INK);

/** Assombrit une couleur jusqu'à un contraste suffisant sur fond blanc (texte) */
function readableOnWhite(rgb) {
  let c = rgb;
  for (let i = 0; i < 12 && contrast(c, WHITE) < 4.5; i++) c = mix(c, INK, 0.15);
  return c;
}

/**
 * Couleurs du reçu prêtes à l'emploi (tableaux RGB pour le PDF, hex pour
 * l'écran). rs = account.receiptSettings (ou les valeurs du formulaire).
 */
export function getReceiptColors(rs = {}) {
  const primary = hexToRgb(isHexColor(rs.colorPrimary) ? rs.colorPrimary : DEFAULT_RECEIPT_COLORS.primary);
  const accent = hexToRgb(isHexColor(rs.colorAccent) ? rs.colorAccent : DEFAULT_RECEIPT_COLORS.accent);
  const rgb = {
    primary,
    onPrimary: onColor(primary),
    accent,
    onAccent: onColor(accent),
    tint: mix(accent, WHITE, 0.9),     // bloc client
    noteBg: mix(accent, WHITE, 0.8),   // notes
    thanks: readableOnWhite(accent),   // « Merci pour votre confiance »
  };
  const hex = Object.fromEntries(Object.entries(rgb).map(([k, v]) => [k, toHex(v)]));
  return { rgb, hex };
}

/** Thème prédéfini correspondant aux couleurs choisies (sinon « Personnalisé ») */
export function matchTheme(primary, accent) {
  const p = String(primary || DEFAULT_RECEIPT_COLORS.primary).toLowerCase();
  const a = String(accent || DEFAULT_RECEIPT_COLORS.accent).toLowerCase();
  return RECEIPT_THEMES.find((t) => t.primary.toLowerCase() === p && t.accent.toLowerCase() === a)?.id || 'custom';
}
