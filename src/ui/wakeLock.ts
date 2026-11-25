// Maintien de l'écran allumé (Screen Wake Lock API), si disponible.
// Nécessite un contexte sécurisé (HTTPS ou localhost).

let wanted = false;
let sentinel: WakeLockSentinel | null = null;

async function acquire(): Promise<void> {
  if (!wanted || sentinel || document.visibilityState !== 'visible') return;
  if (!('wakeLock' in navigator)) return;
  try {
    const s = await navigator.wakeLock.request('screen');
    if (!wanted) {
      void s.release();
      return;
    }
    sentinel = s;
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null;
    });
  } catch {
    /* refusé (batterie faible, contexte non sécurisé…) : sans conséquence */
  }
}

document.addEventListener('visibilitychange', () => {
  // Le verrou est relâché automatiquement quand l'onglet est masqué : on le redemande au retour.
  if (document.visibilityState === 'visible') void acquire();
});

export function setKeepAwake(on: boolean): void {
  wanted = on;
  if (on) {
    void acquire();
  } else if (sentinel) {
    const s = sentinel;
    sentinel = null;
    void s.release().catch(() => {});
  }
}
