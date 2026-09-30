// 기공소 AI 디자인 — 단축키·마우스 조작 프로필. 어벗츠 기본, exocad·3Shape 프리셋, 직접 설정.
// 이 브라우저 localStorage에 둔다(자동 저장·확대율과 같다).
// related files:
// - web/frontend/src/shared/three/screenSpaceOrbitControls.ts
// - web/frontend/src/shared/components/practice/LabDesignControlsDialog.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

import { useSyncExternalStore } from "react";

import {
  DEFAULT_ORBIT_MOUSE,
  type OrbitGesture,
  type OrbitModifier,
  type OrbitMouseAction,
  type OrbitMouseBindings,
  type OrbitMouseButton,
} from "@/shared/three/screenSpaceOrbitControls";

export type DesignKeyAction =
  | "undo"
  | "redo"
  | "viewFit"
  | "viewHome"
  | "viewOcclusal"
  | "viewBuccal"
  | "viewLingual"
  | "toggleScanColor"
  | "toggleMargin"
  | "toggleGrid"
  | "toggleColorMap"
  | "toggleInsertion"
  | "toggleUndercut"
  | "sculptAdd"
  | "sculptRemove"
  | "sculptSmooth"
  | "sculptFlatten"
  | "sculptInflate";

/** `code`는 자판 위치다. 한글 입력 중에도 같은 키로 잡힌다. `ctrl`은 Mac ⌘도 받는다. */
export type KeyBinding = { code: string; ctrl: boolean; shift: boolean; alt: boolean };

export type DesignKeyBindings = Record<DesignKeyAction, KeyBinding | null>;

export type DesignControls = { keys: DesignKeyBindings; mouse: OrbitMouseBindings };

export type DesignControlPresetId = "abuts" | "exocad" | "3shape";
export type DesignControlProfileId = DesignControlPresetId | "custom";

export type DesignControlPrefs = {
  profile: DesignControlProfileId;
  /** 직접 설정. 고친 적이 없으면 null. */
  custom: DesignControls | null;
};

export const DESIGN_KEY_GROUPS: Array<{
  label: string;
  rows: Array<{ id: DesignKeyAction; label: string }>;
}> = [
  {
    label: "기본",
    rows: [
      { id: "undo", label: "실행 취소" },
      { id: "redo", label: "다시 실행" },
    ],
  },
  {
    label: "보기",
    rows: [
      { id: "viewFit", label: "화면에 맞추기" },
      { id: "viewHome", label: "처음 보기" },
      { id: "viewOcclusal", label: "교합면 보기" },
      { id: "viewBuccal", label: "협측 보기" },
      { id: "viewLingual", label: "설측 보기" },
      { id: "toggleScanColor", label: "스캔색 켜기·끄기" },
      { id: "toggleMargin", label: "마진 켜기·끄기" },
      { id: "toggleGrid", label: "중앙선·모눈" },
      { id: "toggleColorMap", label: "칼라맵 켜기·끄기" },
      { id: "toggleInsertion", label: "삽입축 표시" },
      { id: "toggleUndercut", label: "언더컷 켜기·끄기" },
    ],
  },
  {
    label: "스컬프트 브러시",
    rows: [
      { id: "sculptAdd", label: "더하기" },
      { id: "sculptRemove", label: "빼기" },
      { id: "sculptSmooth", label: "매끈" },
      { id: "sculptFlatten", label: "평탄" },
      { id: "sculptInflate", label: "부풀리기" },
    ],
  },
];

export const ORBIT_MOUSE_ROWS: Array<{ id: OrbitMouseAction; label: string; hint: string }> = [
  { id: "rotate", label: "회전", hint: "누른 채 끕니다." },
  { id: "pan", label: "이동", hint: "누른 채 끕니다." },
  { id: "zoom", label: "확대·축소", hint: "누른 채 위아래로 끕니다. 휠은 항상 확대·축소입니다." },
  { id: "pivot", label: "회전 중심", hint: "누른 자리를 화면 가운데·회전 중심으로 둡니다." },
];

export const ORBIT_BUTTON_OPTIONS: Array<{ id: OrbitMouseButton; label: string }> = [
  { id: "left", label: "왼쪽" },
  { id: "right", label: "오른쪽" },
  { id: "middle", label: "휠 버튼" },
  { id: "left+right", label: "왼쪽+오른쪽" },
];

export const ORBIT_MODIFIER_OPTIONS: Array<{ id: OrbitModifier; label: string }> = [
  { id: "none", label: "수식키 없음" },
  { id: "shift", label: "Shift" },
  { id: "ctrl", label: "Ctrl" },
  { id: "alt", label: "Alt" },
];

/** 한 동작에 걸 수 있는 마우스 조합 수. */
export const ORBIT_GESTURE_MAX = 3;

const key = (code: string, mods: Partial<Omit<KeyBinding, "code">> = {}): KeyBinding => ({
  code,
  ctrl: mods.ctrl ?? false,
  shift: mods.shift ?? false,
  alt: mods.alt ?? false,
});

const ABUTS_KEYS: DesignKeyBindings = {
  undo: key("KeyZ", { ctrl: true }),
  redo: key("KeyY", { ctrl: true }),
  viewFit: key("KeyZ"),
  viewHome: key("KeyH"),
  viewOcclusal: key("KeyO"),
  viewBuccal: key("KeyB"),
  viewLingual: key("KeyL"),
  toggleScanColor: key("KeyT"),
  toggleMargin: key("KeyM"),
  toggleGrid: key("KeyG"),
  toggleColorMap: key("KeyC"),
  toggleInsertion: key("KeyI"),
  toggleUndercut: key("KeyU"),
  sculptAdd: key("KeyA"),
  sculptRemove: key("KeyR"),
  sculptSmooth: key("KeyS"),
  sculptFlatten: key("KeyF"),
  sculptInflate: null,
};

export const DESIGN_CONTROL_PRESETS: Record<
  DesignControlPresetId,
  { label: string; hint: string; controls: DesignControls }
> = {
  abuts: {
    label: "어벗츠",
    hint: "왼쪽 드래그 회전, 오른쪽·휠 버튼·Shift+왼쪽 드래그 이동.",
    controls: { keys: ABUTS_KEYS, mouse: DEFAULT_ORBIT_MOUSE },
  },
  exocad: {
    label: "exocad",
    hint: "오른쪽 드래그 회전, 왼쪽+오른쪽 드래그 이동, 휠 버튼 클릭 회전 중심. 숫자 패드 보기.",
    controls: {
      keys: {
        ...ABUTS_KEYS,
        viewFit: key("Numpad5"),
        viewOcclusal: key("Numpad8"),
        viewBuccal: key("Numpad1"),
        viewLingual: key("Numpad3"),
      },
      mouse: {
        rotate: [{ button: "right", mod: "none" }],
        pan: [{ button: "left+right", mod: "none" }],
        zoom: [],
        pivot: [{ button: "middle", mod: "none" }],
        invertWheel: false,
      },
    },
  },
  "3shape": {
    label: "3Shape",
    hint: "오른쪽 드래그 회전, Alt+오른쪽·휠 버튼 드래그 이동, Shift+오른쪽 드래그 확대·축소.",
    controls: {
      keys: ABUTS_KEYS,
      mouse: {
        rotate: [{ button: "right", mod: "none" }],
        pan: [
          { button: "right", mod: "alt" },
          { button: "middle", mod: "none" },
        ],
        zoom: [{ button: "right", mod: "shift" }],
        pivot: [],
        invertWheel: false,
      },
    },
  },
};

export const DESIGN_CONTROL_PRESET_IDS: DesignControlPresetId[] = ["abuts", "exocad", "3shape"];

export const DEFAULT_DESIGN_CONTROL_PREFS: DesignControlPrefs = { profile: "abuts", custom: null };

const PREFS_KEY = "abuts.labProsthesis.controls";

export function cloneDesignControls(controls: DesignControls): DesignControls {
  return {
    keys: { ...controls.keys },
    mouse: {
      rotate: controls.mouse.rotate.map((row) => ({ ...row })),
      pan: controls.mouse.pan.map((row) => ({ ...row })),
      zoom: controls.mouse.zoom.map((row) => ({ ...row })),
      pivot: controls.mouse.pivot.map((row) => ({ ...row })),
      invertWheel: controls.mouse.invertWheel,
    },
  };
}

export function resolveDesignControls(prefs: DesignControlPrefs): DesignControls {
  if (prefs.profile === "custom" && prefs.custom) return prefs.custom;
  const preset = prefs.profile === "custom" ? "abuts" : prefs.profile;
  return DESIGN_CONTROL_PRESETS[preset].controls;
}

const BUTTONS = new Set(ORBIT_BUTTON_OPTIONS.map((row) => row.id));
const MODS = new Set(ORBIT_MODIFIER_OPTIONS.map((row) => row.id));

function parseGestures(value: unknown): OrbitGesture[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (row): row is OrbitGesture =>
        row != null &&
        BUTTONS.has((row as OrbitGesture).button) &&
        MODS.has((row as OrbitGesture).mod),
    )
    .slice(0, ORBIT_GESTURE_MAX)
    .map((row) => ({ button: row.button, mod: row.mod }));
}

function parseKey(value: unknown): KeyBinding | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<KeyBinding>;
  if (typeof row.code !== "string" || !row.code) return null;
  return key(row.code, { ctrl: row.ctrl === true, shift: row.shift === true, alt: row.alt === true });
}

function parseControls(value: unknown): DesignControls | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { keys?: Record<string, unknown>; mouse?: Record<string, unknown> };
  const keys = { ...ABUTS_KEYS };
  for (const id of Object.keys(ABUTS_KEYS) as DesignKeyAction[]) {
    if (raw.keys && id in raw.keys) keys[id] = parseKey(raw.keys[id]);
  }
  const mouse = raw.mouse ?? {};
  return {
    keys,
    mouse: {
      rotate: parseGestures(mouse.rotate),
      pan: parseGestures(mouse.pan),
      zoom: parseGestures(mouse.zoom),
      pivot: parseGestures(mouse.pivot),
      invertWheel: mouse.invertWheel === true,
    },
  };
}

function readPrefs(): DesignControlPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object") return DEFAULT_DESIGN_CONTROL_PREFS;
    const custom = parseControls(raw.custom);
    const profile: DesignControlProfileId =
      raw.profile === "custom" && custom
        ? "custom"
        : DESIGN_CONTROL_PRESET_IDS.includes(raw.profile)
          ? raw.profile
          : "abuts";
    return { profile, custom };
  } catch {
    return DEFAULT_DESIGN_CONTROL_PREFS;
  }
}

let prefs: DesignControlPrefs | null = null;
let active: DesignControls | null = null;
const listeners = new Set<() => void>();

export function getDesignControlPrefs(): DesignControlPrefs {
  if (!prefs) prefs = typeof window === "undefined" ? DEFAULT_DESIGN_CONTROL_PREFS : readPrefs();
  return prefs;
}

/** 지금 쓰는 조작. 뷰어가 누를 때마다 읽는다. */
export function getDesignControls(): DesignControls {
  if (!active) active = resolveDesignControls(getDesignControlPrefs());
  return active;
}

export const getDesignOrbitMouse = () => getDesignControls().mouse;

export function setDesignControlPrefs(next: DesignControlPrefs) {
  prefs = next;
  active = resolveDesignControls(next);
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* 조작 설정은 이 탭에서만 유지한다. */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDesignControlPrefs() {
  return useSyncExternalStore(subscribe, getDesignControlPrefs, getDesignControlPrefs);
}

export function keyBindingFromEvent(event: KeyboardEvent): KeyBinding {
  return key(event.code, {
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  });
}

export function sameKeyBinding(a: KeyBinding | null, b: KeyBinding | null) {
  return (
    a != null &&
    b != null &&
    a.code === b.code &&
    a.ctrl === b.ctrl &&
    a.shift === b.shift &&
    a.alt === b.alt
  );
}

/** 이 키 입력에 걸린 동작. 다시 실행은 Ctrl+Shift+Z도 받는다. */
export function matchDesignKey(
  keys: DesignKeyBindings,
  event: KeyboardEvent,
): DesignKeyAction | null {
  const pressed = keyBindingFromEvent(event);
  for (const id of Object.keys(keys) as DesignKeyAction[]) {
    if (sameKeyBinding(keys[id], pressed)) return id;
  }
  if (sameKeyBinding(pressed, key("KeyZ", { ctrl: true, shift: true }))) return "redo";
  return null;
}

/** 단축키로 쓰지 않는 키. 수식키만 누른 것도 뺀다. */
export function isBindableKeyCode(code: string) {
  return (
    Boolean(code) &&
    !/^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(code) &&
    !["Escape", "Tab", "CapsLock", "ContextMenu", "Backspace", "Delete"].includes(code)
  );
}

const ARROWS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

export function keyCodeLabel(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return ARROWS[code] ?? code;
}

export function keyBindingParts(binding: KeyBinding): string[] {
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.shift) parts.push("Shift");
  if (binding.alt) parts.push("Alt");
  parts.push(keyCodeLabel(binding.code));
  return parts;
}

export function orbitGestureLabel(gesture: OrbitGesture) {
  const button = ORBIT_BUTTON_OPTIONS.find((row) => row.id === gesture.button)?.label ?? "";
  const mod = gesture.mod === "none" ? "" : `${ORBIT_MODIFIER_OPTIONS.find((row) => row.id === gesture.mod)?.label} + `;
  return `${mod}${button}`;
}
