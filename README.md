# Le Lunatic — compteur de dates

Webapp mobile (PWA) pour compter les dates d'une partie du **Lunatic**, de 4 à 7 joueurs.
Un seul marqueur tient le téléphone, en portrait. Interface en français, sans compte ni serveur.

- Une colonne par camp (Rouges, Bleus, et Narcisse à 5 ou 7 joueurs).
- Saisie par **swipe vertical** (vers le haut : ajouter, vers le bas : retirer) ou par les boutons **+** / **−**.
- **Clôture** affichée en permanence : minimum de `cible − score` sur les camps encore en scène.
- « Quitte la scène » / « Revenir » et « Nouvelle Prépa » à 5 et 7 joueurs.
- Saisons, Saison décisive à 31 (4 et 6 joueurs, à 1-1), victoire à 2 Saisons.
- « Annuler » sur tout l'historique de la partie ; sauvegarde automatique ; utilisable hors ligne.

## Prérequis

Node.js 20 ou plus récent (testé avec Node 24) et npm.

```sh
npm install
```

## Lancer en développement

```sh
npm run dev
```

Ouvre l'adresse « Local » affichée (http://localhost:5173). En développement, le service worker
n'est pas actif : le mode hors ligne ne se teste qu'avec le build (voir plus bas).

## Tests

```sh
npm test                 # tests unitaires (Vitest) : règles, historique, sauvegarde, calcul du swipe
```

Vérification de l'interface dans Chromium (tactile simulé et souris, 360 × 640 et 390 × 844,
2 et 3 colonnes, hors ligne), avec captures d'écran :

```sh
npm run build
npx vite preview --port 4173          # dans un premier terminal
node scripts/ui-check.mjs captures    # dans un second ; captures dans ./captures
```

Le script utilise le Chromium installé (`/usr/bin/chromium` par défaut ; sinon passer le chemin
en 3e argument ou via `CHROMIUM_PATH`). `playwright-core` ne télécharge aucun navigateur.

## Build

```sh
npm run build      # vérification des types puis site statique dans dist/
npm run preview    # sert dist/ sur http://localhost:4173 (et sur le réseau local)
```

Tous les chemins sont relatifs (`base: './'`) : `dist/` fonctionne tel quel dans n'importe quel
sous-dossier. Polices (Lilita One, Lexend) et icônes sont embarquées ; aucun CDN.

Pour régénérer les icônes PNG à partir de `public/icons/icon.svg` : `node scripts/make-icons.mjs`.

## Tester sur un téléphone via le réseau local

1. Le téléphone et l'ordinateur sont sur le même Wi-Fi.
2. `npm run dev` (ou `npm run build && npm run preview`) : Vite affiche une adresse « Network »,
   par exemple `http://192.168.1.20:5173`. L'ouvrir sur le téléphone.
3. Si rien ne s'affiche, autoriser le port (5173 ou 4173) dans le pare-feu de l'ordinateur.

> **Important : le mode hors ligne (service worker), l'installation de la PWA et le maintien de
> l'écran allumé (Screen Wake Lock) demandent un contexte sécurisé, c'est-à-dire HTTPS ou
> `localhost`.** Ils ne fonctionnent pas via une adresse IP locale en HTTP simple
> (`http://192.168.…`). Le comptage, le swipe, les boutons et la sauvegarde, eux, fonctionnent.

Pour tester ces fonctions sur un vrai téléphone :

- **Android + Chrome** : brancher le téléphone en USB, activer le débogage USB, ouvrir
  `chrome://inspect` sur l'ordinateur, puis « Port forwarding » : `4173 → localhost:4173`.
  Sur le téléphone, ouvrir `http://localhost:4173` : c'est un contexte sécurisé.
- **iPhone ou tout appareil** : déployer sur GitHub Pages (HTTPS), voir ci-dessous.

## Déploiement sur GitHub Pages

Rien n'est déployé automatiquement. Deux possibilités :

**A. GitHub Actions (recommandé).** Dans le dépôt : *Settings → Pages → Source : GitHub Actions*,
puis ajouter `.github/workflows/pages.yml` :

```yaml
name: Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

**B. À la main.** `npm run build`, puis publier le contenu de `dist/` sur la branche `gh-pages`
(par exemple avec `npx gh-pages -d dist`) et choisir cette branche dans *Settings → Pages*.

### Mises à jour de l'application

Une nouvelle version n'est **jamais** activée automatiquement : quand elle est détectée, un point
apparaît sur « Menu » et le menu propose « Installer la mise à jour » (sur l'écran de lancement,
un bouton dédié). La page ne se recharge qu'après cet appui, jamais pendant un geste ; la partie
en cours est sauvegardée et reprise après le rechargement.

## Architecture

```
src/
  game/rules.ts      configuration par nombre de joueurs, cibles, Saison décisive, Clôture (pur)
  game/reducer.ts    état + action → nouvel état ; historique, Annuler, Corriger (pur)
  game/storage.ts    sauvegarde localStorage versionnée et validée (try/catch)
  ui/swipeMath.ts    calcul pur du delta d'un swipe
  ui/swipe.ts        Pointer Events, capture, annulation, vibration
  ui/gameScreen.ts   écran de partie
  ui/wakeLock.ts     maintien de l'écran allumé
  main.ts            écrans, fenêtres, sauvegarde, mise à jour PWA
  styles.css         thème « salle obscure »
tests/               Vitest
scripts/             génération des icônes, vérification de l'interface
```

### Swipe : réglages

Constantes dans `src/ui/swipeMath.ts` :

| Constante | Valeur | Rôle |
|---|---|---|
| `DEAD_ZONE_PX` | 12 | zone morte avant le premier cran |
| `STEP_MIN_PX` / `STEP_MAX_PX` | 10 / 18 | bornes du pas |
| `REACH_FRACTION` | 0,5 | part de la hauteur du viewport pour l'amplitude maximale |

`pas = clamp((0,5 × hauteur du viewport − 12) / amplitude, 10, 18)`, calculé au début du geste,
séparément pour chaque sens (amplitude = `cible − score` vers le haut, `score` vers le bas).
Le delta est mesuré depuis le point de départ et n'est appliqué qu'au relâchement.

### Choix et écarts notés

- Couleurs des camps : les cartes joueur du livret (p. 7) sont rouges, bleues et blanche (Narcisse).
  Les filets dorés sont décoratifs et ne désignent aucun camp.
- Test 2 (exemple p. 15) : couleurs du livret, Bleus 10, Rouges 8, Narcisse 5.
- `npm audit` signale 4 vulnérabilités modérées dans `glob`/`minimatch`, utilisés par
  `workbox-build` **au moment du build uniquement** (rien n'est livré dans le site). La correction
  proposée rétrograde `vite-plugin-pwa` (changement cassant) : non appliquée.
