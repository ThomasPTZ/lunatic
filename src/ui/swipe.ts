// Gestion du swipe vertical avec les Pointer Events.
import { deltaFor, swipeParams, type SwipeParams } from './swipeMath';

export interface SwipeHandlers {
  /** Score et cible au début du geste, ou null si la saisie est bloquée. */
  bounds(): { score: number; target: number } | null;
  /** Appelé à chaque changement de delta pendant le geste. */
  onPreview(delta: number, clientY: number): void;
  /** Geste terminé normalement (delta éventuellement nul). */
  onCommit(delta: number): void;
  /** Geste interrompu (pointercancel, perte de capture). */
  onCancel(): void;
}

interface Gesture {
  el: HTMLElement;
  pointerId: number;
  startY: number;
  params: SwipeParams;
  delta: number;
  handlers: SwipeHandlers;
}

/** Un seul geste à la fois sur tout l'écran : un second doigt est ignoré. */
let active: Gesture | null = null;

export function isSwipeActive(): boolean {
  return active !== null;
}

function vibrate(): void {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* non disponible (iOS Safari, ordinateur) : sans conséquence */
  }
}

export function attachSwipe(el: HTMLElement, handlers: SwipeHandlers): void {
  el.addEventListener('pointerdown', (e) => {
    if (active) return; // second doigt pendant un geste
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest('button')) return; // geste commencé sur un bouton
    const b = handlers.bounds();
    if (!b) return;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    active = {
      el,
      pointerId: e.pointerId,
      startY: e.clientY,
      params: swipeParams(viewportHeight, b.score, b.target),
      delta: 0,
      handlers,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture impossible : le geste fonctionne tant que le doigt reste sur la colonne */
    }
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    const g = active;
    if (!g || g.el !== el || e.pointerId !== g.pointerId) return;
    e.preventDefault();
    const delta = deltaFor(g.startY - e.clientY, g.params);
    if (delta !== g.delta) {
      g.delta = delta;
      vibrate();
    }
    // Aperçu à chaque mouvement : sa position suit le doigt.
    if (delta !== 0 || Math.abs(g.startY - e.clientY) > 0) g.handlers.onPreview(delta, e.clientY);
  });

  const finish = (e: PointerEvent, commit: boolean) => {
    const g = active;
    if (!g || g.el !== el || e.pointerId !== g.pointerId) return;
    active = null;
    try {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignoré */
    }
    if (commit) g.handlers.onCommit(g.delta);
    else g.handlers.onCancel();
  };

  el.addEventListener('pointerup', (e) => finish(e, true));
  el.addEventListener('pointercancel', (e) => finish(e, false));
  el.addEventListener('lostpointercapture', (e) => finish(e, false));
  // Pas de menu contextuel sur appui long pendant un geste.
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
