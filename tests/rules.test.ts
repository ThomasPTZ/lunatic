import { describe, expect, it } from 'vitest';
import { canLeaveStage, cloture, clotureScope, isDecisive, isNegotiationOver, targetOf } from '../src/game/rules';
import { canUndo } from '../src/game/reducer';
import { gameWith, run } from './helpers';

describe('Clôture et cibles (critères d’acceptation)', () => {
  it('1. 4 joueurs, Rouges 6, Bleus 11 : Clôture 10 (livret p. 12)', () => {
    const g = gameWith(4, { rouges: 6, bleus: 11 });
    expect(cloture(g.state)).toBe(10);
  });

  it('2. 5 joueurs, Bleus 10, Rouges 8, Narcisse 5 : Clôture 6, puis 11 sans Narcisse ; +11 aux Rouges → 19 et Narcisse revient (livret p. 15)', () => {
    let g = gameWith(5, { bleus: 10, rouges: 8, narcisse: 5 });
    expect(cloture(g.state)).toBe(6);
    expect(clotureScope(g.state)).toBe('tous les camps en scène');

    g = run(g, { type: 'toggleStage', camp: 'narcisse' });
    expect(g.state.onStage.narcisse).toBe(false);
    expect(cloture(g.state)).toBe(11);
    expect(clotureScope(g.state)).toBe('sans Narcisse');

    g = run(g, { type: 'adjust', camp: 'rouges', delta: 11 });
    expect(g.state.scores.rouges).toBe(19);
    expect(g.state.onStage.narcisse).toBe(true);
    expect(g.state.pendingSeason).toBeNull();
  });

  it('3. 5 joueurs, Rouges 18, Bleus 8, Narcisse 5 : Clôture 3 ; sans les Rouges : 6', () => {
    let g = gameWith(5, { rouges: 18, bleus: 8, narcisse: 5 });
    expect(cloture(g.state)).toBe(3);
    g = run(g, { type: 'toggleStage', camp: 'rouges' });
    expect(cloture(g.state)).toBe(6);
    expect(clotureScope(g.state)).toBe('sans les Rouges');
  });

  it('4. 7 joueurs, scores à 0 : Clôture 7 ; sans Narcisse : 21', () => {
    let g = gameWith(7);
    expect(targetOf(g.state, 'narcisse')).toBe(7);
    expect(cloture(g.state)).toBe(7);
    g = run(g, { type: 'toggleStage', camp: 'narcisse' });
    expect(cloture(g.state)).toBe(21);
  });

  it.each([4, 6] as const)('5. %i joueurs à 1-1 : cible 31, Clôture 31 à 0-0', (p) => {
    const g = gameWith(p, {}, { rouges: 1, bleus: 1 });
    expect(isDecisive(g.state)).toBe(true);
    expect(targetOf(g.state, 'rouges')).toBe(31);
    expect(targetOf(g.state, 'bleus')).toBe(31);
    expect(cloture(g.state)).toBe(31);
  });

  it.each([4, 6] as const)('5 bis. %i joueurs à 1-0 : cible 21', (p) => {
    const g = gameWith(p, {}, { rouges: 1 });
    expect(isDecisive(g.state)).toBe(false);
    expect(cloture(g.state)).toBe(21);
  });

  it('6. 5 et 7 joueurs à 1-1-1 : cibles inchangées', () => {
    const g5 = gameWith(5, {}, { rouges: 1, bleus: 1, narcisse: 1 });
    expect(isDecisive(g5.state)).toBe(false);
    expect([targetOf(g5.state, 'rouges'), targetOf(g5.state, 'bleus'), targetOf(g5.state, 'narcisse')]).toEqual([21, 21, 11]);
    const g7 = gameWith(7, {}, { rouges: 1, bleus: 1, narcisse: 1 });
    expect([targetOf(g7.state, 'rouges'), targetOf(g7.state, 'bleus'), targetOf(g7.state, 'narcisse')]).toEqual([21, 21, 7]);
  });
});

describe('7. Bornes et camps en scène', () => {
  it('les scores restent entre 0 et la cible', () => {
    let g = gameWith(5, { rouges: 3, narcisse: 9 });
    g = run(g, { type: 'adjust', camp: 'rouges', delta: -10 });
    expect(g.state.scores.rouges).toBe(0);
    g = run(g, { type: 'adjust', camp: 'rouges', delta: -1 });
    expect(g.history.length).toBe(1); // aucun changement : rien n'est ajouté à l'historique
    g = run(g, { type: 'adjust', camp: 'narcisse', delta: 50 });
    expect(g.state.scores.narcisse).toBe(11);
  });

  it('la Clôture ne plafonne pas l’ajout de points', () => {
    let g = gameWith(5, { rouges: 18, bleus: 2 });
    expect(cloture(g.state)).toBe(3);
    g = run(g, { type: 'adjust', camp: 'bleus', delta: 10 });
    expect(g.state.scores.bleus).toBe(12);
  });

  it('un retrait ne remet pas les camps en scène', () => {
    let g = gameWith(5, { rouges: 10 });
    g = run(g, { type: 'toggleStage', camp: 'narcisse' }, { type: 'adjust', camp: 'rouges', delta: -2 });
    expect(g.state.scores.rouges).toBe(8);
    expect(g.state.onStage.narcisse).toBe(false);
  });

  it('un ajout remet tous les camps en scène', () => {
    let g = gameWith(7);
    g = run(g, { type: 'toggleStage', camp: 'narcisse' }, { type: 'toggleStage', camp: 'bleus' });
    expect(isNegotiationOver(g.state)).toBe(true);
    g = run(g, { type: 'adjust', camp: 'rouges', delta: 1 });
    expect(Object.values(g.state.onStage).every(Boolean)).toBe(true);
  });

  it('le dernier camp en scène ne peut pas sortir ; Négociation terminée', () => {
    let g = gameWith(5);
    g = run(g, { type: 'toggleStage', camp: 'rouges' }, { type: 'toggleStage', camp: 'bleus' });
    expect(isNegotiationOver(g.state)).toBe(true);
    expect(cloture(g.state)).toBeNull();
    expect(canLeaveStage(g.state, 'narcisse')).toBe(false);
    const before = g;
    g = run(g, { type: 'toggleStage', camp: 'narcisse' });
    expect(g).toBe(before);
    expect(g.state.onStage.narcisse).toBe(true);
  });

  it('« Quitte la scène » est une bascule : un second appui fait revenir le camp', () => {
    let g = gameWith(5);
    g = run(g, { type: 'toggleStage', camp: 'bleus' }, { type: 'toggleStage', camp: 'bleus' });
    expect(g.state.onStage.bleus).toBe(true);
  });

  it('pas de sortie de scène à 4 ou 6 joueurs', () => {
    const g = gameWith(4);
    expect(run(g, { type: 'toggleStage', camp: 'rouges' })).toBe(g);
  });

  it('« Nouvelle Prépa » remet tous les camps en scène', () => {
    let g = gameWith(5);
    g = run(g, { type: 'toggleStage', camp: 'rouges' }, { type: 'newPrepa' });
    expect(g.state.onStage.rouges).toBe(true);
    expect(g.history.length).toBe(2);
  });
});

describe('Saisons, Annuler, Corriger, victoire', () => {
  it('atteindre la cible ouvre la confirmation ; Confirmer remet à 0 et en scène', () => {
    let g = gameWith(5, { rouges: 20, bleus: 7, narcisse: 4 });
    g = run(g, { type: 'toggleStage', camp: 'narcisse' }, { type: 'adjust', camp: 'rouges', delta: 1 });
    expect(g.state.pendingSeason).toBe('rouges');
    // Pendant la confirmation, la saisie est bloquée.
    expect(run(g, { type: 'adjust', camp: 'bleus', delta: 1 })).toBe(g);
    g = run(g, { type: 'confirmSeason' });
    expect(g.state.seasons.rouges).toBe(1);
    expect(g.state.scores).toEqual({ rouges: 0, bleus: 0, narcisse: 0 });
    expect(g.state.pendingSeason).toBeNull();
    expect(Object.values(g.state.onStage).every(Boolean)).toBe(true);
  });

  it('8. Annuler après une validation de Saison restaure scores, Saisons et cibles', () => {
    let g = gameWith(4, { rouges: 20, bleus: 14 }, { rouges: 0, bleus: 1 });
    g = run(g, { type: 'adjust', camp: 'rouges', delta: 1 }, { type: 'confirmSeason' });
    expect(isDecisive(g.state)).toBe(true);
    expect(targetOf(g.state, 'rouges')).toBe(31);
    g = run(g, { type: 'undo' });
    expect(g.state.pendingSeason).toBe('rouges');
    expect(g.state.scores).toMatchObject({ rouges: 21, bleus: 14 });
    expect(g.state.seasons).toMatchObject({ rouges: 0, bleus: 1 });
    expect(targetOf(g.state, 'rouges')).toBe(21);
    g = run(g, { type: 'undo' });
    expect(g.state.scores.rouges).toBe(20);
    expect(g.state.pendingSeason).toBeNull();
  });

  it('Annuler restaure aussi les camps en scène', () => {
    let g = gameWith(5, { bleus: 3 });
    g = run(g, { type: 'toggleStage', camp: 'narcisse' }, { type: 'adjust', camp: 'bleus', delta: 4 });
    expect(g.state.onStage.narcisse).toBe(true);
    g = run(g, { type: 'undo' });
    expect(g.state.scores.bleus).toBe(3);
    expect(g.state.onStage.narcisse).toBe(false);
  });

  it('9. Corriger annule le dernier ajout sans attribuer la Saison', () => {
    let g = gameWith(7, { narcisse: 2 });
    g = run(g, { type: 'adjust', camp: 'narcisse', delta: 9 });
    expect(g.state.scores.narcisse).toBe(7);
    expect(g.state.pendingSeason).toBe('narcisse');
    g = run(g, { type: 'correct' });
    expect(g.state.scores.narcisse).toBe(2);
    expect(g.state.seasons.narcisse).toBe(0);
    expect(g.state.pendingSeason).toBeNull();
  });

  it('Corriger sans confirmation en cours ne fait rien', () => {
    const g = run(gameWith(4), { type: 'adjust', camp: 'rouges', delta: 3 });
    expect(run(g, { type: 'correct' })).toBe(g);
  });

  it('10. Deux Saisons gagnées déclenchent la victoire', () => {
    let g = gameWith(6, { bleus: 30 }, { rouges: 1, bleus: 1 });
    g = run(g, { type: 'adjust', camp: 'bleus', delta: 1 });
    expect(g.state.pendingSeason).toBe('bleus');
    g = run(g, { type: 'confirmSeason' });
    expect(g.state.winner).toBe('bleus');
    expect(g.state.seasons.bleus).toBe(2);
    expect(run(g, { type: 'adjust', camp: 'rouges', delta: 1 })).toBe(g);
    // « Annuler » depuis l'écran de victoire
    g = run(g, { type: 'undo' });
    expect(g.state.winner).toBeNull();
    expect(g.state.pendingSeason).toBe('bleus');
  });

  it('Annuler sans historique ne fait rien', () => {
    const g = gameWith(4);
    expect(canUndo(g)).toBe(false);
    expect(run(g, { type: 'undo' })).toBe(g);
  });
});
