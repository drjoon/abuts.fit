// 기공소 AI 디자인 — 단축키·마우스 조작 설정. 어벗츠(기본)·exocad·3Shape 프리셋과 직접 설정.
// 프리셋을 고친 순간 그 프리셋을 복사한 직접 설정이 된다.
// related files:
// - web/frontend/src/shared/practice/labDesignControls.ts
// - web/frontend/src/shared/three/screenSpaceOrbitControls.ts

import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  cloneDesignControls,
  DESIGN_CONTROL_PRESET_IDS,
  DESIGN_CONTROL_PRESETS,
  DESIGN_KEY_GROUPS,
  isBindableKeyCode,
  keyBindingFromEvent,
  keyBindingParts,
  ORBIT_BUTTON_OPTIONS,
  ORBIT_GESTURE_MAX,
  ORBIT_MODIFIER_OPTIONS,
  ORBIT_MOUSE_ROWS,
  resolveDesignControls,
  sameKeyBinding,
  setDesignControlPrefs,
  useDesignControlPrefs,
  type DesignControlPrefs,
  type DesignControlProfileId,
  type DesignControls,
  type DesignKeyAction,
  type KeyBinding,
} from "@/shared/practice/labDesignControls";
import type {
  OrbitGesture,
  OrbitModifier,
  OrbitMouseAction,
  OrbitMouseButton,
} from "@/shared/three/screenSpaceOrbitControls";
import { cn } from "@/shared/ui/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Tab = "keys" | "mouse";

const DRAG_ACTIONS: OrbitMouseAction[] = ["rotate", "pan", "zoom"];

const KEY_LABEL = new Map(
  DESIGN_KEY_GROUPS.flatMap((group) => group.rows.map((row) => [row.id, row.label] as const)),
);
const MOUSE_LABEL = new Map(ORBIT_MOUSE_ROWS.map((row) => [row.id, row.label] as const));

const sameGesture = (a: OrbitGesture, b: OrbitGesture) =>
  a.button === b.button && a.mod === b.mod;

const selectClass =
  "h-7 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function KeyCaps({ binding }: { binding: KeyBinding }) {
  return (
    <span className="flex items-center gap-1">
      {keyBindingParts(binding).map((part, index) => (
        <span key={`${part}-${index}`} className="flex items-center gap-1">
          {index > 0 ? <span className="text-muted-foreground">+</span> : null}
          <kbd className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-sans text-[11px] font-medium text-foreground">
            {part}
          </kbd>
        </span>
      ))}
    </span>
  );
}

export function LabDesignControlsDialog({ open, onOpenChange }: Props) {
  const saved = useDesignControlPrefs();
  const [draft, setDraft] = useState<DesignControlPrefs>(saved);
  const [tab, setTab] = useState<Tab>("keys");
  const [recording, setRecording] = useState<DesignKeyAction | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(saved);
    setRecording(null);
    setNotice("");
    // 열 때만 저장값을 가져온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const controls = resolveDesignControls(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  /** 프리셋을 고치면 그 프리셋을 복사한 직접 설정으로 바꾼다. */
  const editControls = (patch: (next: DesignControls) => void) => {
    const next = cloneDesignControls(controls);
    patch(next);
    setDraft({ profile: "custom", custom: next });
  };

  const pickProfile = (profile: DesignControlProfileId) => {
    setNotice("");
    setRecording(null);
    if (profile !== "custom") {
      setDraft((prev) => ({ ...prev, profile }));
      return;
    }
    setDraft((prev) => ({
      profile: "custom",
      custom: prev.custom ?? cloneDesignControls(resolveDesignControls(prev)),
    }));
  };

  const assignKey = (action: DesignKeyAction, binding: KeyBinding | null) => {
    const taken = binding
      ? (Object.keys(controls.keys) as DesignKeyAction[]).find(
          (id) => id !== action && sameKeyBinding(controls.keys[id], binding),
        )
      : undefined;
    editControls((next) => {
      next.keys[action] = binding;
      if (taken) next.keys[taken] = null;
    });
    setNotice(taken ? `「${KEY_LABEL.get(taken)}」에 걸려 있던 키를 옮겼습니다.` : "");
  };

  const onRecordKey = (action: DesignKeyAction, event: ReactKeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const native = event.nativeEvent;
    if (native.code === "Escape") {
      setRecording(null);
      return;
    }
    if (native.code === "Backspace" || native.code === "Delete") {
      assignKey(action, null);
      setRecording(null);
      return;
    }
    if (!isBindableKeyCode(native.code)) return;
    assignKey(action, keyBindingFromEvent(native));
    setRecording(null);
  };

  const setGestures = (action: OrbitMouseAction, rows: OrbitGesture[]) => {
    const moved: OrbitMouseAction[] = [];
    editControls((next) => {
      next.mouse[action] = rows;
      if (!DRAG_ACTIONS.includes(action)) return;
      // 드래그 동작끼리는 같은 조합을 나눠 쓰지 않는다. 회전 중심 클릭은 드래그와 같이 둘 수 있다.
      for (const other of DRAG_ACTIONS) {
        if (other === action) continue;
        const kept = next.mouse[other].filter((row) => !rows.some((own) => sameGesture(own, row)));
        if (kept.length !== next.mouse[other].length) moved.push(other);
        next.mouse[other] = kept;
      }
    });
    setNotice(
      moved.length > 0
        ? `「${moved.map((id) => MOUSE_LABEL.get(id)).join("」·「")}」에 걸려 있던 조합을 옮겼습니다.`
        : "",
    );
  };

  const apply = () => {
    setDesignControlPrefs(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[500] flex h-[min(92vh,40rem)] w-[min(96vw,48rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[min(96vw,48rem)] sm:max-w-none sm:p-0"
        overlayClassName="z-[500]"
        onEscapeKeyDown={(event) => {
          if (recording) event.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b py-3 pl-5 pr-12 text-left">
          <DialogTitle className="text-base">단축키·마우스</DialogTitle>
        </DialogHeader>
        <div className="shrink-0 space-y-1.5 border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-2 text-xs font-semibold text-foreground">프리셋</span>
            {[...DESIGN_CONTROL_PRESET_IDS, "custom" as const].map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={draft.profile === id ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                aria-pressed={draft.profile === id}
                onClick={() => pickProfile(id)}
              >
                {id === "custom" ? "직접 설정" : DESIGN_CONTROL_PRESETS[id].label}
                {id === "abuts" ? (
                  <span className="ml-1 text-[10px] opacity-70">기본</span>
                ) : null}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {draft.profile === "custom" ? (
              <>
                키나 마우스 조합을 눌러 바꿉니다.
                <br />
                프리셋을 고르면 직접 설정은 그대로 두고 프리셋을 씁니다.
              </>
            ) : (
              <>
                {DESIGN_CONTROL_PRESETS[draft.profile].hint}
                <br />
                아래에서 하나라도 바꾸면 이 프리셋을 복사한 직접 설정이 됩니다.
              </>
            )}
            <br />
            두 손가락 드래그는 화면 회전입니다.
            <br />
            두 손가락 스크롤은 이동합니다.
            <br />
            마우스 휠과 핀치는 확대·축소입니다.
          </p>
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="w-36 shrink-0 space-y-0.5 border-r bg-muted/30 p-2">
            {(
              [
                { id: "keys", label: "단축키" },
                { id: "mouse", label: "마우스" },
              ] as const
            ).map((row) => (
              <button
                key={row.id}
                type="button"
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-xs font-medium",
                  tab === row.id
                    ? "bg-background text-primary shadow-sm ring-1 ring-primary/30"
                    : "hover:bg-background/70",
                )}
                onClick={() => {
                  setTab(row.id);
                  setRecording(null);
                }}
              >
                {row.label}
              </button>
            ))}
          </aside>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {notice ? (
              <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">{notice}</p>
            ) : null}
            {tab === "keys" ? (
              <div className="space-y-4">
                {DESIGN_KEY_GROUPS.map((group) => (
                  <section key={group.label}>
                    <h3 className="mb-1 text-xs font-semibold text-foreground">{group.label}</h3>
                    <ul>
                      {group.rows.map((row) => {
                        const binding = controls.keys[row.id];
                        const active = recording === row.id;
                        return (
                          <li
                            key={row.id}
                            className="flex items-center justify-between gap-3 border-b border-dashed py-1 last:border-b-0"
                          >
                            <span className="text-xs text-foreground">{row.label}</span>
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                className={cn(
                                  "flex h-7 min-w-24 items-center justify-end rounded-md px-1.5 text-xs",
                                  active
                                    ? "bg-primary/10 text-primary ring-1 ring-primary"
                                    : "hover:bg-muted",
                                )}
                                onClick={() => setRecording(active ? null : row.id)}
                                onKeyDown={active ? (event) => onRecordKey(row.id, event) : undefined}
                                onBlur={() => {
                                  if (active) setRecording(null);
                                }}
                                aria-label={`${row.label} 단축키`}
                              >
                                {active ? (
                                  "키를 누르세요"
                                ) : binding ? (
                                  <KeyCaps binding={binding} />
                                ) : (
                                  <span className="text-muted-foreground">없음</span>
                                )}
                              </button>
                              <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
                                aria-label={`${row.label} 단축키 지우기`}
                                disabled={!binding}
                                onClick={() => assignKey(row.id, null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
                <p className="text-xs text-muted-foreground">
                  칸을 누른 뒤 키를 누릅니다. Esc는 취소, Backspace는 지우기입니다.
                  <br />
                  Mac의 ⌘는 Ctrl로 받습니다. 다시 실행은 Ctrl+Shift+Z도 받습니다.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <ul>
                  {ORBIT_MOUSE_ROWS.map((row) => {
                    const rows = controls.mouse[row.id];
                    return (
                      <li key={row.id} className="border-b border-dashed py-2 last:border-b-0">
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                          <span className="text-xs font-semibold text-foreground">{row.label}</span>
                          <span className="text-[11px] text-muted-foreground">{row.hint}</span>
                        </div>
                        <div className="space-y-1">
                          {rows.map((gesture, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <select
                                className={selectClass}
                                value={gesture.mod}
                                aria-label={`${row.label} 수식키`}
                                onChange={(event) =>
                                  setGestures(
                                    row.id,
                                    rows.map((cur, at) =>
                                      at === index
                                        ? { ...cur, mod: event.target.value as OrbitModifier }
                                        : cur,
                                    ),
                                  )
                                }
                              >
                                {ORBIT_MODIFIER_OPTIONS.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <span className="text-xs text-muted-foreground">+</span>
                              <select
                                className={selectClass}
                                value={gesture.button}
                                aria-label={`${row.label} 버튼`}
                                onChange={(event) =>
                                  setGestures(
                                    row.id,
                                    rows.map((cur, at) =>
                                      at === index
                                        ? { ...cur, button: event.target.value as OrbitMouseButton }
                                        : cur,
                                    ),
                                  )
                                }
                              >
                                {ORBIT_BUTTON_OPTIONS.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label} {row.id === "pivot" ? "클릭" : "드래그"}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label={`${row.label} 조합 빼기`}
                                onClick={() =>
                                  setGestures(
                                    row.id,
                                    rows.filter((_, at) => at !== index),
                                  )
                                }
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          {rows.length === 0 ? (
                            <p className="text-xs text-muted-foreground">없음</p>
                          ) : null}
                          {rows.length < ORBIT_GESTURE_MAX ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
                              onClick={() =>
                                setGestures(row.id, [
                                  ...rows,
                                  { button: "middle", mod: "none" },
                                ])
                              }
                            >
                              <Plus className="h-3 w-3" />
                              조합 추가
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <label className="flex items-center justify-between gap-3 border-t pt-3">
                  <span className="text-xs font-semibold text-foreground">
                    휠 방향 뒤집기
                    <span className="ml-2 font-normal text-muted-foreground">
                      켜면 휠을 내릴 때 확대합니다.
                    </span>
                  </span>
                  <Switch
                    checked={controls.mouse.invertWheel}
                    onCheckedChange={(on) =>
                      editControls((next) => {
                        next.mouse.invertWheel = on;
                      })
                    }
                    aria-label="휠 방향 뒤집기"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  오른쪽 버튼이 회전·이동이면 오른쪽 클릭 편집(마진 점 지우기 등)은 뗄 때 실행합니다.
                  <br />
                  누른 채 끌면 화면만 움직입니다.
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" size="sm" disabled={!dirty} onClick={apply}>
            적용
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
