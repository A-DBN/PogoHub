# PoGO PvP Hub — récapitulatif de reprise

> À lire en début de session. Décrit l'état réel du projet, les décisions prises,
> les pièges rencontrés et la suite à faire, dans l'ordre.

- **Dossier** : `C:\Users\adabi\Desktop\devProjects\pogo-pvp-hub`
- **Dev** : `npm run dev` → <http://localhost:3002> (3000/3001 sont pris par Foodie)
- **Base** : Postgres docker sur le port **5433** (`npm run db:up`), conteneur `pogohub-postgres`
- **npm** : utiliser `"/c/Program Files/nodejs/npm"` — le `npm` du PATH est un vieux 7.20.5

## Stack et choix

| Sujet | Choix | Pourquoi |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack), React 19 | un seul dépôt front + back |
| Données | **Prisma 7** + Postgres, adaptateur `@prisma/adapter-pg` | Prisma 7 exige un adaptateur et `prisma.config.ts` (l'URL n'est plus dans le schéma) |
| Auth | maison : `jose` (JWT en cookie httpOnly) + `bcryptjs` | next-auth v5 pas encore fiable avec Next 16 |
| i18n | dictionnaires maison `src/i18n/` + segment `/[locale]` | next-intl écarté pour la même raison |
| Style | Tailwind v4, police Plus Jakarta Sans | tokens dans `src/app/globals.css` |

**Règles de style validées avec l'utilisateur** : pas de bordure 1px (elles crénèlent) —
on sépare par des couches de fond, des dégradés et des ombres ; boutons en pilules
(`src/components/ui/PillLink.tsx`) avec dégradé sur l'état actif ; cartes arrondies 2xl
avec halo coloré ; infobulles rendues **en portail** (`src/components/ui/HoverCard.tsx`)
pour ne jamais passer derrière une ligne de tableau.

## Pièges à connaître (déjà rencontrés)

1. **Après toute migration Prisma** : `npx prisma generate` **et redémarrer `npm run dev`**.
   Le client est chargé une fois au démarrage → sinon `Unknown field ...`.
2. **`proxy.ts` doit être dans `src/`** (pas à la racine) puisque l'app est dans `src/app`.
   C'est l'ex-`middleware.ts`, renommé par Next 16, et il gère la redirection de langue.
3. **Pas de fonction en prop** d'un composant serveur vers un composant client
   (erreur « Functions cannot be passed directly to Client Components ») : passer des
   chaînes et construire les URLs côté client.
4. **Le premier compte créé devient ADMIN** (bootstrap, dans `registerAction`).
   Compte actuel : `adabin@hotmail.fr` / `ZenkiuD`, rôle ADMIN.
5. `npx tsx scripts/dev-session.ts` crée un compte de test et imprime un cookie de session valide
   (il n'y a **pas** d'entrée `dev:session` dans `package.json`, contrairement à ce qui
   était écrit ici). Indispensable pour vérifier une page réservée aux comptes : en
   invité, `/settings` redirige et `/meta-admin` affiche « Accès réservé » — un `curl` nu
   renvoie 200 sans avoir rien rendu du tout.
   (utile pour vérifier une page connectée en navigateur headless).

## Piège du premier import : l'ordre ligues → méta

`ingestLeagues` masque les ligues **sans classement**, et `ingestMeta` ne traite que les
ligues **actives**. Sur une base neuve, aucune ligue n'a encore d'entrée quand `leagues`
tourne : les 18 se retrouvaient éteintes, puis `meta` n'en trouvait aucune et repartait
avec `leagues: 0, entries: 0`. Le classement restait vide **pour toujours**, sans aucun
moyen de s'en sortir depuis l'application.

Invisible en local — la base y a toujours des entrées d'un import précédent, donc le
balayage ne trouve rien à masquer. Découvert au premier déploiement sur Neon, corrigé :

- `ingestLeagues` ne balaie **que si la méta a déjà tourné** (`metaEntry.count()`) ;
- `ingestMeta` **se rattrape** : sans ligue active, il repart de toutes les ligues
  standard et rallume celles qui reçoivent un classement. Uniquement dans ce cas — une
  ligue masquée à la main par un administrateur ne doit pas se rallumer à chaque import.

**Leçon générale** : une étape d'ingestion ne doit pas décider de l'état d'un objet à
partir de données qu'une étape *ultérieure* produira.

## Sources de données

| Donnée | Source | Note |
|---|---|---|
| Pokémon, attaques, stats de base, IV « rang 1 », règles de coupes | PvPoke `gamemaster.json` (MIT) | `defaultIVs.cp500/1500/2500/10000` = spreads rang 1 |
| Classements méta (+ matchups / counters) | PvPoke `rankings-<cp>.json` par coupe et catégorie | 27 coupes |
| Sprites (formes exactes + chromatiques) | PokeMiners `pogo_assets` | résolution dans `src/server/ingest/icon-resolver.ts` |
| Noms FR/EN espèces et attaques | PokeMiners `i18n_french/english.json` | tableaux clé/valeur alternées |
| **Stats JcE des attaques** | PokeMiners `game_masters/latest.json` (18 Mo) | `npm run ingest -- pvemoves` → colonnes `Move.pve*`. PvPoke ne publie **que** le modèle JcJ par tours |
| Événements et actus | LeekDuck via ScrapedDuck | `events.json`, `raids.json` |
| Chromatiques disponibles | pogoapi.net | complété manuellement par les admins |
| **Stats PvE / raids (référence)** | <https://db.pokemongohub.net/fr/pokemon/384> | **à exploiter** pour recouper PC par niveau, contres et nombre de joueurs |
| Ladder | gobattlelog.com | ⚠️ pas d'API, `/meta` derrière login Firebase → adaptateur désactivé, import manuel prévu |

Les formules (PC, stats, stat product, comptes d'énergie) ont été validées **colonne par
colonne contre un export PvPoke de 440 lignes : 0 écart**. Elles vivent dans
`src/lib/pogo/` (`cpm.ts`, `stats.ts`, `types.ts`, `eligibility.ts`, `raid.ts`).

Les PC de capture ont été recoupés contre les fourchettes LeekDuck : **17/17 boss
identiques** (voir `src/lib/pogo/raid.test.ts`). Deux règles en sont sorties :
le plancher d'IV est **6** en raid obscur (10 ailleurs), et un raid **Méga/Primo
donne l'espèce de base** à la capture, donc ses PC.

## Fait

- Ingestion complète (`npm run ingest`) : 1 740 Pokémon, 347 attaques, 11 690 entrées de
  movepool, 16 ligues actives, ~50 000 entrées méta, actus, boss de raid, chromatiques.
- Auth : inscription → choix du pseudo → connexion, rôles **USER / CONTRIBUTOR / ADMIN**.
- Barre latérale scindée **PvP** (Tableau de bord, Liste méta, Équipes) / **PvE**
  (Raids & Dynamax, Contres, Shiny Dex) + Actualités.
- **Tableau de bord** : 3 ligues principales (Master = « Pas de limite de PC ») + coupes,
  restrictions en bulle ⓘ **traduites** (types et tags inclus), top 5 méta avec en-têtes.
- **Liste méta** : sélecteur 3 ligues + menu « Coupes 13 », onglets de catégories,
  recherche FR/EN, filtres de types, IV rang 1, attaques avec alternatives au survol
  (cliquables), lignée d'évolution au survol du sprite.
- **Shiny Dex** : grille par génération, filtre par génération, compteur de captures et de
  **doublons** (`CollectionEntry.shinyCount`, prévu pour un futur système d'échange),
  contrôle `− N +` visible, modale de connexion si non connecté, chromatiques non sortis
  verrouillés (cadenas) sauf pour un **admin** qui peut les débloquer **avec confirmation**
  (Maj + clic pour reverrouiller). Le déblocage est **global** et l'ingestion ne le
  rétrograde jamais (`ingestShiny` ne fait que promouvoir).
- **Raids & Dynamax** : onglets En cours / Tous, recherche, filtre par palier, cartes avec
  PC de capture, PC boostés, météo, ✨ chromatique, faiblesses, badge **OBSCUR** violet,
  forme affichée, météos traduites. Les cartes ouvrent la fiche du boss.
- **Ingestion des raids** : `resolvePokemon` gère préfixes régionaux, Méga/Méga X-Y, Primo,
  formes entre parenthèses et cumuls (`src/server/ingest/species-name.ts`, testé).
  **17/17 boss du jour rattachés.** Le rapport distingue `unmatched` / `approximate` /
  `pending` (« Max Battle Day » : LeekDuck n'annonce pas encore l'espèce, ni dans le titre
  ni dans `extraData.spawns` — ce n'est pas une erreur d'ingestion).
- **Statistiques JcE** : `Move.pve{Power,Energy,DurationMs,WindowMs}` remplies depuis le
  GAME_MASTER PokeMiners (`npm run ingest -- pvemoves`), **342/347 attaques** ; les 5
  restantes (DIVE, GLAIVE_RUSH, PLASMA_FISTS, SPRINGTIDE_STORM, SNIPE_SHOT) n'existent
  pas côté JcE.
- **Équipes** : `/teams` (mes équipes), `/teams/[id]` (fiche : membres avec stats et
  attaques, couverture de types offensive/défensive, types non couverts, lien de partage).
  Création/édition en modale, duplication, suppression, public/privé.
- **Simulation** : `/simulation` — ligue, deux compos de 3 (chargeables depuis vos équipes
  enregistrées), attaques au choix, IV/niveau du rang 1 de la ligue. Sortie : taux de
  victoire global, détail par couple de leads, par stratégie, et les 9 duels 1v1.
- **Administration** `/admin` (ADMIN) : compteurs de base, **lancement des huit étapes
  d'ingestion** avec dernier succès par étape et historique des 30 derniers imports
  (`IngestRun`), gestion des rôles. Un admin ne peut pas se retirer son propre rôle —
  le bootstrap ne joue qu'à la création du tout premier compte, on se retrouverait sans
  personne pour le rendre.
- **Édition méta** : l'édition se fait **sur la liste elle-même** (`/list`), pas dans un
  formulaire à part. Un contributeur bascule en mode édition et peut, sur place :
  modifier rang et score, **retirer** une ligne, la **déplacer** (↑/↓) et **ajouter** une
  espèce. Rien n'est écrit : tout s'accumule en mémoire, la barre du haut compte les
  changements et « Valider les modifications » envoie **le lot entier** en relecture.
  `/meta-admin` (CONTRIBUTOR+) n'affiche plus que le **récapitulatif** des lots en
  attente — chaque ligne avec son avant → après — et les boutons de vote, plus la
  traduction des actualités.

  Modèle : `MetaProposal` (le lot) + `MetaProposalChange` (une ligne, avec `kind`
  UPDATE/ADD/REMOVE et les colonnes `before*`) + `MetaProposalVote`. **Le
  réordonnancement n'a pas de nature propre** : la liste est triée par rang, déplacer une
  ligne revient à échanger son rang avec sa voisine, donc deux UPDATE.

  Éditable en mode contributeur : **rang, score, attaques** (choisies parmi les
  alternatives PvPoke de la ligne) et le **spread rang 1** (niveau + IV, le PC se
  recalcule). Le spread corrigé est stocké dans `MetaEntry.ivs` et prime sur le calcul
  PvPoke — vide, la liste retombe sur `Pokemon.defaultIvs`, ce qui reste le cas courant.

  À la validation, tout est appliqué **et** un `MetaSnapshot` est créé — la nouvelle
  version — dans une seule transaction : deux votes simultanés ne peuvent pas produire
  deux versions. Les entrées touchées passent en `isOverride` + `source: MANUAL`, donc
  l'ingestion PvPoke ne les écrase plus. L'auteur ne peut pas voter son propre lot.

- **Cron** `/api/cron/refresh` : `Authorization: Bearer $CRON_SECRET` obligatoire (401
  sinon), `?kinds=news,raids` pour restreindre, sinon `news, raids, shiny, meta` — le
  catalogue Pokémon ne bouge qu'à une mise à jour du jeu et se relance depuis `/admin`.
  Planifié le lundi 5 h dans `vercel.json`.
- **Actualités** : `/news` — fil LeekDuck découpé en En cours / À venir / Passés, filtres
  par type (traduits), repère temporel relatif, visuels et lien vers la page d'origine.
  Un événement sans date compte comme « en cours » : ce sont les annonces de fond.
  `NewsItem.titleFr` reste vide tant qu'un contributeur ne l'a pas saisi — LeekDuck ne
  publie qu'en anglais, on retombe donc sur `titleEn`.
- **Joueurs** : `/players` (annuaire + recherche par pseudo, `?q=`) et
  `/players/[username]` (avatar ou initiales, date d'inscription, équipes publiques,
  Shiny Dex **si** `User.shinyPublic`). L'ancienne route `/teams/u/[username]` a été
  supprimée au profit du profil.
- **Fiche de boss** `/[locale]/raids/[speciesId]` : bandeau d'information ajusté au contenu
  (palier, PV, durée, joueurs conseillés — l'explication du calcul est en `title`),
  **apparences** (chaque forme du même n° de Pokédex, normale + chromatique ; un sprite
  chromatique absent des assets = pas encore sorti), tableau de PC unique
  (capture / capture météo / amplifié 50, colonnes 0 % — 67 % — 100 %), 12 meilleurs
  contres avec attaques et DPS, table des types, movepool du boss.

⚠️ **Listes déroulantes** : ne pas utiliser `<select>`. Le système rend ses options
lui-même (fond blanc, surlignage bleu, hors charte) et rien n'est stylable — utiliser
`src/components/ui/Dropdown.tsx`. Le libellé du champ n'y est **pas** une option : un
placeholder n'est pas un choix.

⚠️ **Couleurs du thème** : les tokens sont déclarés dans `@theme`, donc Tailwind v4 génère
`text-muted`, `bg-pve/15`, `border-line`. La syntaxe de valeur arbitraire
`text-[--color-muted]` produit `color: --color-muted`, **déclaration invalide silencieusement
ignorée** — 174 occurrences dans 17 fichiers rendaient toutes les couleurs d'accent inertes.
Ne pas réintroduire.

⚠️ **Sprites de formes** : `resolveIcon` termine par un repli sur la première forme
**par ordre alphabétique**, qui donne un sprite plausible mais faux (Zygarde 10 % et
50 % héritaient de la forme Parfaite). Ce repli est compté dans `iconsFallback` du
rapport d'ingestion : **le surveiller après chaque ingestion `pokemon`**. Requête de
contrôle — deux formes d'un même dex ne doivent pas partager un fichier :

```sql
select dex, "iconFile", string_agg(distinct coalesce(form,'—'), ' | ')
from "Pokemon" where not "isShadow" and "iconFile" <> ''
group by dex, "iconFile" having count(distinct coalesce(form,'—')) > 1;
```

Restent volontairement : Froussardine (Solo *est* la forme de base), Salarsen (Aigu),
Necrozma Ultra et les Pikachu costumés Libre / Écharpe Shaymin — aucun asset PokeMiners
n'existe pour ceux-là, et ce sont des variantes purement cosmétiques.

⚠️ `PokemonIcon` : `shinyIconFile` est **déjà** le nom du fichier chromatique. Le passer
avec `shiny` en plus produit `pm445.s.s.icon.png` et une image cassée — `spriteUrl` ne
dérive le nom que depuis `iconFile`.

**Nombre de joueurs** : trois paliers, pas une fourchette (`THROUGHPUT` dans
`src/lib/pogo/raid.ts`). Le facteur exprime la part du DPS du meilleur contre qu'un
joueur délivre vraiment — uptime *et* qualité du roster confondus. Calé sur du retour
de terrain : Groudon 5★ → **3 minimum / 6 conseillé / 8+ tranquille**, et Rayquaza 5★
garde son minimum de 2 (valeur pokemongohub). Le minimum seul induit en erreur : il
suppose que les six joueurs alignent les meilleurs contres et jouent proprement.

## Le moteur de contres, et ce qu'il vaut

`bestCounters()` (`src/lib/pogo/raid.ts`) classe les ~1 600 attaquants sortis :
cycle « n rapides + une chargée » aux **durées d'animation réelles**, dégâts GO
(`⌊0,5 × puissance × Atk/Def × STAB × efficacité⌋ + 1`), bonus obscur ×1,2 / ×0,833,
tri sur la métrique GamePress **DPS³ × TDO**.

Recoupé contre <https://db.pokemongohub.net/fr/pokemon/383/counters> : **même
distribution d'attaquants**, DPS à quelques pourcents (Primo-Kyogre 27,9 vs 27,94).

L'écart restant vient d'une différence de nature entre les deux DPS. Le nôtre est
**analytique** : le DPS d'un cycle d'attaques, point. Le leur sort d'une **simulation
de combat** qui compte les KO et les retours au lobby (leur tableau affiche d'ailleurs
« Faints » et « TTW »). Un Pokémon fragile y perd donc du DPS, pas seulement du TDO.

C'est visible sur les **obscurs** : Kyogre Obscur tombe 2ᵉ chez nous et 8ᵉ chez eux.
Le bonus d'attaque ×1,2 le hisse haut dans un modèle analytique, alors que son malus
de défense ×0,833 le fait tomber KO 30 fois dans leur simulation (contre 18 pour
Primo-Kyogre), ce qui écrase son DPS effectif. **Le haut du classement concorde ; le
ventre du tableau sur-classe les attaquants fragiles.** Modéliser le temps de retour
au lobby corrigerait le tir — attention, une correction naïve fait remonter les tanks
à faible DPS (Zacian passait 1ᵉʳ sur Rayquaza), il faut la garder sur le DPS et non
sur la note finale.

⚠️ Puissance Cachée est **exclue** du vivier JcE (`EXCLUDED_FROM_PVE` dans
`src/server/queries/counters.ts`) : PvPoke en liste les 18 types alors que le type est
tiré au sort en jeu — les garder offrait une couverture parfaite à chaque apprenant et
faisait remonter des attaquants que personne ne joue (Regigigas, entre autres).

## Le moteur JcJ (`src/lib/pogo/battle.ts`)

Sans rapport avec le moteur JcE de `raid.ts` : tours de 0,5 s, colonnes JcJ de `Move`
(`power`, `energy`, `energyGain`, `turns`, `buffs`), multiplicateur de dégâts **1,3**,
boucliers, paliers de buff et priorité au plus fort en Attaque.

Deux niveaux : `simulateBattle` (1v1) et `simulateTeamBattle` (3v3 avec 2 boucliers
partagés, chronomètre de changement de 60 s, remplacement au K.O. et changements
volontaires). `sweepScenarios` balaie **144 combats** : 3 leads × 3 leads × 4 stratégies
de chaque camp (bouclier tôt/gardé × sans changement/changement réactif).

**Le test qui compte est le miroir** : une équipe contre elle-même doit donner
exactement 50 %. Trois asymétries l'ont fait échouer et sont corrigées — égalité de
priorité de chargée, ordre des décisions de changement, ordre des remplacements après
K.O. Chacune donnait un avantage silencieux à l'équipe A, donc gonflait *tous* les taux
affichés. `battle.test.ts` verrouille les trois.

⚠️ **Les règles de ligue s'appliquent à la simulation.** Un emplacement porte son
niveau et ses IV réels quand il vient d'une équipe enregistrée (`level`, `ivAtk/Def/Hp`),
et seulement à défaut le rang 1 de la ligue. `previewSlots` renvoie donc un PC vrai,
confronté au plafond et aux filtres via `checkEligibility` : une équipe niveau 50 chargée
en Super Ligue est refusée (motif `cp`), la même passe en Master. Le bouton est grisé côté
client **et** `runSimulation` renvoie `INELIGIBLE` — une action serveur reste appelable
directement, l'interface ne peut pas être la seule barrière.

⚠️ **Le niveau dépend de la ligue, et il faut l'afficher.** `rank1(base, cpLimit)`
ramène chaque Pokémon sous le plafond de PC : en Super Ligue, Zacian Épée Suprême tombe
à **niveau 11, 1498 PC, 91 PV** et perd contre un Herbizarre (132 PV). Le calcul est
juste, le résultat paraît absurde tant que le niveau retenu n'est pas visible — d'où
`previewSlots`, qui affiche niveau, PC et éligibilité sur chaque emplacement avant même
de lancer la simulation. Ne pas retirer cet affichage.

**Fidélité mesurée** contre les matchups PvPoke déjà en base (`MetaEntry.matchups`,
60 premiers de la Super Ligue, 290 duels) :

| Scénario | Accord |
|---|---|
| 0 bouclier | 63,1 % |
| 1 bouclier | **73,4 %** |
| 2 boucliers | 73,1 % |
| au moins un scénario | 85,5 % |

Le 1 bouclier étant le plus proche, c'est bien le scénario que PvPoke publie. Les ~25 %
d'écart viennent de l'IA : le moteur appâte le bouclier mais **n'anticipe pas** celui de
l'adversaire, ne feinte pas et ne choisit pas ses changements comme un joueur. À présenter
comme une tendance — c'est ce que dit `dict.simulation.limits` à l'écran. Pour améliorer,
c'est l'IA qu'il faut travailler, pas les formules : elles sont vérifiées par tests.

## Sprites : ne plus dépendre de GitHub à l'exécution

`raw.githubusercontent.com` **n'est pas un CDN**. Il répond **HTTP 429** dès qu'une page
demande beaucoup d'images — le Shiny Dex en affiche un millier — et les icônes
disparaissent sans message ni erreur console parlante. Les miroirs habituels ne
dépannent pas : jsDelivr et statically refusent `PokeMiners/pogo_assets`, trop volumineux
(statically se contente de rediriger vers GitHub, donc 429 aussi).

Deux couches en place :

1. `npm run ingest -- sprites` rapatrie dans `public/sprites/` les seuls fichiers
   référencés en base (`iconFile` + `shinyIconFile`), avec temporisation exponentielle
   sur les 429 et reprise là où il s'était arrêté. **À lancer une fois**, puis après
   chaque ingestion `pokemon` qui ajoute des espèces.
2. `/api/sprite/[file]` sert le fichier local s'il existe, sinon va le chercher en amont
   et met en cache un an. Le navigateur ne parle jamais à GitHub.

Diagnostic quand les icônes disparaissent :

```bash
curl -s -o /dev/null -w "%{http_code}
"   "https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon%20-%20256x256/Addressable%20Assets/pm227.icon.png"
```

`429` = l'adresse IP est bridée, il faut attendre puis relancer l'ingestion des sprites.

⚠️ **Le score n'est pas modifiable** : c'est une valeur calculée par PvPoke. Rang,
attaques et spread IV le sont ; le score se lit seulement.

⚠️ Insérer une ligne à un rang **décale les suivantes** (`addAt` dans
`MetaListEditor`). Sans ce décalage deux lignes porteraient le même rang et la liste ne
bougerait pas à l'écran. Les décalages partent dans le lot comme des modifications
ordinaires, donc les relecteurs les voient.

⚠️ Une liste de suggestions dans une `Card` doit passer par un **portail** : `Card` est
en `overflow-hidden`, une liste absolue s'y trouve rognée et disparaît sous le tableau.

⚠️ **Une ligne ajoutée au classement se construit côté serveur**
(`searchMetaCandidates`). Fabriquer un `MetaRow` partiel côté client fait planter le
tableau — il attend `types`, `charged`, `evolution`, `ivs`… et lève
« Cannot read properties of undefined (reading 'map') ». L'action ne propose que les
Pokémon **absents** du classement et calcule leurs stats au rang 1 de la ligue.

⚠️ **Jamais de `<select>` natif** (rappel, l'erreur a été refaite) : le système rend sa
liste lui-même — gris sur blanc, hors charte — et rien n'est stylable. Utiliser
`src/components/ui/Dropdown.tsx`.

⚠️ `HoverCard` ferme avec un délai de 220 ms (`CLOSE_DELAY_MS`), annulé quand la souris
entre dans la bulle. Sans ce délai, l'espace de 8 px entre le déclencheur et la bulle
suffit à la faire disparaître avant qu'on l'atteigne : son contenu devient incliquable.

⚠️ Un module `'use server'` ne peut exporter **que des fonctions asynchrones**. Y laisser
une constante fait perdre *tous* les exports du fichier, et Next signale seulement
« The module has no exports at all » sans dire pourquoi. Les seuils de validation vivent
donc dans `src/lib/pogo/proposals.ts`, pas dans l'action.

⚠️ **Le 429 ne touche pas que les sprites** : PvPoke, ScrapedDuck et les textes PokeMiners
sortent tous de `raw.githubusercontent.com`. Quand il bride, **toute** l'ingestion tombe —
`/api/cron/refresh?kinds=news` renvoie alors `HTTP 429` dans son message d'erreur. Ce
n'est pas un bug du cron ni de l'admin, c'est l'amont.
`public/sprites/` est hors dépôt (`.gitignore`) : en déploiement, lancer l'étape au build.

⚠️ `PokemonIcon` porte une `key` sur sa source. Sans elle React réutilise le même `<img>`
et échange seulement `src` : combiné au chargement paresseux, l'ancien sprite restait
affiché en changeant d'équipe dans la simulation.

## Seuil de validation des propositions

Ni fixe ni purement proportionnel (`src/lib/pogo/proposals.ts`) : **un quart des
relecteurs, au minimum 2, au maximum 5**. Les deux bornes ont une raison —

- un seuil en pourcentage tombe à **une seule voix** quand la communauté est minuscule,
  ce qui laisse une personne réécrire la méta seule, exactement ce que la relecture
  doit empêcher ;
- un seuil purement proportionnel devient **inatteignable** quand elle grandit : un quart
  de deux cents contributeurs, aucune correction ne passe jamais.

L'auteur est exclu du décompte des relecteurs, puisqu'il ne peut pas voter. Quatre tests
verrouillent la fonction, dont le fait qu'elle ne décroît jamais quand la communauté
grandit.

## Édition de la liste : l'ordre est un tableau, le rang une sortie

`MetaListEditor` tient un `order: string[]` — la suite des `speciesId`. Le rang n'est
**jamais** stocké ligne par ligne : il est dérivé de la position par `orderPositions()`
(`src/lib/pogo/proposals.ts`, avec `moveInOrder` et `insertAtPosition` ; dix tests).

Deux bugs ont conduit là, tous deux nés du rang stocké —

1. le décalage geste par geste sautait les lignes retirées, donc **retirer le 2 puis
   insérer au 2 faisait disparaître le 3** ;
2. la cellule affichait la valeur saisie (`edits[].rank`) alors que sa voisine affichait
   sa position calculée : après un déplacement, **deux lignes portaient le même numéro**.

Un rang dérivé ne peut plus contredire l'ordre affiché. Corollaires : saisir un rang
revient à demander une position (`insertAtPosition`) ; une ligne retirée reste dans
l'ordre, affichée barrée avec son ancien numéro, sans consommer de position ; toute ligne
qu'un déplacement décale part avec sa position finale, sinon deux lignes viseraient le
même rang. À l'application, `voteProposal` renumérote la catégorie en 1..N, et un `ADD`
libère sa place (`increment: 1`) avant d'insérer.

## Piège : Turbopack peut servir un ancien chunk client

Symptôme observé : le serveur renvoyait la **nouvelle** forme de données pendant que le
navigateur exécutait l'**ancien** rendu — d'où des `[object Object]` là où une liste
d'attaques venait d'être enrichie. Le fichier source était juste, le typecheck vert, et
un redémarrage simple du serveur n'y changeait rien.

Diagnostic : chercher l'ancien code dans les chunks compilés.

```bash
grep -rl "<extrait de l'ancien rendu>" .next/static .next/dev/server
```

S'il ressort, `.next` est à supprimer avant de relancer — un redémarrage seul ne purge
pas le cache Turbopack. **Ne pas conclure qu'un correctif est faux sans avoir fait cette
vérification** : trois signalements de suite ont porté sur du code déjà corrigé.

## Le récapitulatif doit montrer ce qui est validé

Les lots stockent des **identifiants** d'attaques et des spreads bruts. Le récapitulatif
les résout : noms localisés (ils s'affichaient en anglais) et stats effectives — PC,
niveau, IV. Sans spread explicite, on affiche celui que le classement calculera
(`rank1`), pas une case vide : un ajout n'affichait jusqu'ici qu'un nom. Une ligne
ajoutée sans choix d'attaques part avec le jeu proposé par défaut, faute de quoi elle
entrait au classement sans aucune attaque.

## Un lot ne porte qu'une ligne par Pokémon

`MetaProposalChange` est unique sur `(proposalId, pokemonId)`. Choisir les attaques d'une
ligne **ajoutée** écrivait dans `edits`, donc l'espèce partait en `UPDATE` *et* en `ADD` :
la contrainte remontait en **500 que le client n'affichait pas**, laissant un bouton
« Valider » sans effet apparent. Trois verrous désormais —

- `MetaEditBar` exclut les espèces ajoutées de la liste des `UPDATE` ;
- `submitChangeset` replie les doublons par `pokemonId` (retrait et ajout priment sur
  modification) ;
- l'action est enveloppée dans un `try/catch` qui renvoie `detail`, affiché tel quel.

**Règle générale** : une action serveur de ce flux ne doit jamais laisser filer une
exception. Le contributeur n'a aucun moyen de deviner ce qui coince.

## La note PvPoke : mesurée, pas reproductible

`MetaEntry.score` est **nullable**, et une ligne ajoutée par un contributeur en est
dépourvue — la cellule affiche « — ». Ce n'est pas une paresse, c'est une mesure :

Le tableau `MetaEntry.scores` publié par PvPoke contient six valeurs, dont les cinq
premières sont exactement les scores par catégorie (vérifié sur Coudlangue :
`[86,8 · 86,4 · 91 · 94,5 · 81 · 88,4]` = leads, closers, switches, chargers, attackers,
+ une sixième). La note globale, **93,7**, n'est aucune des six ni leur moyenne (87,9).

Une régression sur 300 entrées la retrouve presque — poids
`0,088 / 0,188 / −0,004 / 0,467 / 0,153 / 0,119`, somme 1,01, dominée par *chargers*,
*switches* ne pesant rien — mais l'écart médian de 0,83 cache un **maximum de 9,3**, et
le log-espace ne fait pas mieux. Les plus gros ratés sont des doublons d'espèce
(movesets alternatifs). Ce n'est donc pas une formule fermée : la note sort d'une
simulation de toute la ligue contre elle-même.

Reproduire cette simulation avec notre propre moteur a été **essayé et mesuré** — ne pas
recommencer sans nouvel argument :

| vivier | corrélation avec la note PvPoke | décalage de rang médian |
|---|---|---|
| top 80 | −0,05 (nulle) | 23 / 80 |
| 400 entrées | 0,46 en taux de victoire | 102 / 400 |

La vitesse n'est pas le frein (239 400 duels en 3,3 s) et nos notes ne sont pas plates
(25 % à 72 % de victoires) : le moteur mesure bien quelque chose, mais pas *ça*. Le top 80
de PvPoke tient dans une bande de 88 à 94 — la finesse qu'il faudrait est justement celle
qui manque.

Conséquence pour le tri : dans `MetaTable`, une ligne sans note **reste en bas dans les
deux sens**, comparer par `NaN` rendant l'ordre imprévisible.

## Récupération de compte : trois Pokémon, pas d'e-mail

Il n'y a **aucun envoi d'e-mail** — Vercel n'en fournit pas, et on ne voulait pas de
dépendance externe. À l'inscription, trois Pokémon sont choisis ; `/[locale]/forgot`
les redemande avec l'adresse pour reposer un mot de passe.

Ce que ce choix impose, et qu'il ne faut pas relâcher —

- les trois choix sont **hachés** (`bcrypt`), jamais stockés en clair : c'est un secret
  qui ouvre le compte, au même titre qu'un mot de passe ;
- le secret est **l'ensemble, pas la suite** : `recoveryKey()` trie avant de hacher, donc
  l'ordre n'a pas à être mémorisé. Les deux côtés partagent la même fonction — s'ils
  normalisaient différemment, aucune récupération ne fonctionnerait ;
- **cinq tentatives** puis verrouillage une heure (`src/lib/pogo/recovery.ts`). C'est la
  seule vraie protection : le site publiant équipes et Shiny Dex, les favoris d'un joueur
  sont souvent devinables depuis son propre profil ;
- toutes les issues d'échec renvoient **le même message**. Distinguer « adresse inconnue »
  ferait du formulaire un annuaire des comptes inscrits ;
- l'inscription **refuse** un compte sans les trois choix : il serait irrécupérable ;
- le profil ne **réaffiche jamais** les choix existants — ils sont hachés. On les remplace,
  après confirmation par le mot de passe courant.

⚠️ Les comptes créés **avant** cette fonctionnalité n'ont pas de Pokémon de secours et ne
peuvent donc pas être récupérés. C'est le cas de `adabin@hotmail.fr` : à définir dans
« Mon profil ».

## Échanges de chromatiques

Le jeu fait l'échange ; le site sert à s'accorder puis à enregistrer qu'il a eu lieu.
D'où un déroulé en quatre temps (`src/lib/pogo/trade.ts`, 18 tests) —

`REQUESTED` le demandeur choisit chez l'autre → `PROPOSED` le sollicité choisit en retour
→ `ACCEPTED` le demandeur valide, on échange en jeu → `COMPLETED` **les deux** confirment.

Ce qui ne doit pas bouger —

- `allowedActions()` est la **seule** source de vérité : l'écran et l'action serveur
  l'appellent tous les deux, l'interface ne peut donc pas proposer ce que le serveur
  refusera ;
- le badge d'un échange affiche **à qui de jouer** (`waitingOn()`), pas le statut brut :
  un même statut ne dit pas la même chose aux deux joueurs, et « À vous de choisir »
  s'affichait des deux côtés d'un `REQUESTED` ;
- il faut **deux** confirmations pour clore. Le `updateMany` porte le statut d'origine
  dans son `where` : deux clics simultanés ne peuvent pas créditer les compteurs deux fois ;
- les compteurs bougent des deux côtés (−1 donné, +1 reçu) et ne descendent jamais sous
  zéro ; un chromatique reçu entre au Dex s'il n'y était pas ;
- le **code ami du partenaire n'est joint qu'une fois l'échange accordé** : avant, une
  simple demande suffirait à l'extraire d'un profil qui le garde privé ;
- les deux joueurs doivent avoir un code ami — sans lui ils ne peuvent pas se trouver en jeu.

**`CollectionEntry.forTrade` a trois états** : `true` toujours proposé, `false` jamais,
**`null` = la règle du compte décide** (`autoTradeFrom`, à partir de N exemplaires, N ≥ 2).
Sans ce troisième état, retirer à la main un chromatique listé automatiquement n'aurait
aucun effet. La liste n'est donc **pas stockée** : `isOfferedForTrade()` la recalcule à la
lecture, et elle suit les compteurs sans rien réécrire. Le serveur refait ce calcul, il ne
se fie pas à ce que l'écran affichait.

⚠️ Le parcours complet à deux joueurs (demander → choisir → accepter → confirmer →
compteurs) **n'a pas été exercé de bout en bout** : il faut deux sessions authentifiées
simultanées. La machine à états et le calcul des compteurs sont testés unitairement ; les
actions et l'affichage le sont par lecture et typecheck.

## Poids des pages — à surveiller

Le site paraissait lourd non pas à cause du temps serveur (100-400 ms) mais du
**volume envoyé et du DOM rendu**. Mesure de contrôle :

```bash
curl -s -o /dev/null -w "%{size_download}\n" "http://localhost:3002/fr/list?league=great"
```

| Page | Avant | Après | DOM rendu |
|---|---|---|---|
| Liste méta | 2 524 Ko | 946 Ko | 176 Ko |
| Shiny Dex | 1 086 Ko | 615 Ko | 701 → 228 Ko |
| Équipes (connecté) | 1 282 Ko | 47 Ko | 19 Ko |
| Simulation | 348 Ko | 48 Ko | 19 Ko |
| Contres | 313 Ko | 125 Ko | 44 Ko |

Quatre causes, quatre correctifs à ne pas défaire :

1. **Dictionnaires plutôt que duplication** (`getMetaList`). Les lignes portent des
   identifiants (`MoveRef`, `speciesId`) ; noms et types voyagent une seule fois dans
   `moves` / `species`. Répétés par ligne, ils pesaient 7 200 occurrences de `nameEn`.
2. **Rendu incrémental** (`MetaTable`, `PAGE_SIZE = 60`). 500 lignes d'un coup faisaient
   1,3 Mo de DOM. Le filtre et le tri portent toujours sur les 500.
3. **Chargement à la demande** (`getSpeciesMoves`). Le movepool des 1 000 espèces n'est
   plus embarqué dans la page Équipes ; l'éditeur le récupère à la sélection.
4. **Recherche serveur au lieu du catalogue** (`searchTeamPokemon`, `searchDefenders`).
   Embarquer les 1 000 espèces coûtait 300 Ko sur Équipes, Simulation et Contres, à
   chaque chargement, pour un menu qu'on n'ouvre pas toujours. Les sélecteurs
   interrogent le serveur (débattu à 200 ms) et ne gardent qu'un registre local des
   espèces déjà vues. **C'était la cause du lag ressenti sur Équipes.**

Le Shiny Dex garde ses ~1 000 tuiles (c'est le principe d'un Dex) mais chaque génération
passe par `LazySection` : elle n'est **montée** qu'à l'approche de l'écran, en réservant
sa hauteur. `content-visibility: auto` s'y ajoute pour ce qui est monté mais hors vue.
⚠️ Les deux premières sections sont `eager` — sans cela le premier écran reste vide
jusqu'à l'hydratation, ce qui échange un problème contre un autre.

**Le réflexe** : avant d'ajouter une liste longue à une page, se demander si elle doit
être rendue entièrement, et si ses libellés se répètent ligne par ligne.

## À faire, dans cet ordre

### 1. Rapatrier les sprites — **fait le 17/08/2026**
`npm run ingest -- sprites` a fini : **2 317 fichiers, 0 échec, 104 s**. Le bridage
GitHub (429) s'était levé. `public/sprites/` est rempli et `/api/sprite/<fichier>` sert
en local (~20 ms). À relancer après toute ingestion `pokemon` qui ajoute des espèces.

### 2. Page Mon profil — **livré**
`/[locale]/settings`, réservée aux comptes. Elle remplit enfin `avatarUrl`, `bio` et
`shinyPublic`, qui existaient en base et que la fiche publique lisait déjà **sans que rien
ne permette de les écrire**. S'y ajoutent équipe (Bravoure/Sagesse/Intuition), niveau de
dresseur, code ami et changement de mot de passe.

Trois points à ne pas défaire —

- le **code ami est privé par défaut** et n'est pas envoyé au client tant qu'il ne l'est
  pas : le masquer à l'affichage laisserait la valeur dans la charge de la page ;
- le changement de mot de passe **redemande l'actuel**, sinon une session volée suffit à
  verrouiller le compte de son propriétaire ;
- l'URL d'avatar est bornée à `http(s)` — elle finit dans un `src` de page publique.

Le réglage de langue **écrit le cookie** lu par `src/proxy.ts` : l'enregistrer en base
seulement n'aurait rien changé à l'affichage. Même logique pour la visibilité par défaut
des équipes, appliquée à l'initialisation de `TeamEditor` et non côté serveur — sinon un
« privé » explicite serait écrasé.

Code ami et niveau vivent dans `src/lib/pogo/trainer.ts` (dix tests) : la saisie accepte
les séparateurs du jeu, le stockage reste nu, la mise en forme appartient à l'affichage.

### 3. Page Équipes — **livrée**
Livré : modale de création/édition, cartes, page détail (stats, attaques, couverture de
types), suppression, duplication, public/privé, lien de partage (`shareSlug`, il ouvre
même une équipe privée — c'est voulu).
**Éligibilité par ligue : faite.** L'emplacement passe en rouge et affiche « Non éligible
dans cette ligue », avec la limite de PC quand c'est elle qui coince. Le calcul est
**côté client** (`checkEligibility`) : le PC bouge à chaque frappe, un aller-retour
serveur ferait clignoter l'avertissement avec un tour de retard. `dex`, `tags` et les
filtres de ligue voyagent donc avec la page. C'est **signalé, jamais bloqué** — changer
de ligue en cours de composition ne doit pas effacer le travail en cours.

**Lignée et duels : faits** (`src/server/queries/team-insights.ts`). Chaque membre montre
sa lignée d'évolution — les maillons qu'il n'est pas sont grisés, et une lignée d'un seul
maillon reste masquée : elle n'apprendrait rien. Puis ses cinq meilleurs et cinq pires
duels, tirés de `MetaEntry.matchups` / `counters`.

Deux points de méthode —

- ces duels sont **propres à une ligue** : sans ligue sur l'équipe ils restent vides,
  plutôt que d'afficher ceux d'une autre coupe ;
- la note PvPoke est montrée **telle quelle**, sur 1000, pas traduite en
  « victoire / défaite » : 505 et 900 ne se jouent pas pareil.

La couverture de types, elle, reste calculée sur les types d'attaques — les deux se
complètent, la couverture ne dépendant d'aucune ligue.

⚠️ **Vérifier une page rendue avec `grep -c` ne prouve rien** : le HTML tient sur une seule
ligne (donc `-c` renvoie toujours 1) et le dictionnaire entier est sérialisé dans la charge
RSC, si bien que **tous** les libellés y figurent quelle que soit la page. Compter avec
`grep -o … | wc -l` et viser un marqueur de balisage (une classe, un attribut de taille),
jamais un texte traduit.

### 4. Échanges de chromatiques — **livré**
Voir « Échanges de chromatiques » plus haut pour les règles. Reste à éprouver : le
parcours complet à deux joueurs, qui demande deux sessions authentifiées simultanées.

### 5. Déploiement Vercel + Neon — **seul point restant**

**1. Mettre le projet sous git.** Il ne l'est pas. `.gitignore` est prêt : `.env` est
exclu, `.env.example` est **gardé** (il documente les variables sans rien révéler), et
`public/sprites/` est exclu — 71 Mo régénérables.

**2. Variables d'environnement Vercel** (Production *et* Preview) —

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | chaîne Neon, avec `?sslmode=require` |
| `AUTH_SECRET` | `openssl rand -base64 32` — **pas** celui du dev |
| `CRON_SECRET` | idem, un autre |
| `NEXT_PUBLIC_APP_URL` | l'URL Vercel finale (liens de partage, images OG) |

**3. Les migrations tournent au build**, via `scripts/migrate-deploy.mjs` — sans quoi la
base Neon resterait sans tables.

⚠️ **Neon fait échouer `prisma migrate deploy` sur son verrou consultatif** (`P1002`,
`pg_advisory_lock`, délai de 10 s), **même quand il n'y a rien à appliquer** : le calcul
sort de veille et met plus de 10 s à répondre. Un build Vercel a échoué là-dessus. Le
script désactive donc le verrou (`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK`, documenté par
Prisma pour ce cas) **et** réessaie trois fois — le premier essai sert de réveil.

Ne pas remettre `prisma migrate deploy` en direct dans le `build`. `build:local` reste
disponible pour compiler sans toucher à la base ; `postinstall` lance déjà
`prisma generate`.

**4. Peupler la base.** Une fois déployé, `npm run ingest` en pointant `DATABASE_URL` sur
Neon depuis le poste local : c'est long et Vercel coupe une fonction bien avant. Ensuite
l'administration (`/admin`) et le cron prennent le relais.

**5. Le cron est déjà décrit** dans `vercel.json` : `/api/cron/refresh` chaque lundi 5 h,
authentifié par `Authorization: Bearer $CRON_SECRET`.

**6. Les sprites** ne partent pas avec le dépôt. `/api/sprite/` retombe sur PokeMiners, le
site fonctionne donc sans eux — mais dépend de GitHub à chaud. Pour s'en affranchir :
lancer l'ingestion vers un stockage objet, ou accepter la dépendance au départ.

⚠️ **Le premier compte créé sur la base Neon devient ADMIN** (`registerAction`, via
`prisma.user.count() === 0`). Ce compte-là, pas celui du dev : la base de production part
vide. **Créer son compte juste après le déploiement, avant de communiquer l'URL** — deux
inscriptions simultanées sur une base vide verraient toutes deux `count === 0`.

`npx next build` passe : **24 routes, code de sortie 0** (vérifié le 17/08/2026).


## Vérification rapide

```bash
npm run db:up && npm run dev
npx prisma generate            # après toute migration, puis redémarrer le dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/fr/dashboard
npx next build                 # doit compiler sans erreur TypeScript
npm test                       # formules de PC recoupées contre LeekDuck
```

Pages à cliquer : `/fr/dashboard`, `/fr/list?league=great`, `/fr/shinydex`, `/fr/raids`,
`/fr/raids/groudon`, `/fr/login`. Les captures d'écran de contrôle se font en headless avec
`msedge --headless=new --screenshot`.
