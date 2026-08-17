# PoGO PvP Hub

Compagnon **PvP & PvE** pour Pokémon GO : méta par ligue, équipes, raids/Dynamax,
Shiny Dex et actualités — bilingue FR/EN, un seul dépôt front + back.

> Projet non officiel, sans lien avec Niantic ni The Pokémon Company.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript |
| Style | Tailwind v4, lucide-react |
| Données | Prisma 7 + PostgreSQL (adaptateur `@prisma/adapter-pg`) |
| Auth | session JWT maison (`jose` + `bcryptjs`), rôles USER / CONTRIBUTOR / ADMIN |
| i18n | dictionnaires FR/EN maison, segment d'URL `/[locale]` |

## Démarrage

```bash
cp .env.example .env          # puis renseigner AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:up                 # Postgres docker sur le port 5433
npx prisma migrate dev
npm run ingest                # ~2 min : pokémon, ligues, méta, shiny, actus, raids
npm run dev                   # http://localhost:3002
```

Le **premier compte créé devient administrateur** automatiquement.

## Sources de données

| Donnée | Source | Licence / note |
|---|---|---|
| Pokémon, attaques, stats de base, IV « rang 1 », règles de coupes | [PvPoke](https://github.com/pvpoke/pvpoke) `gamemaster.json` | MIT |
| Classements méta par ligue et catégorie (+ matchups / counters) | PvPoke `rankings-*.json` | MIT |
| Sprites Pokémon GO (formes exactes + chromatiques) | [PokeMiners](https://github.com/PokeMiners/pogo_assets) | usage communautaire |
| Noms FR/EN des espèces et des attaques | PokeMiners `i18n_*.json` (textes officiels du jeu) | |
| Événements et actualités | [LeekDuck](https://leekduck.com) via [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) | attribution requise |
| Boss de raid en cours | ScrapedDuck `raids.json` | |
| Chromatiques disponibles | [pogoapi.net](https://pogoapi.net) | |
| Statistiques de ladder | [GO Battle Log](https://gobattlelog.com) | ⚠️ pas d'API publique, pages derrière connexion Firebase → adaptateur **désactivé par défaut**, import manuel côté admin |

Les calculs de PC, stats, spreads IV et comptes d'énergie ont été validés colonne par
colonne contre un export PvPoke (440 lignes, 0 écart).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement (port 3002) |
| `npm run build` | build de production |
| `npm run ingest` | ingestion complète |
| `npm run ingest -- meta --leagues great,ultra --limit 200` | ingestion ciblée |
| `npm run db:up` / `db:down` | Postgres de dev (docker) |
| `npm run db:studio` | Prisma Studio |
| `npm run test` | tests unitaires (Vitest) |

## Structure

```
prisma/schema.prisma          modèle de données
src/app/[locale]/             pages (dashboard, list, teams, raids, counters, shinydex, news)
src/components/               UI, sidebar PvP/PvE, tables, cartes
src/lib/pogo/                 maths du jeu : CPM, stats/PC, types, éligibilité, raids
src/server/ingest/            ingestion des sources externes
src/server/queries/           lectures typées pour les pages
src/i18n/                     dictionnaires FR/EN
proxy.ts                      redirection de langue (ex-middleware, Next 16)
```

## État d'avancement

- [x] Socle : Next 16, Prisma 7, Postgres docker, i18n FR/EN, sessions + rôles
- [x] Ingestion : 1 740 Pokémon, 347 attaques, 16 ligues, ~50 000 entrées méta, actus, raids, shiny
- [x] Authentification (inscription → pseudo → connexion)
- [x] Tableau de bord : 3 ligues principales + coupes, restrictions en bulle ⓘ
- [x] Liste méta : ligues, catégories, recherche FR/EN, filtres de types, IV rang 1, attaques + alternatives au survol
- [ ] Équipes (modal de création, cartes, page détail, contres, partage public)
- [ ] Raids & Dynamax (en cours / catalogue, PC de capture, contres calculés)
- [ ] Contres (outil autonome)
- [ ] Shiny Dex (grille par génération, clic = capturé)
- [ ] Actualités (actif / à venir / passé + détail)
- [ ] Espaces contributeur et admin, cron hebdomadaire, déploiement Vercel + Neon
