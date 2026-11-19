/**
 * Données d'exemple pour le compte de démonstration.
 * Tout est fictif et généré de façon déterministe sur les 6 derniers mois
 * (jusqu'à aujourd'hui), pour que le dashboard et les comparaisons
 * mensuelles aient de quoi s'afficher.
 */

export const DEMO_EMAIL = 'demo@margee.app';
export const DEMO_PASSWORD = 'demo1234';

// Générateur pseudo-aléatoire stable (mêmes données à chaque réinitialisation)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PRODUCTS = [
  { id: 'p1', name: 'Sac à main cuir', category: 'Maroquinerie', costPrice: 9500, price: 18500 },
  { id: 'p2', name: 'Montre bracelet acier', category: 'Accessoires', costPrice: 7000, price: 15000 },
  { id: 'p3', name: 'Parfum 100 ml', category: 'Beauté', costPrice: 6500, price: 13000 },
  { id: 'p4', name: 'Sneakers blanches', category: 'Chaussures', costPrice: 12000, price: 22000 },
  { id: 'p5', name: 'Lunettes de soleil', category: 'Accessoires', costPrice: 3000, price: 7500 },
  { id: 'p6', name: 'Écouteurs sans fil', category: 'High-tech', costPrice: 8000, price: 16000 },
];

const CLIENTS = [
  ['Awa Diop', '77 412 18 30', 'Sacré-Cœur, Dakar'],
  ['Moussa Ndiaye', '78 220 45 11', 'Parcelles Assainies, Dakar'],
  ['Fatou Sarr', '76 908 33 72', 'Mermoz, Dakar'],
  ['Ibrahima Fall', '77 650 12 09', 'Thiès'],
  ['Aminata Ba', '70 315 88 64', 'Pikine'],
  ['Cheikh Sow', '78 471 90 25', 'Rufisque'],
  ['Mariama Cissé', '77 133 67 48', 'Almadies, Dakar'],
  ['Ousmane Diallo', '76 554 20 87', 'Guédiawaye'],
  ['Khady Mbaye', '77 289 03 56', 'Ouakam, Dakar'],
  ['Pape Gueye', '78 902 74 13', 'Mbour'],
];

const iso = (d) => d.toISOString().slice(0, 10);

export function buildDemoData(accountId) {
  const rand = rng(20261119);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const sales = [];
  const ads = [];
  const expenses = [];
  const seqByYear = {};

  for (let m = 0; m < 6; m++) {
    const first = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const isCurrent = m === 5;
    const lastDay = isCurrent ? now.getDate() : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    // Activité en croissance d'un mois à l'autre. Le mois en cours est déjà
    // au-dessus du mois précédent, pour que les tendances du dashboard
    // (mois en cours vs mois précédent) montrent une progression.
    const nbSales = isCurrent ? 36 : 10 + m * 4;

    for (let i = 0; i < nbSales; i++) {
      const day = 1 + Math.floor(rand() * lastDay);
      const date = new Date(first.getFullYear(), first.getMonth(), day, 12);
      const p = pick(PRODUCTS);
      const [clientName, clientPhone, clientAddress] = pick(CLIENTS);
      const delivery = rand() < 0.6 ? pick([1000, 1500, 2000, 2500]) : 0;
      sales.push({
        date: iso(date),
        productId: p.id,
        productName: p.name,
        qty: rand() < 0.8 ? 1 : 2,
        costPrice: p.costPrice,
        price: p.price,
        clientName,
        clientPhone,
        clientAddress,
        deliveryCost: delivery,
        deliveryPaidByClient: delivery > 0 && rand() < 0.5,
      });
    }

    // Pubs : 3 à 4 campagnes par mois
    const nbAds = 3 + (rand() < 0.5 ? 1 : 0);
    for (let i = 0; i < nbAds; i++) {
      const day = 1 + Math.floor(rand() * lastDay);
      ads.push({
        id: `a${m}${i}`,
        date: iso(new Date(first.getFullYear(), first.getMonth(), day, 12)),
        platform: pick(['Meta', 'Meta', 'TikTok', 'WhatsApp']),
        amount: pick([5000, 7500, 10000, 12500, 15000]),
        note: pick(['Campagne produit phare', 'Relance clients', 'Test nouvelle audience', 'Promo week-end']),
      });
    }

    // Dépenses : loyer + charges (passif), parfois du matériel/stock (actif)
    expenses.push({ id: `e${m}a`, date: iso(new Date(first.getFullYear(), first.getMonth(), Math.min(5, lastDay), 12)), description: 'Loyer local', amount: 50000, type: 'passif' });
    expenses.push({ id: `e${m}b`, date: iso(new Date(first.getFullYear(), first.getMonth(), Math.min(10, lastDay), 12)), description: 'Crédit internet et téléphone', amount: 10000, type: 'passif' });
    if (m % 2 === 0) {
      expenses.push({ id: `e${m}c`, date: iso(new Date(first.getFullYear(), first.getMonth(), Math.min(15, lastDay), 12)), description: pick(['Emballages et sacs', 'Étagère de stockage', 'Ring light pour photos']), amount: pick([15000, 25000, 35000]), type: 'actif' });
    }
  }

  // Numérotation des reçus dans l'ordre chronologique, comme en vrai
  sales.sort((a, b) => a.date.localeCompare(b.date));
  const finalSales = sales.map((s, i) => {
    const year = s.date.slice(0, 4);
    seqByYear[year] = (seqByYear[year] || 0) + 1;
    return {
      ...s,
      id: `s${i}`,
      receiptNumber: `ES-${year}-${String(seqByYear[year]).padStart(4, '0')}`,
      createdAt: `${s.date}T12:00:00.000Z`,
    };
  });

  const investments = [
    { id: 'i1', date: iso(start), description: 'Stock de départ', amount: 350000 },
    { id: 'i2', date: iso(new Date(start.getFullYear(), start.getMonth() + 2, 8)), description: 'Réassort sacs et sneakers', amount: 200000 },
    { id: 'i3', date: iso(new Date(start.getFullYear(), start.getMonth() + 4, 3)), description: 'Shooting photo produits', amount: 60000 },
  ];

  const yearNow = String(now.getFullYear());
  const expiresAt = new Date(now.getTime() + 365 * 86400000).toISOString();

  const account = {
    id: accountId,
    ownerName: 'Compte Démo',
    businessName: 'Boutique Démo',
    phone: '77 000 00 00',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    role: 'owner',
    isDemo: true,
    createdAt: start.toISOString(),
    subscription: { status: 'active', plan: 'elite', billing: 'yearly', amountPaid: 45000, expiresAt },
    receiptSettings: {
      address: 'Rue 10, Médina',
      city: 'Dakar',
      note: 'Merci pour votre achat ! Échange possible sous 7 jours.',
      signatureType: 'draw',
    },
  };

  return {
    account,
    products: PRODUCTS,
    sales: finalSales,
    ads,
    investments,
    expenses,
    receiptSeq: seqByYear[yearNow] || 0,
  };
}
