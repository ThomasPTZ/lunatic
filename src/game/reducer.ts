// Transitions pures : état + action → nouvel état, avec historique pour « Annuler ».
import {
  ALL_CAMPS,
  SEASONS_TO_WIN,
  campsFor,
  canLeaveStage,
  hasNarcisse,
  targetOf,
  type Camp,
  type GameState,
  type Players,
} from './rules';

export type Action =
  | { type: 'adjust'; camp: Camp; delta: number }
  | { type: 'toggleStage'; camp: Camp }
  | { type: 'newPrepa' }
  | { type: 'confirmSeason' }
  | { type: 'correct' }
  | { type: 'undo' };

export interface Game {
  state: GameState;
  /** États précédents, du plus ancien au plus récent. */
  history: GameState[];
}

export const HISTORY_LIMIT = 2000;

function record<T>(value: T): Record<Camp, T> {
  return { rouges: value, bleus: value, narcisse: value };
}

export function initialState(players: Players): GameState {
  return {
    players,
    camps: campsFor(players),
    scores: record(0),
    seasons: record(0),
    onStage: record(true),
    pendingSeason: null,
    winner: null,
  };
}

export function newGame(players: Players): Game {
  return { state: initialState(players), history: [] };
}

function allOnStage(): Record<Camp, boolean> {
  return record(true);
}

function isLocked(state: GameState): boolean {
  return state.pendingSeason !== null || state.winner !== null;
}

/** Applique une action « de jeu ». Renvoie le même objet si l'action ne change rien. */
export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'adjust': {
      const { camp } = action;
      if (isLocked(state) || !state.camps.includes(camp) || !Number.isInteger(action.delta)) return state;
      const target = targetOf(state, camp);
      const before = state.scores[camp];
      const after = Math.min(target, Math.max(0, before + action.delta));
      if (after === before) return state;
      const scores = { ...state.scores, [camp]: after };
      if (after < before) {
        // Un retrait est une correction : il ne change rien aux camps en scène.
        return { ...state, scores };
      }
      // Un ajout validé termine la Négociation : tous les camps reviennent en scène.
      return {
        ...state,
        scores,
        onStage: allOnStage(),
        pendingSeason: after === target ? camp : null,
      };
    }
    case 'toggleStage': {
      const { camp } = action;
      if (isLocked(state) || !hasNarcisse(state.players) || !state.camps.includes(camp)) return state;
      if (state.onStage[camp]) {
        if (!canLeaveStage(state, camp)) return state;
        return { ...state, onStage: { ...state.onStage, [camp]: false } };
      }
      return { ...state, onStage: { ...state.onStage, [camp]: true } };
    }
    case 'newPrepa': {
      if (isLocked(state)) return state;
      if (ALL_CAMPS.every((c) => state.onStage[c])) return state;
      return { ...state, onStage: allOnStage() };
    }
    case 'confirmSeason': {
      const camp = state.pendingSeason;
      if (camp === null || state.winner !== null) return state;
      const seasons = { ...state.seasons, [camp]: state.seasons[camp] + 1 };
      return {
        ...state,
        seasons,
        scores: record(0),
        onStage: allOnStage(),
        pendingSeason: null,
        winner: seasons[camp] >= SEASONS_TO_WIN ? camp : null,
      };
    }
    case 'correct':
    case 'undo':
      // Gérées par dispatch (elles dépendent de l'historique).
      return state;
  }
}

/** Point d'entrée unique : gère l'historique, « Annuler » et « Corriger ». */
export function dispatch(game: Game, action: Action): Game {
  if (action.type === 'undo' || (action.type === 'correct' && game.state.pendingSeason !== null)) {
    if (game.history.length === 0) return game;
    return {
      state: game.history[game.history.length - 1],
      history: game.history.slice(0, -1),
    };
  }
  const next = applyAction(game.state, action);
  if (next === game.state) return game;
  const history = [...game.history, game.state];
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  return { state: next, history };
}

export function canUndo(game: Game): boolean {
  return game.history.length > 0;
}
