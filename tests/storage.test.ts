import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, loadSaved, parseSaved, save, type Saved } from '../src/game/storage';
import { gameWith, run } from './helpers';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('sauvegarde', () => {
  it('aller-retour, y compris pendant la confirmation d’une Saison', () => {
    const game = run(gameWith(5, { narcisse: 10 }), { type: 'adjust', camp: 'narcisse', delta: 1 });
    expect(game.state.pendingSeason).toBe('narcisse');
    const store = memoryStorage();
    const saved: Saved = { version: 1, screen: 'game', game };
    expect(save(saved, store)).toBe(true);
    expect(loadSaved(store)).toEqual(saved);
  });

  it('rejette les données absentes, corrompues ou d’une autre version', () => {
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved('{pas du json')).toBeNull();
    const game = gameWith(4);
    expect(parseSaved(JSON.stringify({ version: 99, screen: 'game', game }))).toBeNull();
  });

  it('rejette un état incohérent', () => {
    const bad = (mut: (s: any) => void) => {
      const game: any = structuredClone(gameWith(4));
      mut(game.state);
      return parseSaved(JSON.stringify({ version: 1, screen: 'game', game }));
    };
    expect(bad((s) => (s.scores.rouges = 22))).toBeNull();
    expect(bad((s) => (s.scores.rouges = -1))).toBeNull();
    expect(bad((s) => (s.players = 8))).toBeNull();
    expect(bad((s) => (s.camps = ['rouges']))).toBeNull();
    expect(bad((s) => (s.pendingSeason = 'bleus'))).toBeNull();
    expect(bad((s) => (s.seasons.rouges = 2))).toBeNull(); // 2 Saisons sans vainqueur
    expect(bad((s) => (s.onStage = { rouges: false, bleus: false, narcisse: false }))).toBeNull();
    expect(bad(() => {})).not.toBeNull();
  });

  it('un historique invalide est vidé sans perdre la partie', () => {
    const game: any = run(gameWith(4), { type: 'adjust', camp: 'rouges', delta: 2 });
    game.history.push({ n: 'importe quoi' });
    const loaded = parseSaved(JSON.stringify({ version: 1, screen: 'game', game }));
    expect(loaded?.game.state.scores.rouges).toBe(2);
    expect(loaded?.game.history).toEqual([]);
  });

  it('stockage indisponible ou en erreur : pas d’exception', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadSaved(throwing)).toBeNull();
    expect(save({ version: 1, screen: 'game', game: gameWith(4) }, throwing)).toBe(false);
    expect(STORAGE_KEY).toBe('lunatic.compteur');
  });
});
