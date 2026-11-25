// Calcul pur du delta d'un swipe vertical (testable sans navigateur).

/** Zone morte avant le premier cran, en pixels CSS. */
export const DEAD_ZONE_PX = 12;
/** Bornes du pas (pixels par point). */
export const STEP_MIN_PX = 10;
export const STEP_MAX_PX = 18;
/** Part de la hauteur du viewport nécessaire pour atteindre l'amplitude maximale. */
export const REACH_FRACTION = 0.5;

export interface SwipeParams {
  /** Points ajoutables au maximum (cible − score). */
  maxUp: number;
  /** Points retirables au maximum (score). */
  maxDown: number;
  /** Pas vers le haut, ou null si aucun ajout possible. */
  stepUp: number | null;
  /** Pas vers le bas, ou null si aucun retrait possible. */
  stepDown: number | null;
}

/** pas = clamp((0,5 × hauteur du viewport − 12) / amplitude, 10, 18) ; null si amplitude nulle. */
export function stepFor(viewportHeight: number, amplitude: number): number | null {
  if (amplitude <= 0) return null;
  const raw = (REACH_FRACTION * viewportHeight - DEAD_ZONE_PX) / amplitude;
  return Math.min(STEP_MAX_PX, Math.max(STEP_MIN_PX, raw));
}

/** Paramètres figés au début du geste. */
export function swipeParams(viewportHeight: number, score: number, target: number): SwipeParams {
  const maxUp = Math.max(0, target - score);
  const maxDown = Math.max(0, score);
  return {
    maxUp,
    maxDown,
    stepUp: stepFor(viewportHeight, maxUp),
    stepDown: stepFor(viewportHeight, maxDown),
  };
}

/**
 * Delta pour un déplacement vertical `dy` mesuré depuis le point de départ
 * (positif vers le haut). Borné entre −score et cible − score.
 */
export function deltaFor(dy: number, p: SwipeParams): number {
  const distance = Math.abs(dy);
  if (distance <= DEAD_ZONE_PX) return 0;
  if (dy > 0) {
    if (p.stepUp === null) return 0;
    return Math.min(p.maxUp, steps(distance, p.stepUp));
  }
  if (p.stepDown === null) return 0;
  const n = Math.min(p.maxDown, steps(distance, p.stepDown));
  return n === 0 ? 0 : -n;
}

/** Nombre de crans franchis (petite tolérance pour les arrondis flottants). */
function steps(distance: number, step: number): number {
  return Math.floor((distance - DEAD_ZONE_PX) / step + 1e-9);
}
