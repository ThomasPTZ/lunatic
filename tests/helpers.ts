import { newGame, dispatch, type Action, type Game } from '../src/game/reducer';
import type { Camp, GameState, Players } from '../src/game/rules';

/** Partie avec des scores et Saisons imposés (sans historique). */
export function gameWith(
  players: Players,
  scores: Partial<Record<Camp, number>> = {},
  seasons: Partial<Record<Camp, number>> = {},
): Game {
  const g = newGame(players);
  const state: GameState = {
    ...g.state,
    scores: { ...g.state.scores, ...scores },
    seasons: { ...g.state.seasons, ...seasons },
  };
  return { state, history: [] };
}

export function run(game: Game, ...actions: Action[]): Game {
  return actions.reduce(dispatch, game);
}
