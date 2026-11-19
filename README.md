# Margee+ (ex-EASY SWAP) — Frontend

SaaS multi-tenant de gestion e-commerce. Chaque e-commerçant qui s'inscrit
obtient son propre espace privé pour gérer :

- **Produits** (prix d'achat / de vente, stock)
- **Ventes** avec **reçu PDF automatique** numéroté (logo, adresse et signature personnalisables)
- **Pubs** dépensées, **dépenses** générales, **investissements** & ROI
- **Dashboard** avec CA, bénéfice et comparaison mensuelle
- **Abonnement** payant (Bictorys — à brancher)
- **Super-admin** opérateur sur `/admin`

Stack : React 18 · Vite 5 · React Router 6 · Supabase (Auth + Postgres) · jsPDF.

## Démarrer en local

1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Créer un projet sur [supabase.com](https://supabase.com), puis dans
   **SQL Editor → New query**, coller et exécuter `supabase/schema.sql`.
3. Remplir `.env.local` à la racine (Dashboard Supabase → Project Settings → API) :
   ```env
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   Ce fichier est ignoré par git — ne jamais y mettre de clé secrète
   (`service_role`, Bictorys…) : tout ce qui commence par `VITE_` est visible
   dans le navigateur.
4. Lancer :
   ```bash
   npm run dev      # http://localhost:5173
   npm run build    # build de production dans dist/
   npm run preview  # tester le build
   ```

## Structure du projet

```
src/
  services/
    supabaseClient.js   ← client Supabase (lit .env.local)
    api.js              ← COUCHE DE DONNÉES — toutes les lectures/écritures passent ici
  context/AuthContext.jsx  ← session utilisateur (Supabase Auth)
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
supabase/schema.sql     ← tables, sécurité (RLS), triggers
```

Les composants React n'appellent jamais Supabase directement : ils passent
par les fonctions `async` de `api.js`. Changer de backend = réécrire `api.js`
uniquement.

### Routes

| Route | Page |
|---|---|
| `/` | Landing |
| `/inscription`, `/connexion` | Inscription / connexion |
| `/abonnement` | Choix du plan |
| `/app/dashboard`, `/app/produits`, `/app/ventes`, `/app/pubs`, `/app/depenses`, `/app/investissements`, `/app/parametres` | Espace commerçant (protégé) |
| `/admin` | Super-admin opérateur |

## Base de données (Supabase)

`supabase/schema.sql` crée :

- `profiles` — 1 ligne par compte (lié à `auth.users`), infos boutique,
  abonnement (`subscription_status` : `pending` | `active` | `expired`) et
  réglages des reçus. Créée automatiquement à l'inscription (trigger
  `on_auth_user_created`).
- `products`, `sales`, `ads`, `investments`, `expenses` — chaque ligne est
  rattachée à un `account_id`.
- `receipt_counters` + fonction `next_receipt_number()` — numérotation des
  reçus par compte et par année.

**Isolation multi-tenant** : Row Level Security activée sur toutes les tables,
chaque commerçant ne voit et ne modifie que ses propres lignes.

## Reste à faire

1. **Paiement Bictorys** (`subscribe()` dans `api.js`, page `Subscribe.jsx`) :
   - Edge Function Supabase (ou endpoint serveur) qui appelle l'API Bictorys
     avec la clé secrète **côté serveur uniquement** et renvoie l'URL de paiement.
   - Webhook de confirmation qui passe le profil en `subscription_status = 'active'`
     avec `subscription_plan` et `subscription_expires_at`.
   - Doc : https://docs.bictorys.com
2. **Super-admin** : le mot de passe opérateur est écrit en dur dans
   `src/pages/SuperAdmin.jsx` — le remplacer par un vrai rôle admin
   (ex. colonne `is_admin` + politique RLS dédiée).
3. **Expiration automatique** des abonnements (cron / `pg_cron`) à
   `subscription_expires_at`.

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
