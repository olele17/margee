# EASY SWAP — Frontend (v2, SaaS multi-tenant)

Chaque e-commerçant qui s'inscrit obtient son propre espace privé pour gérer :
produits, ventes (avec reçu automatique), pubs dépensées, investissements & ROI,
facturation, et un dashboard avec comparaison mensuelle.

## Démarrer en local

```bash
npm install
npm run dev
```

Ouvre `http://localhost:5173`.

## Structure du projet

```
src/
  services/api.js       ← COUCHE DE DONNÉES — à remplacer par le vrai backend
  context/AuthContext.jsx
  hooks/useBusinessData.js
  utils/calc.js          ← calculs CA / bénéfice / ROI
  utils/receiptPdf.js    ← génération PDF des reçus
  components/            ← Sidebar, StatCard, ProtectedRoute, AppLayout
  pages/                 ← Landing, Signup, Login, Subscribe
  pages/app/             ← Dashboard, Products, Sales, Receipts, Ads, Investments, Settings
  pages/SuperAdmin.jsx   ← espace opérateur (toi) — /admin
```

## ⚠️ État actuel : tout tourne en local (localStorage)

`src/services/api.js` simule un backend avec `localStorage`, mais **toutes les
fonctions sont déjà `async`** — elles retournent des Promises comme le ferait
un vrai `fetch()`. C'est fait exprès : pour brancher le vrai backend, il
suffit de remplacer le CORPS de chaque fonction dans `api.js` par un appel
`fetch()` vers ton API. **Aucun composant React n'a besoin de changer.**

## TODO backend (pour la suite avec Claude Code)

1. **Base de données** (Postgres/MongoDB) avec les tables : `accounts`,
   `products`, `sales`, `ads`, `investments` — chaque ligne rattachée à un
   `account_id` (isolation multi-tenant).
2. **Auth** : hasher les mots de passe (bcrypt/argon2), sessions par token
   (JWT ou cookie httpOnly) — remplacer le `localStorage` session actuel.
3. **Paiement Bictorys** (voir `src/pages/Subscribe.jsx`, fonction `pay()`) :
   - Créer un endpoint backend `POST /api/subscribe` qui appelle l'API
     Bictorys (checkout hébergé) avec la clé secrète **côté serveur
     uniquement**.
   - Rediriger l'utilisateur vers l'URL de paiement retournée.
   - Créer un endpoint webhook `POST /api/webhooks/bictorys` qui reçoit la
     confirmation de paiement et met à jour `account.subscription` en base
     (`status: 'active'`, `plan`, `expiresAt`).
   - Documentation Bictorys : https://docs.bictorys.com
4. **Super-admin** (`src/pages/SuperAdmin.jsx`) : remplacer le mot de passe
   en dur par une vraie authentification opérateur séparée.
5. Un job planifié (cron) qui repasse les abonnements expirés en
   `status: 'expired'` automatiquement à la date `expiresAt`.

## Design

Palette et typographie reprises de l'identité EASY SWAP existante :
`--dark #1A1A1A`, `--yellow #F5C518`, `--gold #C9A84C`, polices Syne (titres)
+ DM Sans (texte). Voir `src/styles/global.css`.
