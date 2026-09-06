// related files:
// - web/frontend/src/features/remoteSupport/useRemoteSupportPeer.ts

export type RemotePointerEvent = {
  t: "pointer";
  kind: "move" | "down" | "up" | "click";
  /** 0..1 relative to viewport */
  x: number;
  y: number;
  button?: number;
};

export type RemoteKeyEvent = {
  t: "key";
  kind: "down" | "up";
  key: string;
  code: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

export type RemoteControlEvent = RemotePointerEvent | RemoteKeyEvent;

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function replayRemoteInput(evt: RemoteControlEvent) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  if (evt.t === "pointer") {
    const x = clamp01(evt.x) * window.innerWidth;
    const y = clamp01(evt.y) * window.innerHeight;
    const target =
      (document.elementFromPoint(x, y) as HTMLElement | null) ||
      (document.body as HTMLElement);

    const common: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: evt.button ?? 0,
      buttons: evt.kind === "down" ? 1 : 0,
    };

    if (evt.kind === "move") {
      target.dispatchEvent(new MouseEvent("mousemove", common));
      return;
    }
    if (evt.kind === "down") {
      target.dispatchEvent(new MouseEvent("mousedown", common));
      try {
        target.focus?.();
      } catch {
        // ignore
      }
      return;
    }
    if (evt.kind === "up") {
      target.dispatchEvent(new MouseEvent("mouseup", common));
      return;
    }
    if (evt.kind === "click") {
      target.dispatchEvent(new MouseEvent("mousedown", common));
      target.dispatchEvent(new MouseEvent("mouseup", common));
      target.dispatchEvent(new MouseEvent("click", common));
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        target.isContentEditable
      ) {
        try {
          target.focus();
        } catch {
          // ignore
        }
      }
    }
    return;
  }

  if (evt.t === "key") {
    const active = (document.activeElement as HTMLElement | null) || document.body;
    const init: KeyboardEventInit = {
      bubbles: true,
      cancelable: true,
      key: evt.key,
      code: evt.code,
      ctrlKey: Boolean(evt.ctrlKey),
      altKey: Boolean(evt.altKey),
      shiftKey: Boolean(evt.shiftKey),
      metaKey: Boolean(evt.metaKey),
    };
    const type = evt.kind === "down" ? "keydown" : "keyup";
    active.dispatchEvent(new KeyboardEvent(type, init));

    if (
      evt.kind === "down" &&
      evt.key.length === 1 &&
      !evt.ctrlKey &&
      !evt.metaKey &&
      !evt.altKey
    ) {
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ) {
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? active.value.length;
        const next =
          active.value.slice(0, start) + evt.key + active.value.slice(end);
        const proto = Object.getOwnPropertyDescriptor(
          active instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          "value",
        );
        proto?.set?.call(active, next);
        active.setSelectionRange(start + 1, start + 1);
        active.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }
}
