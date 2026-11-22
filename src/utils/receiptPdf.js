import { jsPDF } from 'jspdf';
import { fmt } from './calc';
import { amountInWordsFcfa } from './numberToWords';
import { getReceiptColors } from './receiptTheme';
import { drawFreeBranding } from './pdfBrand';

const FULL_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFr(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${FULL_MONTHS[m - 1]} ${y}`;
}

// Couleurs fixes (texte, filets). Les couleurs de marque du reçu
// (bandeau, total, teintes) viennent des réglages de l'e-commerçant :
// voir receiptTheme.js (Margee+ noir et or par défaut).
const INK = [20, 22, 28];          // #14161C
const GRAY_TEXT = [91, 100, 114];  // #5B6472
const LINE = [233, 227, 214];      // #E9E3D6

// Format d'image d'après l'en-tête du data URL (PNG, JPEG, WEBP)
const imageFormat = (dataUrl) => {
  const m = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl || '');
  if (!m) return 'PNG';
  return m[1].toLowerCase().startsWith('jp') ? 'JPEG' : m[1].toUpperCase();
};

// Ajoute une image dans une boîte max (largeur x hauteur) sans la déformer,
// alignée en haut à droite de la boîte.
function addImageFit(doc, dataUrl, rightEdge, top, maxW, maxH) {
  try {
    const { width, height } = doc.getImageProperties(dataUrl);
    const ratio = Math.min(maxW / width, maxH / height);
    const w = width * ratio;
    const h = height * ratio;
    doc.addImage(dataUrl, imageFormat(dataUrl), rightEdge - w, top, w, h, undefined, 'FAST');
  } catch (e) {
    /* image illisible : on l'ignore pour ne pas bloquer le reçu */
  }
}

// jsPDF (polices standard) n'affiche pas l'espace fine insécable utilisée par
// toLocaleString('fr-FR') — on la remplace par une espace normale pour le PDF.
const f = (n) => fmt(n).replace(/[   ]/g, ' ');

export function downloadReceiptPdf(account, sale) {
  const rs = account.receiptSettings || {};
  const C = getReceiptColors(rs).rgb;
  const contactEmail = rs.email || account.email;
  const doc = new jsPDF({ format: 'a5', unit: 'mm' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const rightX = pageW - marginX;
  let y = 16;

  // ── Titre + logo ──────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text('REÇU DE PAIEMENT', marginX, y);

  if (rs.logo) {
    addImageFit(doc, rs.logo, rightX, y - 12, 32, 18);
  }

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(`Numéro : ${sale.receiptNumber}`, marginX, y);

  y += 6;
  doc.setDrawColor(...LINE);
  doc.line(marginX, y, rightX, y);

  // ── Bloc entreprise / date ──────────────────────────────────
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(account.businessName || 'Mon Business', marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(rs.city ? `Fait à : ${rs.city}` : '', rightX, y, { align: 'right' });

  let yLeft = y + 5;
  if (rs.address) { doc.text(rs.address, marginX, yLeft); yLeft += 5; }
  if (account.phone) { doc.text(`Tél : ${account.phone}`, marginX, yLeft); yLeft += 5; }
  if (contactEmail) { doc.text(`Email : ${contactEmail}`, marginX, yLeft); yLeft += 5; }

  doc.text(`Date du reçu : ${formatDateFr(sale.date)}`, rightX, y + 5, { align: 'right' });

  y = Math.max(yLeft, y + 10) + 4;

  // ── Bloc client ──────────────────────────────────────────
  const clientBoxH = sale.clientAddress || sale.clientPhone ? 20 : 15;
  doc.setFillColor(...C.tint);
  doc.rect(marginX, y, rightX - marginX, clientBoxH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_TEXT);
  doc.text('REÇU DE :', marginX + 4, y + 6);
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(sale.clientName || 'Client', marginX + 4, y + 12);
  if (sale.clientAddress || sale.clientPhone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_TEXT);
    const line = [sale.clientAddress ? `Ville : ${sale.clientAddress}` : null, sale.clientPhone ? `Téléphone : ${sale.clientPhone}` : null]
      .filter(Boolean).join('   |   ');
    doc.text(line, marginX + 4, y + 17);
  }
  y += clientBoxH + 10;

  // ── Table description / montant ─────────────────────────
  doc.setFillColor(...C.primary);
  doc.rect(marginX, y, rightX - marginX, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.onPrimary);
  doc.text('DESCRIPTION', marginX + 4, y + 5.5);
  doc.text('MONTANT (FCFA)', rightX - 4, y + 5.5, { align: 'right' });
  y += 8;

  const rows = [{ label: `${sale.productName}  (Qté : ${sale.qty} × ${f(sale.price)})`, amount: sale.qty * sale.price }];
  if (Number(sale.deliveryCost) > 0 && sale.deliveryPaidByClient) {
    rows.push({ label: 'Frais de livraison', amount: Number(sale.deliveryCost) });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  rows.forEach((row) => {
    y += 8;
    doc.setTextColor(40, 40, 40);
    doc.text(row.label, marginX + 4, y, { maxWidth: rightX - marginX - 40 });
    doc.setFont('helvetica', 'bold');
    doc.text(f(row.amount), rightX - 4, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  });
  y += 6;
  doc.setDrawColor(...LINE);
  doc.line(marginX, y, rightX, y);

  // ── Total payé ───────────────────────────────────────────
  const total = rows.reduce((a, r) => a + r.amount, 0);
  y += 8;
  doc.setFillColor(...C.accent);
  doc.rect(marginX, y - 6, rightX - marginX, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.onAccent);
  doc.text('TOTAL PAYÉ :', marginX + 4, y + 1);
  doc.text(f(total), rightX - 4, y + 1, { align: 'right' });
  y += 12;

  // ── Montant en lettres ───────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text('Arrêté le présent reçu à la somme de :', marginX, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(amountInWordsFcfa(total), marginX, y, { maxWidth: rightX - marginX });
  y += 8;

  // ── Notes ──────────────────────────────────────────────
  if (rs.note) {
    const noteLines = doc.splitTextToSize(rs.note, rightX - marginX - 8);
    const noteBoxH = 8 + noteLines.length * 4.2;
    doc.setFillColor(...C.noteBg);
    doc.rect(marginX, y, rightX - marginX, noteBoxH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY_TEXT);
    doc.text('NOTES / COMMENTAIRES :', marginX + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(50, 50, 50);
    doc.text(noteLines, marginX + 4, y + 10);
    y += noteBoxH + 8;
  } else {
    y += 4;
  }

  // ── Merci ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.thanks);
  doc.text('MERCI POUR VOTRE CONFIANCE !', pageW / 2, y, { align: 'center' });
  y += 12;

  // ── Pied de page : date + signature ─────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(`Fait à ${rs.city || '—'}, le ${formatDateFr(sale.date)}`, marginX, y);

  doc.text('Pour l\'entreprise (Signature et Cachet) :', rightX, y, { align: 'right' });
  if (rs.signatureImage) {
    addImageFit(doc, rs.signatureImage, rightX, y + 3, 38, 16);
  } else {
    doc.setDrawColor(180, 180, 180);
    doc.line(rightX - 38, y + 16, rightX, y + 16);
  }

  // ── Footer contact ───────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7.5);
  doc.setTextColor(150, 150, 150);
  const footer = [account.businessName, rs.address, account.phone && `Tél : ${account.phone}`, contactEmail && `Email : ${contactEmail}`]
    .filter(Boolean).join('  •  ');
  doc.text(footer, pageW / 2, pageH - 8, { align: 'center', maxWidth: rightX - marginX });
  // Plan Free : « Créé gratuitement avec Margee+ »
  drawFreeBranding(doc, account, pageW, pageH - 8);

  doc.save(`Recu_${sale.receiptNumber}.pdf`);
}
