/**
 * Mention « Créé avec Margee+ » en bas des PDF (reçus, factures, devis)
 * pour les comptes du plan Free (essai gratuit ou ancien Free). Les
 * clients Pro et Elite ont des documents sans mention Margee+.
 */
export const MARGEE_URL = 'margee.vercel.app';

/** Compte sur le plan gratuit : la mention Margee+ est ajoutée */
export function isFreeTier(account) {
  const plan = account?.subscription?.plan;
  return !plan || plan === 'free';
}

/**
 * Dessine la mention juste au-dessus du pied de page.
 * yBottom : hauteur (mm) de la ligne de contact du pied de page.
 */
export function drawFreeBranding(doc, account, pageW, yBottom) {
  if (!isFreeTier(account)) return;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(148, 106, 18); // or foncé Margee+
  doc.text(`Créé gratuitement avec Margee+  ·  ${MARGEE_URL}`, pageW / 2, yBottom - 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
}
