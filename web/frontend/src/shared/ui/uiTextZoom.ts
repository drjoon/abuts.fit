/**
 * 앱 전체 글꼴 확대율(Cursor처럼 Alt+− / Alt+= / Alt+0).
 *
 * html 인라인 `--ui-text-zoom` 한 곳만 바꾼다. 루트 font-size·`--ui-scale`이 이 값을 곱하므로
 * rem 크기와 임의 px 글자(index.css)가 같이 커진다.
 * 화면별 확대율(AI 디자인)이 열려 있으면 그 화면이 값을 잠시 덮고, 닫힐 때 `applyStoredUiTextZoom()`으로 되돌린다.
 *
 * SSOT: `src/index.css` 루트 스케일, `web/frontend/rules.md`
 */

export const UI_TEXT_ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75] as const;
export const UI_TEXT_ZOOM_DEFAULT = 1;
const UI_TEXT_ZOOM_PREF_KEY = "abuts.uiTextZoom";

export type UiTextZoomShortcut = "in" | "out" | "reset";

/** 입력 중에는 Alt+키가 문자 입력(Mac 대시 –, Windows Alt+숫자패드 코드)이라 가로채지 않는다. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "reset", "submit", "file", "color"].includes(
      target.type,
    );
  }
  return false;
}

/** Mac은 Alt+키가 특수문자를 내므로 `key` 대신 물리 키(`code`)로 판별한다. */
export function resolveUiTextZoomShortcut(e: KeyboardEvent): UiTextZoomShortcut | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  if (isEditableTarget(e.target)) return null;
  switch (e.code) {
    case "Equal":
    case "NumpadAdd":
      return "in";
    case "Minus":
    case "NumpadSubtract":
      return "out";
    case "Digit0":
    case "Numpad0":
      return "reset";
    default:
      return null;
  }
}

/** 현재 값에서 가장 가까운 단계 기준으로 한 칸 이동. 끝 단계면 그대로. */
export function stepZoom(
  steps: readonly number[],
  current: number,
  shortcut: UiTextZoomShortcut,
  resetTo: number,
): number {
  if (shortcut === "reset") return resetTo;
  let index = 0;
  steps.forEach((step, i) => {
    if (Math.abs(step - current) < Math.abs(steps[index] - current)) index = i;
  });
  const next = shortcut === "in" ? index + 1 : index - 1;
  return steps[Math.min(steps.length - 1, Math.max(0, next))];
}

export function readStoredUiTextZoom(): number {
  try {
    const value = Number(window.localStorage.getItem(UI_TEXT_ZOOM_PREF_KEY));
    return (UI_TEXT_ZOOM_STEPS as readonly number[]).includes(value)
      ? value
      : UI_TEXT_ZOOM_DEFAULT;
  } catch {
    return UI_TEXT_ZOOM_DEFAULT;
  }
}

export function applyUiTextZoom(zoom: number) {
  const root = document.documentElement;
  if (zoom === UI_TEXT_ZOOM_DEFAULT) root.style.removeProperty("--ui-text-zoom");
  else root.style.setProperty("--ui-text-zoom", String(zoom));
}

export function applyStoredUiTextZoom() {
  applyUiTextZoom(readStoredUiTextZoom());
}

export function storeUiTextZoom(zoom: number) {
  try {
    if (zoom === UI_TEXT_ZOOM_DEFAULT) window.localStorage.removeItem(UI_TEXT_ZOOM_PREF_KEY);
    else window.localStorage.setItem(UI_TEXT_ZOOM_PREF_KEY, String(zoom));
  } catch {
    /* 저장 실패 시 이 탭에서만 유지한다. */
  }
}

export const UI_TEXT_ZOOM_CHANGE_EVENT = "abuts:ui-text-zoom";

/** 단축키로 바뀐 확대율을 표시기에 알린다(전역·화면별 공통). */
export function announceUiTextZoom(zoom: number) {
  window.dispatchEvent(
    new CustomEvent<number>(UI_TEXT_ZOOM_CHANGE_EVENT, { detail: zoom }),
  );
}
