import { describe, expect, it } from 'vitest';
import { DEAD_ZONE_PX, deltaFor, stepFor, swipeParams } from '../src/ui/swipeMath';

describe('pas adaptatif', () => {
  it('pas = clamp((0,5 × hauteur − 12) / amplitude, 10, 18)', () => {
    expect(stepFor(640, 21)).toBeCloseTo((320 - 12) / 21); // ≈ 14,67
    expect(stepFor(640, 31)).toBe(10); // 9,94 → plancher 10
    expect(stepFor(640, 7)).toBe(18); // 44 → plafond 18
    expect(stepFor(844, 21)).toBe(18); // 19,5 → plafond 18
    expect(stepFor(844, 31)).toBeCloseTo((422 - 12) / 31); // ≈ 13,2
  });

  it('amplitude nulle : pas de pas, delta toujours 0', () => {
    expect(stepFor(640, 0)).toBeNull();
    const p = swipeParams(640, 0, 21); // score 0 : rien à retirer
    expect(p.stepDown).toBeNull();
    expect(deltaFor(-300, p)).toBe(0);
    const full = swipeParams(640, 11, 11); // cible atteinte : rien à ajouter
    expect(deltaFor(300, full)).toBe(0);
  });

  it('le pas ne dépend que de la hauteur et de l’amplitude, pas du point de départ', () => {
    const a = swipeParams(640, 5, 21);
    const b = swipeParams(640, 5, 21);
    expect(a).toEqual(b);
  });
});

describe('delta', () => {
  const p = swipeParams(640, 6, 21); // haut : 15 pts ; bas : 6 pts

  it('zone morte de 12 px', () => {
    expect(deltaFor(0, p)).toBe(0);
    expect(deltaFor(DEAD_ZONE_PX, p)).toBe(0);
    expect(deltaFor(-DEAD_ZONE_PX, p)).toBe(0);
  });

  it('croît d’un point par pas', () => {
    expect(p.stepUp).toBe(18);
    expect(deltaFor(12 + 17, p)).toBe(0);
    expect(deltaFor(12 + 18, p)).toBe(1);
    expect(deltaFor(12 + 18 * 7, p)).toBe(7);
  });

  it('borné à cible − score vers le haut, à −score vers le bas', () => {
    expect(deltaFor(10_000, p)).toBe(15);
    expect(deltaFor(-10_000, p)).toBe(-6);
  });

  it('le maximum est atteint à mi-hauteur du viewport (amplitude 21 et 31)', () => {
    const p21 = swipeParams(640, 0, 21);
    expect(deltaFor(320, p21)).toBe(21);
    expect(deltaFor(319, p21)).toBe(20);
    const p31 = swipeParams(640, 0, 31); // pas plancher 10 : 12 + 31 × 10 = 322 px
    expect(deltaFor(322, p31)).toBe(31);
    expect(deltaFor(321, p31)).toBe(30);
    const down31 = swipeParams(640, 31, 31);
    expect(deltaFor(-322, down31)).toBe(-31);
  });

  it('changement de sens : chaque sens a son propre pas, mesuré depuis le départ', () => {
    const q = swipeParams(640, 20, 21); // haut : 1 pt (pas 18) ; bas : 20 pts (pas 15,4)
    expect(q.stepUp).toBe(18);
    expect(q.stepDown).toBeCloseTo(15.4);
    expect(deltaFor(12 + 18, q)).toBe(1); // monte
    expect(deltaFor(5, q)).toBe(0); // revient près du départ : annulé
    expect(deltaFor(-(12 + 15.4 * 3), q)).toBe(-3); // redescend sous le départ
  });

  it('revenir au point de départ donne 0', () => {
    expect(deltaFor(3, p)).toBe(0);
  });
});
