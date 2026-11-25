import '@fontsource/lilita-one/400.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/600.css';
import './styles.css';

import { registerSW } from 'virtual:pwa-register';
import { CAMP_NAMES, COMPOSITION, PLAYER_COUNTS, capitalize, type Players } from './game/rules';
import { dispatch, newGame, type Action, type Game } from './game/reducer';
import { loadSaved, save, type Screen } from './game/storage';
import { h } from './ui/dom';
import { createGameScreen, type GameScreen } from './ui/gameScreen';
import { isSwipeActive } from './ui/swipe';
import { setKeepAwake } from './ui/wakeLock';

const app = document.getElementById('app')!;

const saved = loadSaved();
let game: Game | null = saved?.game ?? null;
let screen: Screen = saved && game ? saved.screen : 'launch';
let gameScreen: GameScreen | null = null;
let modal: HTMLElement | null = null;
let menuOpen = false;
let updateAvailable = false;
let applyUpdate: (() => void) | null = null;

function persist() {
  if (game) save({ version: 1, screen, game });
}

function act(action: Action) {
  if (!game) return;
  const next = dispatch(game, action);
  if (next === game) return;
  game = next;
  persist();
  refresh();
}

// ---------- Écran de lancement ----------

function seasonsSummary(g: Game): string {
  return g.state.camps.map((c) => `${CAMP_NAMES[c].name} ${g.state.seasons[c]}`).join(' · ');
}

function renderLaunch(): HTMLElement {
  const list = h('div', { class: 'launch-list' });
  if (game) {
    const resume = h(
      'button',
      { class: 'btn-launch btn-resume', type: 'button' },
      h('span', { class: 'launch-big' }, 'Reprendre la partie'),
      h('span', { class: 'launch-small' }, `${game.state.players} joueurs · Saisons : ${seasonsSummary(game)}`),
    );
    resume.addEventListener('click', () => go('game'));
    list.append(resume);
  }
  for (const p of PLAYER_COUNTS) {
    const b = h(
      'button',
      { class: 'btn-launch', type: 'button', 'aria-label': `Nouvelle partie à ${p} joueurs : ${COMPOSITION[p]}` },
      h('span', { class: 'launch-big' }, `${p} joueurs`),
      h('span', { class: 'launch-small' }, COMPOSITION[p]),
    );
    b.addEventListener('click', () => startGame(p));
    list.append(b);
  }
  return h(
    'div',
    { class: 'screen launch' },
    h(
      'header',
      { class: 'launch-head' },
      h('div', { class: 'launch-tag' }, 'Compteur de dates'),
      h('h1', { class: 'launch-title' }, 'Le Lunatic'),
    ),
    game ? h('p', { class: 'launch-hint' }, 'Nouvelle partie (remplace la partie sauvegardée) :') : '',
    list,
    updateBanner(),
  );
}

function startGame(players: Players) {
  game = newGame(players);
  go('game');
}

function go(next: Screen) {
  screen = next;
  gameScreen = null;
  menuOpen = false;
  persist();
  refresh();
}

// ---------- Fenêtres ----------

function dialog(label: string, ...children: (Node | string)[]): HTMLElement {
  return h(
    'div',
    { class: 'modal' },
    h('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, ...children),
  );
}

function button(text: string, cls: string, onClick: () => void, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = h('button', { class: `btn-modal ${cls}`, type: 'button', ...attrs }, text);
  b.addEventListener('click', onClick);
  return b;
}

function seasonDialog(g: Game): HTMLElement {
  const camp = g.state.pendingSeason!;
  const q = `Saison remportée par ${CAMP_NAMES[camp].withArticle} ?`;
  return dialog(
    q,
    h('p', { class: `modal-title camp-text-${camp}` }, q),
    h('p', { class: 'modal-text' }, `${CAMP_NAMES[camp].name} : ${g.state.scores[camp]} dates`),
    h(
      'div',
      { class: 'modal-buttons' },
      button('Corriger', 'is-secondary', () => act({ type: 'correct' }), { 'aria-label': 'Corriger : annuler le dernier ajout' }),
      button('Confirmer', 'is-primary', () => act({ type: 'confirmSeason' })),
    ),
  );
}

function menuDialog(confirming: boolean): HTMLElement {
  const close = () => {
    menuOpen = false;
    refresh();
  };
  if (confirming) {
    return dialog(
      'Nouvelle partie',
      h('p', { class: 'modal-title' }, 'Abandonner la partie en cours ?'),
      h('p', { class: 'modal-text' }, 'Elle reste disponible via « Reprendre la partie » tant que vous n’en commencez pas une autre.'),
      h(
        'div',
        { class: 'modal-buttons' },
        button('Non', 'is-secondary', close),
        button('Nouvelle partie', 'is-primary', () => go('launch')),
      ),
    );
  }
  const items: HTMLElement[] = [
    button('Nouvelle partie…', 'is-secondary', () => {
      modalConfirm = true;
      refresh();
    }),
  ];
  if (updateAvailable) items.push(button('Installer la mise à jour', 'is-secondary', () => applyUpdate?.()));
  items.push(button('Fermer', 'is-primary', close));
  return dialog('Menu', h('p', { class: 'modal-title' }, 'Menu'), h('div', { class: 'modal-stack' }, ...items));
}
let modalConfirm = false;

function victoryScreen(g: Game): HTMLElement {
  const w = g.state.winner!;
  const who = capitalize(CAMP_NAMES[w].withArticle);
  const text = `${who} ${w === 'narcisse' ? 'remporte' : 'remportent'} la partie !`;
  return h(
    'div',
    { class: `modal victory camp-${w}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': text },
    h(
      'div',
      { class: 'victory-card' },
      h('div', { class: 'victory-tag' }, 'Tête d’affiche du Lunatic'),
      h('p', { class: 'victory-title' }, text),
      h('p', { class: 'victory-seasons' }, `Saisons : ${seasonsSummary(g)}`),
      h(
        'div',
        { class: 'modal-buttons' },
        button('Annuler', 'is-secondary', () => act({ type: 'undo' }), { 'aria-label': 'Annuler la dernière Saison' }),
        button('Nouvelle partie', 'is-primary', () => go('launch')),
      ),
    ),
  );
}

function updateBanner(): HTMLElement | string {
  if (!updateAvailable) return '';
  const b = h('button', { class: 'btn-update', type: 'button' }, 'Nouvelle version disponible — installer');
  b.addEventListener('click', () => applyUpdate?.());
  return b;
}

// ---------- Rendu ----------

function refresh() {
  if (screen === 'game' && game) {
    if (!gameScreen) {
      gameScreen = createGameScreen(game, { dispatch: act, openMenu });
      app.replaceChildren(gameScreen.el);
    } else {
      gameScreen.update(game);
    }
    setKeepAwake(true);
    renderModal();
  } else {
    gameScreen = null;
    setKeepAwake(false);
    app.replaceChildren(renderLaunch());
    modal = null;
  }
}

function openMenu() {
  menuOpen = true;
  modalConfirm = false;
  refresh();
}

let modalKey = '';
function renderModal() {
  if (!game || !gameScreen) return;
  const s = game.state;
  let key = '';
  let next: (() => HTMLElement) | null = null;
  if (s.winner) {
    key = `win-${game.history.length}`;
    next = () => victoryScreen(game!);
  } else if (s.pendingSeason) {
    key = `season-${game.history.length}`;
    next = () => seasonDialog(game!);
  } else if (menuOpen) {
    key = `menu-${modalConfirm}-${updateAvailable}`;
    next = () => menuDialog(modalConfirm);
  }
  if (key === modalKey && (modal !== null) === (next !== null)) return;
  modalKey = key;
  modal?.remove();
  modal = null;
  gameScreen.el.inert = false;
  if (next) {
    modal = next();
    app.append(modal);
    gameScreen.el.inert = true;
    (modal.querySelector('.is-primary') as HTMLElement | null)?.focus();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuOpen && game && !game.state.pendingSeason && !game.state.winner) {
    menuOpen = false;
    refresh();
  }
});

// ---------- Mise à jour de l'application (jamais automatique) ----------

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      updateAvailable = true;
      applyUpdate = () => {
        if (isSwipeActive()) return;
        persist();
        void updateSW(true);
      };
      if (screen === 'launch') refresh();
      else {
        gameScreen?.el.querySelector('.btn-action:last-child')?.classList.add('has-update');
        if (menuOpen) renderModal();
      }
    },
  });
}

refresh();
