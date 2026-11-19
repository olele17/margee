# Margee+ (ex-EASY SWAP) — Frontend

SaaS multi-tenant de gestion e-commerce. Chaque e-commerçant qui s'inscrit
obtient son propre espace privé pour gérer :

- **Produits** (coût de revient, prix de vente, catégorie)
- **Ventes** avec **reçu PDF automatique** numéroté (logo, adresse et signature personnalisables)
- **Pubs** dépensées, **dépenses** générales, **investissements** & ROI
- **Dashboard** avec CA, bénéfice et comparaison mensuelle
- **Abonnement** (paiement simulé en démo)
- **Super-admin** opérateur sur `/admin`

Stack : React 18 · Vite 5 · React Router 6 · jsPDF. **Aucun backend, aucune
base de données** : c'est une démo 100 % navigateur.

## Mode démo (localStorage)

Toutes les données (comptes, produits, ventes, pubs…) sont stockées dans le
`localStorage` du navigateur. Conséquences :

- les données restent sur l'appareil et le navigateur utilisés ;
- vider les données du site efface tout ;
- les mots de passe sont stockés en clair et le paiement est simulé
  (activation immédiate) — **ne pas utiliser avec de vrais clients**.

## Démarrer en local

```bash
npm install
npm run dev      # http://localhost:5173
npm run preview  # tester un build
```

## Structure du projet

```
src/
  services/
    api.js              ← COUCHE DE DONNÉES (localStorage) — toutes les lectures/écritures passent ici
  context/AuthContext.jsx  ← session utilisateur
  hooks/useBusinessData.js
  utils/
    calc.js             ← calculs CA / bénéfice / ROI
    insights.js         ← analyses affichées sur le dashboard
    receiptPdf.js       ← génération PDF des reçus
    numberToWords.js    ← montant en lettres sur les reçus
  components/           ← AppLayout, Sidebar, StatCard, ProtectedRoute, SignaturePad
  pages/                ← Landing, Signup, Login, Subscribe, SuperAdmin
  pages/app/            ← Dashboard, Products, Sales, Ads, Expenses, Investments, Settings
  styles/global.css
```

Les composants React ne lisent jamais le `localStorage` directement : ils
passent par les fonctions `async` de `api.js`.

### Routes

| Route | Page |
|---|---|
| `/` | Landing |
| `/inscription`, `/connexion` | Inscription / connexion |
| `/abonnement` | Choix du plan |
| `/app/dashboard`, `/app/produits`, `/app/ventes`, `/app/pubs`, `/app/depenses`, `/app/investissements`, `/app/parametres` | Espace commerçant (protégé) |
| `/admin` | Super-admin opérateur |

## Données de démo

- Clé `easyswap_db_v1` : `{ accounts, products, sales, ads, investments, expenses, receiptSeq }`.
  Chaque liste est rangée par identifiant de compte : un compte ne voit jamais
  les données d'un autre.
- Clé `easyswap_session` : le compte connecté.
- Reçus numérotés automatiquement par compte : `ES-AAAA-NNNN`.
- Abonnement : le bouton de paiement active le compte immédiatement (simulation).

## ⚠️ Note sur l'état du dépôt

Le build présent dans `dist/` (29/09/2026) est **plus récent que ce code
source** : il contient en plus la réinitialisation du mot de passe, un
super-admin étendu (liste des e-commerçants, paiements, plans, support) et le
nom Margee+ dans l'interface. Ces sources n'ont jamais été commitées. Si elles sont
retrouvées (historique OneDrive, autre ordinateur), les recopier ici et faire
un commit.

## Design

Identité Margee+ : thème émeraude (`#155336`, `#227c4f`, `#10b981`),
polices Plus Jakarta Sans, Syne et DM Sans. Variables dans `src/styles/global.css`.
