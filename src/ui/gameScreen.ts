// Écran de partie : bandeau Clôture, colonnes des camps, barre d'actions.
import {
  CAMP_NAMES,
  SEASONS_TO_WIN,
  canLeaveStage,
  capitalize,
  cloture,
  clotureScope,
  hasNarcisse,
  isDecisive,
  remainingOf,
  targetOf,
  type Camp,
} from '../game/rules';
import { canUndo, type Action, type Game } from '../game/reducer';
import { h, setText } from './dom';
import { attachSwipe } from './swipe';

export interface GameScreenCallbacks {
  dispatch(action: Action): void;
  openMenu(): void;
}

export interface GameScreen {
  el: HTMLElement;
  update(game: Game): void;
}

/** « aux Rouges », « à Narcisse » */
export function toCamp(c: Camp): string {
  return c === 'narcisse' ? 'à Narcisse' : `aux ${CAMP_NAMES[c].name}`;
}

interface ColumnRefs {
  col: HTMLElement;
  status: HTMLElement;
  pips: HTMLElement[];
  seasons: HTMLElement;
  score: HTMLElement;
  target: HTMLElement;
  remaining: HTMLElement;
  plus: HTMLButtonElement;
  minus: HTMLButtonElement;
  stage: HTMLButtonElement | null;
}

export function createGameScreen(initial: Game, cb: GameScreenCallbacks): GameScreen {
  let game = initial;
  const { camps, players } = game.state;
  const withStage = hasNarcisse(players);

  // --- Bandeau Clôture ---
  const bannerLabel = h('span', { class: 'banner-label' }, 'Clôture');
  const bannerValue = h('span', { class: 'banner-value' });
  const bannerScope = h('div', { class: 'banner-scope' });
  const decisive = h('div', { class: 'banner-decisive' }, 'Saison décisive : 31 dates');
  const banner = h(
    'header',
    { class: 'banner', 'aria-live': 'polite' },
    h('div', { class: 'banner-main' }, bannerLabel, bannerValue),
    bannerScope,
    decisive,
  );

  // --- Aperçu du swipe ---
  const previewCamp = h('div', { class: 'preview-camp' });
  const previewValue = h('div', { class: 'preview-value' });
  const preview = h('div', { class: 'swipe-preview', 'aria-hidden': 'true', hidden: true }, previewCamp, previewValue);

  // --- Colonnes ---
  const refs = new Map<Camp, ColumnRefs>();
  const columns = h('main', { class: 'columns', style: `--n:${camps.length}` });

  for (const camp of camps) {
    const name = CAMP_NAMES[camp].name;
    const status = h('div', { class: 'col-status' });
    const pips = Array.from({ length: SEASONS_TO_WIN }, () => h('span', { class: 'pip' }));
    const seasons = h('div', { class: 'col-seasons', role: 'img' }, ...pips);
    const plus = h('button', { class: 'btn-score btn-plus', type: 'button', 'aria-label': `Ajouter une date ${toCamp(camp)}` }, '+');
    const minus = h('button', { class: 'btn-score btn-minus', type: 'button', 'aria-label': `Retirer une date ${toCamp(camp)}` }, '−');
    const score = h('div', { class: 'col-score' });
    const target = h('div', { class: 'col-target' });
    const remaining = h('div', { class: 'col-remaining' });
    const stage = withStage ? h('button', { class: 'btn-stage', type: 'button' }) : null;

    const col = h(
      'section',
      { class: `col camp-${camp}`, 'aria-label': name },
      h('h2', { class: 'col-name' }, name),
      status,
      seasons,
      plus,
      h('div', { class: 'col-figures' }, score, target, remaining),
      minus,
      ...(stage ? [stage] : []),
    );

    plus.addEventListener('click', () => cb.dispatch({ type: 'adjust', camp, delta: 1 }));
    minus.addEventListener('click', () => cb.dispatch({ type: 'adjust', camp, delta: -1 }));
    stage?.addEventListener('click', () => cb.dispatch({ type: 'toggleStage', camp }));

    attachSwipe(col, {
      bounds: () => {
        const s = game.state;
        if (s.pendingSeason || s.winner) return null;
        return { score: s.scores[camp], target: targetOf(s, camp) };
      },
      onPreview: (delta, y) => showPreview(camp, delta, y),
      onCommit: (delta) => {
        hidePreview();
        if (delta !== 0) cb.dispatch({ type: 'adjust', camp, delta });
      },
      onCancel: hidePreview,
    });

    refs.set(camp, { col, status, pips, seasons, score, target, remaining, plus, minus, stage });
    columns.append(col);
  }

  function showPreview(camp: Camp, delta: number, clientY: number) {
    const s = game.state;
    const from = s.scores[camp];
    preview.hidden = false;
    preview.className = `swipe-preview camp-${camp} ${clientY > window.innerHeight / 2 ? 'at-top' : 'at-bottom'}`;
    setText(previewCamp, CAMP_NAMES[camp].name);
    if (delta === 0) {
      setText(previewValue, `0 → ${from}`);
      preview.classList.add('is-zero');
    } else {
      setText(previewValue, `${delta > 0 ? '+' : '−'}${Math.abs(delta)} → ${from + delta}`);
    }
    refs.get(camp)?.col.classList.add('is-swiping');
  }

  function hidePreview() {
    preview.hidden = true;
    for (const r of refs.values()) r.col.classList.remove('is-swiping');
  }

  // --- Barre d'actions ---
  const undoBtn = h('button', { class: 'btn-action', type: 'button' }, 'Annuler');
  const prepaBtn = withStage
    ? h('button', { class: 'btn-action', type: 'button', 'aria-label': 'Nouvelle Prépa : tous les camps reviennent en scène' }, 'Nouvelle Prépa')
    : null;
  const menuBtn = h('button', { class: 'btn-action', type: 'button', 'aria-haspopup': 'dialog' }, 'Menu');
  undoBtn.addEventListener('click', () => cb.dispatch({ type: 'undo' }));
  prepaBtn?.addEventListener('click', () => cb.dispatch({ type: 'newPrepa' }));
  menuBtn.addEventListener('click', () => cb.openMenu());
  const actions = h('nav', { class: 'actions', 'aria-label': 'Actions' }, undoBtn, ...(prepaBtn ? [prepaBtn] : []), menuBtn);

  const el = h('div', { class: `screen game cols-${camps.length}` }, banner, columns, actions, preview);

  function update(next: Game) {
    game = next;
    const s = game.state;
    const c = cloture(s);
    if (c === null) {
      banner.classList.add('is-over');
      setText(bannerLabel, 'Négociation terminée');
      setText(bannerValue, '');
    } else {
      banner.classList.remove('is-over');
      setText(bannerLabel, 'Clôture');
      setText(bannerValue, String(c));
    }
    setText(bannerScope, withStage ? clotureScope(s) : '');
    bannerScope.hidden = !withStage;
    decisive.hidden = !isDecisive(s);

    for (const [camp, r] of refs) {
      const score = s.scores[camp];
      const target = targetOf(s, camp);
      const off = !s.onStage[camp];
      const name = CAMP_NAMES[camp];
      r.col.classList.toggle('is-off', off);
      r.col.setAttribute('aria-label', off ? `${name.name}, hors scène` : name.name);
      setText(r.status, off ? 'Hors scène' : '');
      setText(r.score, String(score));
      r.score.setAttribute('aria-label', `${score} dates`);
      setText(r.target, `sur ${target}`);
      const rem = remainingOf(s, camp);
      setText(r.remaining, `reste ${rem}`);
      r.remaining.setAttribute('aria-label', `${rem} date${rem > 1 ? 's' : ''} restante${rem > 1 ? 's' : ''}`);
      r.pips.forEach((p, i) => p.classList.toggle('is-won', i < s.seasons[camp]));
      r.seasons.setAttribute('aria-label', `Saisons gagnées : ${s.seasons[camp]} sur ${SEASONS_TO_WIN}`);
      const locked = s.pendingSeason !== null || s.winner !== null;
      r.plus.disabled = locked || score >= target;
      r.minus.disabled = locked || score <= 0;
      if (r.stage) {
        setText(r.stage, off ? 'Revenir' : 'Quitte la scène');
        r.stage.setAttribute('aria-pressed', String(off));
        const plural = camp !== 'narcisse';
        const who = capitalize(name.withArticle);
        r.stage.setAttribute(
          'aria-label',
          off ? `${who} ${plural ? 'reviennent' : 'revient'} en scène` : `${who} ${plural ? 'quittent' : 'quitte'} la scène`,
        );
        r.stage.disabled = locked || (!off && !canLeaveStage(s, camp));
      }
    }
    undoBtn.disabled = !canUndo(game);
  }

  update(game);
  return { el, update };
}
