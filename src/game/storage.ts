// Sauvegarde versionnée dans localStorage, validée au chargement.
import { ALL_CAMPS, PLAYER_COUNTS, SEASONS_TO_WIN, campsFor, targetOf, type Camp, type GameState } from './rules';
import { HISTORY_LIMIT, type Game } from './reducer';

export const STORAGE_KEY = 'lunatic.compteur';
export const STORAGE_VERSION = 1;

export type Screen = 'launch' | 'game';

export interface Saved {
  version: typeof STORAGE_VERSION;
  screen: Screen;
  game: Game;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCampRecord<T>(v: unknown, check: (x: unknown) => x is T): v is Record<Camp, T> {
  return isObject(v) && ALL_CAMPS.every((c) => check(v[c]));
}

const isInt = (x: unknown): x is number => Number.isInteger(x);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';

/** Vérifie la forme et la cohérence d'un état de partie. */
export function isValidState(v: unknown): v is GameState {
  if (!isObject(v)) return false;
  if (!PLAYER_COUNTS.includes(v.players as never)) return false;
  const s = v as unknown as GameState;
  const expected = campsFor(s.players);
  if (!Array.isArray(s.camps) || s.camps.length !== expected.length || s.camps.some((c, i) => c !== expected[i])) return false;
  if (!isCampRecord(s.scores, isInt) || !isCampRecord(s.seasons, isInt) || !isCampRecord(s.onStage, isBool)) return false;
  for (const c of s.camps) {
    if (s.seasons[c] < 0 || s.seasons[c] > SEASONS_TO_WIN) return false;
    if (s.scores[c] < 0 || s.scores[c] > targetOf(s, c)) return false;
  }
  if (!s.camps.some((c) => s.onStage[c])) return false;
  if (s.pendingSeason !== null) {
    if (!s.camps.includes(s.pendingSeason) || s.scores[s.pendingSeason] !== targetOf(s, s.pendingSeason)) return false;
  }
  if (s.winner !== null) {
    if (!s.camps.includes(s.winner) || s.seasons[s.winner] !== SEASONS_TO_WIN) return false;
  } else if (s.camps.some((c) => s.seasons[c] >= SEASONS_TO_WIN)) {
    return false;
  }
  return true;
}

/** Analyse une sauvegarde brute. Renvoie null si elle est absente ou invalide. */
export function parseSaved(raw: string | null): Saved | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== STORAGE_VERSION) return null;
  const game = data.game;
  if (!isObject(game) || !isValidState(game.state)) return null;
  const state = game.state as GameState;
  // Un historique incohérent n'empêche pas de reprendre la partie : on le vide.
  let history: GameState[] = [];
  if (Array.isArray(game.history) && game.history.every(isValidState)) {
    history = (game.history as GameState[]).filter((h) => h.players === state.players).slice(-HISTORY_LIMIT);
  }
  const screen: Screen = data.screen === 'launch' ? 'launch' : 'game';
  return { version: STORAGE_VERSION, screen, game: { state, history } };
}

export function loadSaved(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Saved | null {
  if (!storage) return null;
  try {
    return parseSaved(storage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Enregistre ; renvoie false si le stockage est indisponible ou plein. */
export function save(saved: Saved, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
