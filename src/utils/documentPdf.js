import { jsPDF } from 'jspdf';
import { fmt } from './calc';
import { amountInWordsFcfa } from './numberToWords';
import { getReceiptColors } from './receiptTheme';
import { drawFreeBranding } from './pdfBrand';
import { KIND_LABELS } from './documents';

/**
 * PDF d'une facture ou d'un devis (A4). Même personnalisation que les
 * reçus : logo, couleurs, signature et coordonnées (Paramètres), et la
 * mention « Créé avec Margee+ » sur le plan Free.
 */
const FULL_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateFr(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${FULL_MONTHS[m - 1]} ${y}`;
}

const INK = [20, 22, 28];
const GRAY = [91, 100, 114];
const LINE = [233, 227, 214];
const GREEN = [30, 122, 76];
// jsPDF n'affiche pas l'espace fine insécable de toLocaleString('fr-FR')
const f = (n) => fmt(n).replace(/\s/g, ' ');
const qtyFr = (q) => String(Number(q)).replace('.', ',');
const pct = (p) => `${String(Number(p)).replace('.', ',')} %`;

const imageFormat = (dataUrl) => {
  const m = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl || '');
  if (!m) return 'PNG';
  return m[1].toLowerCase().startsWith('jp') ? 'JPEG' : m[1].toUpperCase();
};
function addImageFit(doc, dataUrl, rightEdge, top, maxW, maxH) {
  try {
    const { width, height } = doc.getImageProperties(dataUrl);
    const r = Math.min(maxW / width, maxH / height);
    doc.addImage(dataUrl, imageFormat(dataUrl), rightEdge - width * r, top, width * r, height * r, undefined, 'FAST');
  } catch { /* image illisible : ignorée */ }
}

export function buildDocumentPdf(account, d) {
  const rs = account.receiptSettings || {};
  const C = getReceiptColors(rs).rgb;
  const contactEmail = rs.email || account.email;
  const isQuote = d.kind === 'quote';
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mX = 16;
  const rX = pageW - mX;
  const bottomLimit = pageH - 28;

  const footer = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    const line = [account.businessName, rs.address, account.phone && `Tél : ${account.phone}`, contactEmail && `Email : ${contactEmail}`]
      .filter(Boolean).join('  •  ');
    doc.text(line, pageW / 2, pageH - 10, { align: 'center', maxWidth: rX - mX });
    drawFreeBranding(doc, account, pageW, pageH - 10);
  };

  // ── En-tête ────────────────────────────────────────────────
  let y = 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...C.primary);
  doc.text(KIND_LABELS[d.kind].toUpperCase(), mX, y);
  if (rs.logo) addImageFit(doc, rs.logo, rX, y - 14, 40, 22);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text(`N° ${d.number}`, mX, y);
  y += 5;
  doc.text(`Date : ${dateFr(d.issueDate)}`, mX, y);
  if (d.dueDate) {
    y += 5;
    doc.text(`${isQuote ? 'Valable jusqu\'au' : 'Échéance'} : ${dateFr(d.dueDate)}`, mX, y);
  }
  if (!isQuote && d.status === 'paid') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...GREEN);
    doc.text(`PAYÉE${d.paidAt ? ` LE ${dateFr(d.paidAt).toUpperCase()}` : ''}`, rX, y, { align: 'right' });
  }
  y += 5;
  doc.setDrawColor(...LINE);
  doc.line(mX, y, rX, y);

  // ── Émetteur (gauche) et client (droite) ──────────────────
  y += 8;
  const colW = (rX - mX - 8) / 2;
  const top = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('ÉMETTEUR', mX, y);
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(account.businessName || 'Mon entreprise', mX, y + 6, { maxWidth: colW });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  let yl = y + 11;
  [rs.address, rs.city, account.phone && `Tél : ${account.phone}`, contactEmail && `Email : ${contactEmail}`].filter(Boolean)
    .forEach((t) => { doc.text(String(t), mX, yl, { maxWidth: colW }); yl += 4.6; });

  const cx = mX + colW + 8;
  const clientLines = [d.clientAddress, d.clientPhone && `Tél : ${d.clientPhone}`, d.clientEmail && `Email : ${d.clientEmail}`].filter(Boolean);
  const boxH = 16 + clientLines.length * 4.6;
  doc.setFillColor(...C.tint);
  doc.roundedRect(cx, top - 5, colW, boxH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(isQuote ? 'DEVIS POUR' : 'FACTURÉ À', cx + 4, top + 1);
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(d.clientName, cx + 4, top + 7, { maxWidth: colW - 8 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  let yc = top + 12;
  clientLines.forEach((t) => { doc.text(String(t), cx + 4, yc, { maxWidth: colW - 8 }); yc += 4.6; });
  y = Math.max(yl, top - 5 + boxH) + 8;

  // ── Tableau des lignes ─────────────────────────────────────
  const cols = { qty: rX - 72, price: rX - 40, total: rX - 4 };
  const header = () => {
    doc.setFillColor(...C.primary);
    doc.rect(mX, y, rX - mX, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.onPrimary);
    doc.text('DÉSIGNATION', mX + 4, y + 6);
    doc.text('QTÉ', cols.qty, y + 6, { align: 'right' });
    doc.text('PRIX UNIT.', cols.price, y + 6, { align: 'right' });
    doc.text('TOTAL (FCFA)', cols.total, y + 6, { align: 'right' });
    y += 9;
  };
  header();
  doc.setFontSize(9.5);
  d.items.forEach((it, i) => {
    const desc = doc.splitTextToSize(it.description, cols.qty - mX - 24);
    const h = Math.max(9, desc.length * 4.4 + 4.6);
    if (y + h > bottomLimit) {
      footer();
      doc.addPage();
      y = 20;
      header();
      doc.setFontSize(9.5);
    }
    if (i % 2 === 1) {
      doc.setFillColor(250, 249, 246);
      doc.rect(mX, y, rX - mX, h, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(desc, mX + 4, y + 6);
    doc.text(qtyFr(it.qty), cols.qty, y + 6, { align: 'right' });
    doc.text(f(it.unitPrice), cols.price, y + 6, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(f(it.total ?? Math.round(it.qty * it.unitPrice)), cols.total, y + 6, { align: 'right' });
    y += h;
  });
  doc.setDrawColor(...LINE);
  doc.line(mX, y, rX, y);

  // ── Totaux ─────────────────────────────────────────────────
  const rows = [['Sous-total', f(d.subtotal)]];
  if (d.discountAmount > 0) rows.push([`Remise (${pct(d.discountPercent)})`, `- ${f(d.discountAmount)}`]);
  if (d.taxRate > 0) {
    rows.push(['Total HT', f(d.subtotal - d.discountAmount)]);
    rows.push([`TVA (${pct(d.taxRate)})`, f(d.taxAmount)]);
  }
  if (y + rows.length * 6 + 40 > bottomLimit) { footer(); doc.addPage(); y = 20; }
  y += 7;
  const lx = rX - 82;
  doc.setFontSize(9.5);
  rows.forEach(([l, v]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(l, lx, y);
    doc.setTextColor(...INK);
    doc.text(v, rX - 4, y, { align: 'right' });
    y += 6;
  });
  doc.setFillColor(...C.accent);
  doc.rect(lx - 4, y - 4, rX - lx + 4, 11, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...C.onAccent);
  doc.text(d.taxRate > 0 ? 'TOTAL TTC' : (isQuote ? 'TOTAL' : 'TOTAL À PAYER'), lx, y + 3.2);
  doc.text(f(d.total), rX - 4, y + 3.2, { align: 'right' });
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`${isQuote ? 'Arrêté le présent devis' : 'Arrêtée la présente facture'} à la somme de :`, mX, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(amountInWordsFcfa(d.total), mX, y, { maxWidth: rX - mX });
  y += 9;

  // ── Notes / conditions ─────────────────────────────────────
  if (d.notes) {
    const lines = doc.splitTextToSize(d.notes, rX - mX - 8);
    const h = 9 + lines.length * 4.3;
    if (y + h > bottomLimit) { footer(); doc.addPage(); y = 20; }
    doc.setFillColor(...C.noteBg);
    doc.rect(mX, y, rX - mX, h, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(isQuote ? 'CONDITIONS / NOTES' : 'CONDITIONS DE PAIEMENT / NOTES', mX + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(50, 50, 50);
    doc.text(lines, mX + 4, y + 10);
    y += h + 8;
  }

  // ── Signatures ─────────────────────────────────────────────
  if (y + 34 > bottomLimit) { footer(); doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  if (isQuote) {
    doc.text('Bon pour accord (date et signature du client) :', mX, y);
    doc.setDrawColor(190, 190, 190);
    doc.rect(mX, y + 3, 70, 24);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.thanks);
    doc.text('MERCI POUR VOTRE CONFIANCE !', mX, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
  }
  doc.text('Pour l\'entreprise (signature et cachet) :', rX, y, { align: 'right' });
  if (rs.signatureImage) addImageFit(doc, rs.signatureImage, rX, y + 3, 45, 20);
  else { doc.setDrawColor(180, 180, 180); doc.line(rX - 45, y + 22, rX, y + 22); }

  footer();
  return doc;
}

export function downloadDocumentPdf(account, d) {
  buildDocumentPdf(account, d).save(`${d.kind === 'quote' ? 'Devis' : 'Facture'}_${d.number}.pdf`);
}
