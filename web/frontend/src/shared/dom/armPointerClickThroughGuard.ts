/**
 * Gesture-scoped click-through guard (no fixed ms).
 *
 * When a dialog opens/closes, leftover pointerup/click from the same gesture can
 * hit UI underneath (speed varies by PC — timers are the wrong tool).
 *
 * While armed:
 * - capture-phase pointerup / mouseup / click / auxclick are swallowed
 * - the next pointerdown clears the guard without swallowing, so the new
 *   intentional gesture reaches its target
 *
 * While a Radix dialog is open, its overlay already keeps events on the modal;
 * outside-click dismiss should arm this *before* unmount so that dismiss
 * gesture cannot fall through onto the page.
 */
let activeCleanup: (() => void) | null = null;

const RESIDUE_EVENTS = [
  "click",
  "auxclick",
  "pointerup",
  "mouseup",
  "pointercancel",
] as const;

export function armPointerClickThroughGuard(): () => void {
  if (typeof window === "undefined") return () => {};

  activeCleanup?.();
  activeCleanup = null;

  let cleaned = false;

  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    for (const type of RESIDUE_EVENTS) {
      window.removeEventListener(type, onResidue, true);
    }
    window.removeEventListener("pointerdown", onNewPointerDown, true);
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  const onResidue = (event: Event) => {
    swallow(event);
  };

  const onNewPointerDown = () => {
    // New intentional press — stop guarding; do not swallow this event.
    cleanup();
  };

  for (const type of RESIDUE_EVENTS) {
    window.addEventListener(type, onResidue, true);
  }
  window.addEventListener("pointerdown", onNewPointerDown, true);

  activeCleanup = cleanup;
  return cleanup;
}
