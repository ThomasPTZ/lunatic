// Vérification de l'interface dans Chromium (tactile simulé et souris).
// Prérequis : `npm run build && npx vite preview --port 4173` dans un autre terminal.
// Usage : node scripts/ui-check.mjs [dossier-captures] [url] [chemin-chromium]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const OUT = process.argv[2] ?? 'captures';
const URL = process.argv[3] ?? 'http://localhost:4173/';
const executablePath = process.argv[4] ?? process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
await mkdir(OUT, { recursive: true });

const failures = [];
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath });

async function open(viewport, { touch = true } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: touch,
    isMobile: touch,
    locale: 'fr-FR',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL);
  const cdp = touch ? await context.newCDPSession(page) : null;
  return { context, page, cdp, errors };
}

async function startGame(page, players) {
  await page.getByRole('button', { name: new RegExp(`^Nouvelle partie à ${players} joueurs`) }).click();
  await page.waitForSelector('.screen.game');
}

const score = (page, camp) => page.locator(`.col.camp-${camp} .col-score`).innerText().then(Number);
const banner = (page) => page.locator('.banner').innerText();

/** Point de départ d'un geste : centre de la zone des chiffres (hors boutons). */
async function figuresCenter(page, camp) {
  const b = await page.locator(`.col.camp-${camp} .col-figures`).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function touch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

/** Laisse Chromium traiter les pointermove regroupés par image. */
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Glissement tactile vertical ; `end` = 'end' | 'cancel' | 'hold'. */
async function touchDrag(cdp, x, y0, y1, { steps = 12, end = 'end', via = null } = {}) {
  await touch(cdp, 'touchStart', [{ x, y: y0, id: 1 }]);
  const path = via === null ? [y1] : [via, y1];
  let from = y0;
  for (const target of path) {
    for (let i = 1; i <= steps; i++) {
      await touch(cdp, 'touchMove', [{ x, y: from + ((target - from) * i) / steps, id: 1 }]);
    }
    from = target;
  }
  if (end === 'end') await touch(cdp, 'touchEnd', []);
  if (end === 'cancel') await touch(cdp, 'touchCancel', []);
}

/** Vérifie que rien ne déborde et que tout tient sans défilement. */
async function checkLayout(page, label) {
  const r = await page.evaluate(() => {
    const W = innerWidth;
    const H = innerHeight;
    const out = [];
    for (const el of document.querySelectorAll('.screen.game *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.swipe-preview')) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (b.left < -0.5 || b.top < -0.5 || b.right > W + 0.5 || b.bottom > H + 0.5) {
        out.push(`${el.className || el.tagName} ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`);
      }
    }
    // Texte coupé dans son conteneur (scrollWidth > clientWidth)
    const clipped = [...document.querySelectorAll('.col-name, .col-score, .btn-stage, .btn-action, .banner-scope, .col-status')]
      // Hauteur ignorée pour les scores : les glyphes de Lilita One débordent légèrement de leur boîte.
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || (!e.classList.contains('col-score') && e.scrollHeight > e.clientHeight + 1))
      .map((e) => `${e.className}: « ${e.textContent} »`);
    const small = [...document.querySelectorAll('.btn-score, .btn-stage, .btn-action')]
      .map((e) => ({ c: e.className, b: e.getBoundingClientRect() }))
      .filter(({ b }) => b.width < 48 || b.height < 48)
      .map(({ c, b }) => `${c} ${Math.round(b.width)}×${Math.round(b.height)}`);
    const scroll = document.scrollingElement.scrollHeight > H || document.scrollingElement.scrollWidth > W;
    // Chevauchements : chiffres / boutons d'une même colonne (glyphes réels, via Range)
    const overlaps = [];
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const col of document.querySelectorAll('.col')) {
      const parts = [...col.querySelectorAll('.col-score, .col-target, .col-remaining, .col-name, .col-seasons, .col-status')]
        .filter((e) => e.textContent || e.classList.contains('col-seasons'))
        .map((e) => { const r = document.createRange(); r.selectNodeContents(e); return { n: e.className, b: e.classList.contains('col-seasons') ? e.getBoundingClientRect() : r.getBoundingClientRect() }; });
      const buttons = [...col.querySelectorAll('button')].map((e) => ({ n: e.className, b: e.getBoundingClientRect() }));
      for (const p of parts) for (const q of [...buttons, ...parts]) {
        const stacked = /col-(score|target|remaining)/.test(p.n) && /col-(score|target|remaining)/.test(q.n);
        if (p !== q && !stacked && hit(p.b, q.b)) overlaps.push(`${col.className.split(' ')[1]} : ${p.n} / ${q.n}`);
      }
    }
    return { out, clipped, small, scroll, overlaps: [...new Set(overlaps)] };
  });
  check(`${label} : aucun élément hors écran`, r.out.length === 0, r.out.slice(0, 4).join(' | '));
  check(`${label} : aucun texte coupé`, r.clipped.length === 0, r.clipped.join(' | '));
  check(`${label} : boutons ≥ 48 × 48 px`, r.small.length === 0, r.small.join(' | '));
  check(`${label} : pas de défilement`, !r.scroll);
  check(`${label} : aucun chevauchement texte / boutons`, r.overlaps.length === 0, r.overlaps.slice(0, 4).join(' | '));
}

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
];
// Mise en page : portrait et paysage (téléphone couché)
const LAYOUT_VIEWPORTS = [
  ...VIEWPORTS,
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 640, height: 360 },
];

// ---------- 1. Mise en page : 4 à 7 joueurs, deux tailles ----------
for (const vp of LAYOUT_VIEWPORTS) {
  const tag = `${vp.width}x${vp.height}`;
  const { page, context } = await open(vp);
  await page.screenshot({ path: `${OUT}/${tag}-lancement.png` });
  for (const p of [4, 5, 6, 7]) {
    await page.evaluate(() => localStorage.clear());
    await page.goto(URL);
    await startGame(page, p);
    // Quelques scores à deux chiffres pour le pire cas de largeur
    for (const camp of ['rouges', 'bleus']) for (let i = 0; i < 18; i++) await page.locator(`.col.camp-${camp} .btn-plus`).click();
    await checkLayout(page, `${tag} ${p} joueurs`);
    await page.screenshot({ path: `${OUT}/${tag}-${p}j.png` });
    if (p === 5 || p === 7) {
      await page.locator('.col.camp-narcisse .btn-stage').click();
      await checkLayout(page, `${tag} ${p} joueurs, Narcisse hors scène`);
      await page.screenshot({ path: `${OUT}/${tag}-${p}j-narcisse-hors-scene.png` });
      await page.locator('.col.camp-rouges .btn-stage').click();
      await checkLayout(page, `${tag} ${p} joueurs, Négociation terminée`);
      await page.screenshot({ path: `${OUT}/${tag}-${p}j-negociation-terminee.png` });
    }
  }
  await context.close();
}

// ---------- 2. Swipe tactile (360 × 640, 5 joueurs) ----------
{
  const { page, cdp, context, errors } = await open(VIEWPORTS[0]);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await startGame(page, 5);
  const c = await figuresCenter(page, 'rouges');

  // Pas à 640 px, Rouges 0/21 : (320 − 12) / 21 ≈ 14,67 px. +7 → 12 + 7 × 14,67 ≈ 114,7 px
  await touchDrag(cdp, c.x, c.y, c.y - 118, { end: 'hold' });
  await settle(page);
  const prevText = await page.locator('.swipe-preview .preview-value').innerText();
  check('swipe : aperçu « +7 → 7 » pendant le geste', prevText === '+7 → 7', prevText);
  const pb = await page.locator('.swipe-preview').boundingBox();
  const fingerY = c.y - 118;
  check('swipe : l’aperçu n’est pas sous le doigt', fingerY < pb.y - 20 || fingerY > pb.y + pb.height + 20, `doigt y=${Math.round(fingerY)}, aperçu ${Math.round(pb.y)}–${Math.round(pb.y + pb.height)}`);
  check('swipe : score inchangé avant le relâchement', (await score(page, 'rouges')) === 0);
  await page.screenshot({ path: `${OUT}/swipe-apercu.png` });
  await touch(cdp, 'touchEnd', []);
  check('swipe : +7 appliqué au relâchement', (await score(page, 'rouges')) === 7);
  check('swipe : aperçu masqué après le geste', await page.locator('.swipe-preview').isHidden());

  // Aller-retour vers le point de départ : 0
  await touchDrag(cdp, c.x, c.y, c.y, { via: c.y - 100 });
  check('swipe : revenir au départ annule', (await score(page, 'rouges')) === 7);

  // pointercancel
  await touchDrag(cdp, c.x, c.y, c.y - 100, { end: 'cancel' });
  check('swipe : pointercancel annule', (await score(page, 'rouges')) === 7);

  // Simple appui
  await touch(cdp, 'touchStart', [{ x: c.x, y: c.y, id: 1 }]);
  await touch(cdp, 'touchEnd', []);
  check('swipe : un simple appui ne fait rien', (await score(page, 'rouges')) === 7);

  // Vers le bas, borné au score
  await touchDrag(cdp, c.x, c.y, Math.min(c.y + 300, 630));
  check('swipe : retrait borné à −score', (await score(page, 'rouges')) === 0, String(await score(page, 'rouges')));

  // Geste commencé sur un bouton
  const plus = await page.locator('.col.camp-bleus .btn-plus').boundingBox();
  await touchDrag(cdp, plus.x + plus.width / 2, plus.y + plus.height / 2, plus.y + 200);
  const bleusAfterButton = await score(page, 'bleus');
  check('swipe : un geste commencé sur un bouton ne déclenche pas de swipe', bleusAfterButton === 0, `Bleus = ${bleusAfterButton}`);

  // Second doigt ignoré
  const b = await figuresCenter(page, 'bleus');
  await touch(cdp, 'touchStart', [{ x: c.x, y: c.y, id: 1 }]);
  await touch(cdp, 'touchMove', [{ x: c.x, y: c.y - 60, id: 1 }]);
  await touch(cdp, 'touchStart', [{ x: c.x, y: c.y - 60, id: 1 }, { x: b.x, y: b.y, id: 2 }]);
  for (let i = 1; i <= 6; i++) {
    await touch(cdp, 'touchMove', [{ x: c.x, y: c.y - 60 - i * 5, id: 1 }, { x: b.x, y: b.y - i * 30, id: 2 }]);
  }
  await touch(cdp, 'touchEnd', []);
  const r2 = await score(page, 'rouges');
  const b2 = await score(page, 'bleus');
  check('swipe : un second doigt est ignoré', b2 === 0 && r2 === 5, `Rouges ${r2} (attendu 5), Bleus ${b2} (attendu 0)`);

  // Amplitude maximale 21, depuis un départ raisonnable (bas de colonne)
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await startGame(page, 5);
  const col = await page.locator('.col.camp-bleus').boundingBox();
  const startY = col.y + col.height * 0.7;
  await touchDrag(cdp, col.x + col.width / 2, startY, startY - 323, { steps: 30, end: 'hold' });
  await settle(page);
  const maxText = await page.locator('.swipe-preview .preview-value').innerText();
  check('swipe : +21 atteint vers 320 px (moitié de 640)', maxText === '+21 → 21', `${maxText}, départ y=${Math.round(startY)}`);
  await touch(cdp, 'touchEnd', []);
  check('Saison : la fenêtre s’ouvre à la cible', await page.getByText('Saison remportée par les Bleus ?').isVisible());
  await page.screenshot({ path: `${OUT}/saison-confirmation.png` });

  // Rafraîchissement pendant la confirmation
  await page.reload();
  await page.waitForSelector('.screen.game');
  check('rafraîchissement : la confirmation de Saison est conservée', await page.getByText('Saison remportée par les Bleus ?').isVisible());
  await page.getByRole('button', { name: /^Corriger/ }).click();
  check('Corriger : annule l’ajout, pas de Saison', (await score(page, 'bleus')) === 0 && (await page.locator('.col.camp-bleus .pip.is-won').count()) === 0);
  check('aucune erreur JavaScript (swipe)', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 3. Camps en scène, Annuler (5 joueurs, boutons) ----------
{
  const { page, context } = await open(VIEWPORTS[1]);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await startGame(page, 5);
  const plus = (camp, n) => Promise.all([]).then(async () => { for (let i = 0; i < n; i++) await page.locator(`.col.camp-${camp} .btn-plus`).click(); });
  await plus('bleus', 10);
  await plus('rouges', 8);
  await plus('narcisse', 5);
  check('5 j. Bleus 10, Rouges 8, Narcisse 5 : Clôture 6', (await page.locator('.banner-value').innerText()) === '6');
  await page.locator('.col.camp-narcisse .btn-stage').click();
  check('Narcisse sort : Clôture 11, « sans Narcisse »', (await page.locator('.banner-value').innerText()) === '11' && (await banner(page)).includes('sans Narcisse'));
  check('Narcisse sort : mention « Hors scène » et bouton « Revenir »',
    (await page.locator('.col.camp-narcisse .col-status').innerText()).toLowerCase() === 'hors scène' &&
    (await page.locator('.col.camp-narcisse .btn-stage').innerText()) === 'Revenir');
  check('hors scène : boutons de score actifs', await page.locator('.col.camp-narcisse .btn-plus').isEnabled());
  // Retrait : ne remet pas en scène
  await page.locator('.col.camp-rouges .btn-minus').click();
  check('retrait : Narcisse reste hors scène', await page.locator('.col.camp-narcisse.is-off').count() === 1);
  await page.locator('.col.camp-rouges .btn-plus').click();
  check('ajout : Narcisse revient en scène', await page.locator('.col.camp-narcisse.is-off').count() === 0);
  // Dernier camp en scène
  await page.locator('.col.camp-narcisse .btn-stage').click();
  await page.locator('.col.camp-rouges .btn-stage').click();
  check('dernier camp : « Négociation terminée »', (await banner(page)).includes('Négociation terminée'));
  check('dernier camp : ne peut pas sortir', await page.locator('.col.camp-bleus .btn-stage').isDisabled());
  await page.getByRole('button', { name: /^Nouvelle Prépa/ }).click();
  check('Nouvelle Prépa : tous en scène', await page.locator('.col.is-off').count() === 0);
  await page.getByRole('button', { name: 'Annuler' }).click();
  check('Annuler : restaure les camps hors scène', await page.locator('.col.is-off').count() === 2);
  // Zoom : double appui rapide sur « + »
  const vv0 = await page.evaluate(() => visualViewport.scale);
  await page.locator('.col.camp-bleus .btn-plus').tap();
  await page.locator('.col.camp-bleus .btn-plus').tap();
  const vv1 = await page.evaluate(() => visualViewport.scale);
  check('appuis rapides : pas de zoom', vv0 === vv1);
  await context.close();
}

// ---------- 4. Saison décisive, 31 au swipe, victoire (4 joueurs) ----------
{
  const { page, cdp, context } = await open(VIEWPORTS[0]);
  const state = (scores, seasons) => ({
    version: 1,
    screen: 'game',
    game: {
      state: {
        players: 4,
        camps: ['rouges', 'bleus'],
        scores: { rouges: 0, bleus: 0, narcisse: 0, ...scores },
        seasons: { rouges: 0, bleus: 0, narcisse: 0, ...seasons },
        onStage: { rouges: true, bleus: true, narcisse: true },
        pendingSeason: null,
        winner: null,
      },
      history: [],
    },
  });
  await page.evaluate((s) => localStorage.setItem('lunatic.compteur', JSON.stringify(s)), state({}, { rouges: 1, bleus: 1 }));
  await page.reload();
  await page.waitForSelector('.screen.game');
  check('4 j. à 1-1 : « Saison décisive : 31 dates » et Clôture 31',
    (await banner(page)).includes('Saison décisive : 31 dates') && (await page.locator('.banner-value').innerText()) === '31');
  await checkLayout(page, '360x640 Saison décisive');
  await page.screenshot({ path: `${OUT}/360x640-saison-decisive.png` });
  const col = await page.locator('.col.camp-rouges').boundingBox();
  const y0 = col.y + col.height * 0.75;
  await touchDrag(cdp, col.x + col.width / 2, y0, y0 - 325, { steps: 30, end: 'hold' });
  await settle(page);
  const t = await page.locator('.swipe-preview .preview-value').innerText();
  check('swipe : +31 atteint vers 322 px (pas plancher 10)', t === '+31 → 31', `${t}, départ y=${Math.round(y0)}`);
  await touch(cdp, 'touchCancel', []);

  await page.evaluate((s) => localStorage.setItem('lunatic.compteur', JSON.stringify(s)), state({ rouges: 30 }, { rouges: 1, bleus: 1 }));
  await page.reload();
  await page.locator('.col.camp-rouges .btn-plus').click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  check('victoire : écran affiché', await page.getByText('Les Rouges remportent la partie !').isVisible());
  await page.screenshot({ path: `${OUT}/360x640-victoire.png` });
  await page.getByRole('button', { name: /Annuler la dernière Saison/ }).click();
  check('victoire → Annuler : retour à la confirmation', await page.getByText('Saison remportée par les Rouges ?').isVisible());
  await context.close();
}

// ---------- 5. Souris (ordinateur) ----------
{
  const { page, context, errors } = await open(VIEWPORTS[1], { touch: false });
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await startGame(page, 7);
  const c = await figuresCenter(page, 'narcisse');
  // Narcisse 0/7 : pas 18 px. +5 → 12 + 5 × 18 = 102 px
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(c.x, c.y - (105 * i) / 10);
  await settle(page);
  check('souris : aperçu « +5 → 5 »', (await page.locator('.swipe-preview .preview-value').innerText()) === '+5 → 5');
  await page.mouse.up();
  check('souris : +5 appliqué', (await score(page, 'narcisse')) === 5);
  await page.locator('.col.camp-narcisse .btn-minus').click();
  check('souris : bouton −', (await score(page, 'narcisse')) === 4);
  await page.mouse.click(c.x, c.y);
  check('souris : un clic sur la colonne ne fait rien', (await score(page, 'narcisse')) === 4);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Nouvelle partie…' }).click();
  check('Menu : confirmation de nouvelle partie', await page.getByText('Abandonner la partie en cours ?').isVisible());
  await page.screenshot({ path: `${OUT}/390x844-menu-confirmation.png` });
  await page.getByRole('button', { name: 'Nouvelle partie', exact: true }).click();
  check('Lancement : « Reprendre la partie » en premier', (await page.locator('.launch-list button').first().innerText()).startsWith('Reprendre la partie'));
  await page.screenshot({ path: `${OUT}/390x844-lancement-reprendre.png` });
  check('aucune erreur JavaScript (souris)', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 6. Hors ligne (service worker, localhost = contexte sécurisé) ----------
{
  const context = await browser.newContext({ viewport: VIEWPORTS[0], hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(URL);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // Laisse le précache se terminer
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length >= 20, null, { timeout: 15000 });
  await context.setOffline(true);
  await page.reload();
  await startGame(page, 5);
  const fontsOk = await page.evaluate(() => document.fonts.check('1em "Lilita One"') && document.fonts.check('600 1em Lexend'));
  check('hors ligne : l’application se charge et démarre une partie', await page.locator('.col.camp-narcisse').isVisible());
  check('hors ligne : polices embarquées disponibles', fontsOk);
  await page.screenshot({ path: `${OUT}/hors-ligne-5j.png` });
  await context.close();
}

await browser.close();
console.log(`\n${passed} vérifications réussies, ${failures.length} échec(s).`);
if (failures.length) {
  console.log(failures.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
