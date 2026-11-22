/**
 * Factures et devis : libellés, statuts et calcul des montants.
 * Le calcul reprend EXACTEMENT celui de la base (private.documents_prepare)
 * pour afficher les totaux pendant la saisie ; c'est la base qui fait foi.
 */
export const KIND_LABELS = { quote: 'Devis', invoice: 'Facture' };

export const STATUS = {
  quote: {
    draft: { label: 'Brouillon', cls: 'progress', icon: 'ti-pencil' },
    sent: { label: 'Envoyé', cls: 'pending', icon: 'ti-send' },
    accepted: { label: 'Accepté', cls: 'ok', icon: 'ti-circle-check' },
    refused: { label: 'Refusé', cls: 'off', icon: 'ti-circle-x' },
  },
  invoice: {
    draft: { label: 'Brouillon', cls: 'progress', icon: 'ti-pencil' },
    sent: { label: 'Envoyée', cls: 'pending', icon: 'ti-send' },
    paid: { label: 'Payée', cls: 'ok', icon: 'ti-circle-check' },
    cancelled: { label: 'Annulée', cls: 'off', icon: 'ti-ban' },
    late: { label: 'En retard', cls: 'off', icon: 'ti-alert-triangle' },
  },
};

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Dakar' });

/** Statut affiché : une facture envoyée dont l'échéance est passée est « en retard » */
export function displayStatus(doc) {
  if (doc.kind === 'invoice' && doc.status === 'sent' && doc.dueDate && doc.dueDate < todayIso()) return 'late';
  return doc.status;
}

export function statusInfo(doc) {
  return STATUS[doc.kind]?.[displayStatus(doc)] || { label: doc.status, cls: 'progress', icon: 'ti-point' };
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Montants (arrondis au franc comme dans la base) */
export function computeTotals(items = [], discountPercent = 0, taxRate = 0) {
  const lines = items.map((it) => Math.round(num(it.qty) * num(it.unitPrice)));
  const subtotal = lines.reduce((a, b) => a + b, 0);
  const discountAmount = Math.round((subtotal * num(discountPercent)) / 100);
  const taxAmount = Math.round(((subtotal - discountAmount) * num(taxRate)) / 100);
  return { lines, subtotal, discountAmount, taxAmount, total: subtotal - discountAmount + taxAmount };
}

export const emptyLine = () => ({ description: '', qty: '1', unitPrice: '' });

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export { todayIso };
