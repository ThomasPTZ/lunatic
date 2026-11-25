// Règles du Lunatic utilisées par le compteur (livret p. 6, 11-13).
// Fonctions pures : aucune dépendance au DOM.

export type Camp = 'rouges' | 'bleus' | 'narcisse';
export type Players = 4 | 5 | 6 | 7;

export const ALL_CAMPS: readonly Camp[] = ['rouges', 'bleus', 'narcisse'];
export const PLAYER_COUNTS: readonly Players[] = [4, 5, 6, 7];

export interface GameState {
  players: Players;
  /** Camps présents dans la partie, dans l'ordre d'affichage. */
  camps: Camp[];
  /** Dates obtenues dans la Saison en cours. */
  scores: Record<Camp, number>;
  /** Saisons remportées. */
  seasons: Record<Camp, number>;
  /** Camps encore en scène dans la Négociation en cours. */
  onStage: Record<Camp, boolean>;
  /** Camp ayant atteint sa cible, en attente de confirmation de la Saison. */
  pendingSeason: Camp | null;
  /** Camp vainqueur de la partie (2 Saisons). */
  winner: Camp | null;
}

export const SEASONS_TO_WIN = 2;
export const BASE_TARGET = 21;
export const DECISIVE_TARGET = 31;

export const CAMP_NAMES: Record<Camp, { name: string; withArticle: string }> = {
  rouges: { name: 'Rouges', withArticle: 'les Rouges' },
  bleus: { name: 'Bleus', withArticle: 'les Bleus' },
  narcisse: { name: 'Narcisse', withArticle: 'Narcisse' },
};

export const COMPOSITION: Record<Players, string> = {
  4: '2 troupes de 2',
  5: '2 troupes de 2 + Narcisse',
  6: '2 troupes de 3',
  7: '2 troupes de 3 + Narcisse',
};

export function hasNarcisse(players: Players): boolean {
  return players === 5 || players === 7;
}

export function campsFor(players: Players): Camp[] {
  return hasNarcisse(players) ? ['rouges', 'bleus', 'narcisse'] : ['rouges', 'bleus'];
}

/** Saison décisive : à 4 ou 6 joueurs uniquement, quand chaque troupe a gagné une Saison. */
export function isDecisive(state: GameState): boolean {
  return (
    !hasNarcisse(state.players) &&
    state.seasons.rouges === 1 &&
    state.seasons.bleus === 1
  );
}

export function targetOf(state: GameState, camp: Camp): number {
  if (camp === 'narcisse') return state.players === 5 ? 11 : 7;
  return isDecisive(state) ? DECISIVE_TARGET : BASE_TARGET;
}

export function remainingOf(state: GameState, camp: Camp): number {
  return targetOf(state, camp) - state.scores[camp];
}

export function campsOnStage(state: GameState): Camp[] {
  return state.camps.filter((c) => state.onStage[c]);
}

/** La Négociation est terminée quand il ne reste qu'un camp en scène. */
export function isNegotiationOver(state: GameState): boolean {
  return campsOnStage(state).length <= 1;
}

/**
 * Clôture = minimum de (cible − score) sur les camps encore en scène.
 * Renvoie null si la Négociation est terminée (un seul camp en scène).
 */
export function cloture(state: GameState): number | null {
  const camps = campsOnStage(state);
  if (camps.length <= 1) return null;
  return Math.min(...camps.map((c) => remainingOf(state, c)));
}

/** Courte ligne indiquant les camps pris en compte dans la Clôture. */
export function clotureScope(state: GameState): string {
  const off = state.camps.filter((c) => !state.onStage[c]);
  const on = campsOnStage(state);
  if (on.length <= 1) {
    return on.length === 1 ? `${capitalize(CAMP_NAMES[on[0]].withArticle)} seul${on[0] === 'narcisse' ? '' : 's'} en scène` : '';
  }
  if (off.length === 0) return 'tous les camps en scène';
  return 'sans ' + off.map((c) => CAMP_NAMES[c].withArticle).join(' ni ');
}

export function canLeaveStage(state: GameState, camp: Camp): boolean {
  return hasNarcisse(state.players) && state.onStage[camp] && campsOnStage(state).length > 1;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
