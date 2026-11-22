/**
 * Génère les icônes de l'application (PWA) à partir du « M » Margee+.
 *   npm run icons
 * Sorties dans public/icons/ :
 *   pwa-192.png, pwa-512.png        icônes standard (carré arrondi noir)
 *   pwa-maskable-512.png            plein cadre #1B1D21, logo dans la zone
 *                                   de sécurité (80 % centraux) pour les
 *                                   formes rondes / gouttes d'Android
 *   apple-touch-icon.png (180)      iPhone / iPad (plein cadre, iOS arrondit)
 *   favicon-32.png                  onglets
 * Le tracé reprend exactement public/margee-mark.svg.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

// Tracés du logo dans un repère 64 × 64 (identiques au SVG du site)
const MARK = `
  <path d="M16 47V21l14 14 15-15" fill="none" stroke="#D4A03A" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M37 18h11v11" fill="none" stroke="#D4A03A" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M46 34v13" fill="none" stroke="#FAF7F0" stroke-width="6.5" stroke-linecap="round"/>`;

/** Icône standard : carré arrondi noir comme le logo du site */
const rounded = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="15" fill="#0F1115"/>${MARK}</svg>`;

/** Plein cadre : fond uni, logo réduit et centré (scale = part du cadre) */
const fullBleed = (scale) => {
  const s = scale;
  const t = (64 - 64 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#1B1D21"/>
  <g transform="translate(${t} ${t}) scale(${s})">${MARK}</g></svg>`;
};

const render = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil((size / 64) * 72)) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));

await render(rounded(), 192, 'pwa-192.png');
await render(rounded(), 512, 'pwa-512.png');
// Zone de sécurité Android : cercle de 80 % du cadre → logo à 62 %
await render(fullBleed(0.62), 512, 'pwa-maskable-512.png');
// iOS arrondit lui-même les coins : plein cadre, logo un peu plus grand
await render(fullBleed(0.78), 180, 'apple-touch-icon.png');
await render(rounded(), 32, 'favicon-32.png');
console.log('Icônes générées dans public/icons/');
