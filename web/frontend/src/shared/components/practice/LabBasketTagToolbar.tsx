// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/practice/practiceTransferDetailPrint.ts
// - web/frontend/src/shared/practice/labBasketTagSheetPrint.ts
// - 2026-09-20: 번호표는 PracticeTransfer.labBasketTag(기공소 BA)만 사용. localStorage 폐기.
// - 2026-09-20: 유실분 번호 그리드 — 드래그로 연속 선택/해제.
// - 2026-09-20: 작업 중 번호 점유·완료 후 재사용. 픽커에서 사용중 비활성.
// - 2026-09-20: 번호표 01–99. 전체·유실분 선택 후 인쇄(미리보기는 인쇄 대화상자).
// - 2026-09-20: 프린트·번호표 — 아이콘+라벨 항상 표시(안내 Info만 아이콘).
// - 2026-09-26: AI는 작업시작 오른쪽(채팅 헤더 액션). 번호표 줄에서는 제거.
// - 2026-09-20: 기공소 의뢰상세 — 프린트·바구니 번호표·안내 모달.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Info, Printer, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/shared/ui/cn";
import {
  labBasketTagSheetCount,
  listLabBasketTags,
  normalizeLabBasketTagCode,
  printLabBasketTagSheet,
  sortLabBasketTags,
  LAB_BASKET_TAG_RE,
  LAB_BASKET_TAGS_PER_PAGE,
} from "@/shared/practice/labBasketTagSheetPrint";
import {
  isPracticeRecentCancelBadgeStatus,
  isPracticeRecentFinishedBadgeStatus,
} from "@/shared/practice/practiceRecentTransferList";

const ALL_TAGS = listLabBasketTags();

export { LAB_BASKET_TAG_RE };

export function normalizeLabBasketTag(value: unknown): string {
  return normalizeLabBasketTagCode(value);
}

/** 브라우저에 남은 레거시 번호표 키(`lab_basket_tag_v1:*`)를 한 번 비운다. */
export function purgeLegacyLabBasketTagStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const prefix = "lab_basket_tag_v1:";
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) toRemove.push(key);
    }
    for (const key of toRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore quota / private mode
  }
}

/** 완료·취소가 아니면 번호표를 점유(진행 중). 완료 건 표시값은 유지하되 점유 제외. */
export function isLabBasketTagOccupyingTransfer(transfer: {
  status?: unknown;
  designFileCount?: unknown;
  designFiles?: unknown;
  designReadyAt?: unknown;
}): boolean {
  const status = String(transfer.status || "").trim();
  if (!status) return false;
  if (isPracticeRecentCancelBadgeStatus(status)) return false;
  if (isPracticeRecentFinishedBadgeStatus(transfer)) return false;
  return true;
}

export type LabBasketTagOccupyTransfer = {
  transferId?: string | null;
  _id?: string | null;
  status?: unknown;
  designFileCount?: unknown;
  designFiles?: unknown;
  designReadyAt?: unknown;
  /** BA에 저장된 번호표 */
  labBasketTag?: string | null;
  basketTag?: string | null;
};

/** 진행 중 의뢰가 쓰는 번호표 Set. excludeTransferId는 현재 상세(자기 선택 유지). */
export function collectOccupiedLabBasketTags(
  transfers: ReadonlyArray<LabBasketTagOccupyTransfer>,
  opts?: { excludeTransferId?: string | null },
): Set<string> {
  const exclude = String(opts?.excludeTransferId || "").trim();
  const out = new Set<string>();
  for (const transfer of transfers) {
    const id = String(transfer.transferId || transfer._id || "").trim();
    if (!id || (exclude && id === exclude)) continue;
    if (!isLabBasketTagOccupyingTransfer(transfer)) continue;
    const tag = normalizeLabBasketTag(
      transfer.labBasketTag ?? transfer.basketTag ?? "",
    );
    if (tag) out.add(tag);
  }
  return out;
}

type LabBasketTagPickerButtonProps = {
  value: string;
  onChange: (tag: string) => void;
  /** 다른 진행 중 의뢰가 쓰는 번호 — 픽커에서 비활성 */
  occupiedTags?: ReadonlySet<string> | null;
  className?: string;
  /** 전체 화면 다이얼로그 위에서 열 때 z-index */
  popoverClassName?: string;
};

/** 채팅 헤더와 같은 바구니 번호표 버튼. */
export function LabBasketTagPickerButton({
  value,
  onChange,
  occupiedTags = null,
  className,
  popoverClassName,
}: LabBasketTagPickerButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const selected = normalizeLabBasketTag(value);
  const occupied = occupiedTags ?? EMPTY_OCCUPIED;

  const applyTag = (next: string) => {
    const normalized = normalizeLabBasketTag(next);
    if (normalized && occupied.has(normalized) && normalized !== selected) {
      return;
    }
    onChange(normalized);
  };

  const clearTag = () => {
    applyTag("");
    setPickerOpen(false);
  };

  const setListNode = (node: HTMLDivElement | null) => {
    wheelCleanupRef.current?.();
    wheelCleanupRef.current = null;
    if (!node) return;
    // 전체 화면 다이얼로그의 스크롤 잠금이 휠 기본 동작을 막는다.
    const onWheel = (event: WheelEvent) => {
      const max = node.scrollHeight - node.clientHeight;
      if (max <= 0) return;
      const line = node.clientHeight || 16;
      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * line
            : event.deltaY;
      const next = Math.min(max, Math.max(0, node.scrollTop + delta));
      if (next === node.scrollTop) return;
      event.preventDefault();
      event.stopPropagation();
      node.scrollTop = next;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    wheelCleanupRef.current = () => node.removeEventListener("wheel", onWheel);
  };

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-7 max-w-[5.5rem] shrink-0 gap-0.5 px-1.5 text-xs tabular-nums",
            selected &&
              "border-primary/40 bg-primary/5 font-semibold text-primary",
            className,
          )}
          title="기공물 바구니 번호표"
          aria-label="기공물 바구니 번호표 선택"
        >
          {selected ? (
            <span className="min-w-0 truncate">{selected}</span>
          ) : (
            <>
              <Tags className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">번호표</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("z-[400] w-[18.5rem] p-3", popoverClassName)}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  바구니 번호표 (01–99)
                </p>
                {selected ? (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={clearTag}
                  >
                    선택 해제
                  </button>
                ) : null}
              </div>
              <div
                ref={setListNode}
                className="max-h-56 overflow-y-auto overscroll-contain pr-0.5"
              >
                <div className="grid grid-cols-10 gap-1">
                  {ALL_TAGS.map((code) => {
                    const isSelected = selected === code;
                    const isOccupied = occupied.has(code) && !isSelected;
                    return (
                      <button
                        key={code}
                        type="button"
                        disabled={isOccupied}
                        title={
                          isOccupied
                            ? "다른 진행 중 의뢰에서 사용 중"
                            : undefined
                        }
                        aria-label={
                          isOccupied
                            ? `${code} (다른 진행 중 의뢰에서 사용 중)`
                            : code
                        }
                        className={cn(
                          "inline-flex h-7 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : isOccupied
                              ? "cursor-not-allowed bg-muted/40 text-muted-foreground/50"
                              : "bg-muted/60 text-foreground hover:bg-muted",
                        )}
                        onClick={() => {
                          if (isOccupied) return;
                          applyTag(code);
                          setPickerOpen(false);
                        }}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </PopoverContent>
    </Popover>
  );
}

type LabBasketTagToolbarProps = {
  value: string;
  onChange: (tag: string) => void;
  onPrint: () => void;
  /** 다른 진행 중 의뢰가 쓰는 번호 — 픽커에서 비활성 */
  occupiedTags?: ReadonlySet<string> | null;
  className?: string;
};

export function LabBasketTagGuideButton({
  elevated = false,
  className,
}: {
  /** AI 보철 전체 화면 위에서 열 때 */
  elevated?: boolean;
  className?: string;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
        title="번호표·바구니 안내"
        aria-label="번호표·바구니 안내"
        onClick={() => setGuideOpen(true)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <LabBasketTagGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        elevated={elevated}
      />
    </>
  );
}

export function LabBasketTagToolbar({
  value,
  onChange,
  onPrint,
  occupiedTags = null,
  className,
}: LabBasketTagToolbarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-nowrap items-center gap-1",
        className,
      )}
      data-no-drag
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        title="의뢰 상세 인쇄 (A5)"
        aria-label="의뢰 상세 인쇄 (A5)"
        onClick={onPrint}
      >
        <Printer className="h-3.5 w-3.5 shrink-0" />
        <span>프린트</span>
      </Button>

      <LabBasketTagPickerButton
        value={value}
        onChange={onChange}
        occupiedTags={occupiedTags}
      />

      <LabBasketTagGuideButton />
    </div>
  );
}

const EMPTY_OCCUPIED: ReadonlySet<string> = new Set();

function LabBasketTagGuideDialog({
  open,
  onOpenChange,
  elevated = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  elevated?: boolean;
}) {
  const [printOpen, setPrintOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-lab-basket-layer=""
          className={cn(
            "gap-0 overflow-hidden p-0 sm:max-w-md",
            elevated ? "z-[560]" : "z-[340]",
          )}
          overlayClassName={cn(
            "lab-basket-layer-overlay",
            elevated ? "z-[555]" : "z-[335]",
          )}
        >
          <DialogHeader className="space-y-1 border-b bg-slate-50 px-5 py-4 text-left">
            <DialogTitle className="text-base">번호표 · 바구니</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              바구니에 번호표를 넣고, 화면에서 같은 번호를 고릅니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <GuideStep
              step={1}
              title="번호표 인쇄"
              body="01–99"
              titleAction={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setPrintOpen(true)}
                >
                  <Printer className="h-3.5 w-3.5 shrink-0" />
                  프린트
                </Button>
              }
            >
              <NumberTagSheetIllustration />
            </GuideStep>

            <GuideStep step={2} title="바구니에 넣기" body="작업 바구니마다 하나씩">
              <BasketWithTagIllustration />
            </GuideStep>

            <GuideStep
              step={3}
              title="의뢰에 선택"
              body="헤더 번호표 = 바구니 번호. 프린트·목록에도 표시. 작업 중에는 번호를 겹쳐 쓰지 않으며, 완료 후 재사용"
            >
              <MatchIllustration />
            </GuideStep>
          </div>
        </DialogContent>
      </Dialog>

      <LabBasketTagPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        elevated={elevated}
      />
    </>
  );
}

type PrintScope = "full" | "custom";

function LabBasketTagPrintDialog({
  open,
  onOpenChange,
  elevated = false,
}: {
  elevated?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [scope, setScope] = useState<PrintScope>("full");
  const [selectedCustom, setSelectedCustom] = useState<string[]>([]);
  /** 드래그 페인트: 시작 칸 기준으로 선택(add) 또는 해제(remove)를 유지 */
  const dragSelectRef = useRef<{
    mode: "add" | "remove";
    visited: Set<string>;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      dragSelectRef.current = null;
      return;
    }
    const endDrag = () => {
      dragSelectRef.current = null;
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [open]);

  const tags = useMemo(() => {
    if (scope === "custom") return sortLabBasketTags(selectedCustom);
    return listLabBasketTags();
  }, [scope, selectedCustom]);
  const titleLabel = scope === "custom" ? "유실분" : "01–99";
  const fullPages = Math.ceil(
    labBasketTagSheetCount() / LAB_BASKET_TAGS_PER_PAGE,
  );
  const canPrint = tags.length > 0;

  const applyCustomTag = (code: string, mode: "add" | "remove") => {
    setSelectedCustom((prev) => {
      if (mode === "add") {
        if (prev.includes(code)) return prev;
        return sortLabBasketTags([...prev, code]);
      }
      if (!prev.includes(code)) return prev;
      return prev.filter((t) => t !== code);
    });
  };

  const toggleCustomTag = (code: string) => {
    setSelectedCustom((prev) => {
      if (prev.includes(code)) return prev.filter((t) => t !== code);
      return sortLabBasketTags([...prev, code]);
    });
  };

  const beginCustomTagDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    code: string,
    currentlyActive: boolean,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const mode = currentlyActive ? "remove" : "add";
    dragSelectRef.current = { mode, visited: new Set([code]) };
    applyCustomTag(code, mode);
  };

  const paintCustomTagDrag = (code: string) => {
    const drag = dragSelectRef.current;
    if (!drag || drag.visited.has(code)) return;
    drag.visited.add(code);
    applyCustomTag(code, drag.mode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-lab-basket-layer=""
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          elevated ? "z-[580]" : "z-[360]",
        )}
        overlayClassName={cn(
          "lab-basket-layer-overlay",
          elevated ? "z-[575]" : "z-[355]",
        )}
      >
        <DialogHeader className="space-y-1 border-b bg-slate-50 px-5 py-4 text-left">
          <DialogTitle className="text-base">번호표 인쇄</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            전체(01–99) 또는 유실된 번호만 고른 뒤 인쇄합니다. 미리보기는 인쇄
            창에서 확인 · A4 · 점선 따라 자르기.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <RadioGroup
            value={scope}
            onValueChange={(value) => {
              if (value === "full" || value === "custom") setScope(value);
            }}
            className="grid gap-2"
          >
            <ScopeOption
              id="lab-basket-tag-mode-full"
              value="full"
              title="전체 (01–99)"
              detail={`${labBasketTagSheetCount()}장 · 약 ${fullPages}페이지`}
            />
            <ScopeOption
              id="lab-basket-tag-mode-custom"
              value="custom"
              title="유실분만 선택"
              detail="잃어버린 번호만 골라 다시 출력"
            />
          </RadioGroup>

          {scope === "custom" ? (
            <div className="space-y-2.5 rounded-lg border border-border/80 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  출력할 번호
                  {selectedCustom.length > 0 ? (
                    <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                      ({selectedCustom.length}장)
                    </span>
                  ) : null}
                </p>
                {selectedCustom.length > 0 ? (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => setSelectedCustom([])}
                  >
                    전체 해제
                  </button>
                ) : null}
              </div>

              {selectedCustom.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {sortLabBasketTags(selectedCustom).map((code) => (
                    <button
                      key={code}
                      type="button"
                      className="inline-flex h-6 items-center rounded-md border border-primary/30 bg-primary/5 px-1.5 text-[11px] font-semibold tabular-nums text-primary"
                      title="선택 해제"
                      onClick={() => toggleCustomTag(code)}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  아래에서 유실된 번호를 누르거나 드래그해 선택합니다.
                </p>
              )}

              <div className="max-h-[min(22rem,50vh)] overflow-y-auto">
                <div className="grid touch-none select-none grid-cols-10 gap-1">
                  {ALL_TAGS.map((code) => {
                    const active = selectedCustom.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        className={cn(
                          "inline-flex h-7 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-foreground hover:bg-muted",
                        )}
                        onPointerDown={(event) =>
                          beginCustomTagDrag(event, code, active)
                        }
                        onPointerEnter={() => paintCustomTagDrag(code)}
                        onClick={(event) => {
                          // 마우스는 pointerdown에서 이미 반영. detail===0은 키보드 활성화.
                          if (event.detail !== 0) return;
                          toggleCustomTag(code);
                        }}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t bg-background px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={!canPrint}
            onClick={() => {
              printLabBasketTagSheet(tags, titleLabel);
            }}
          >
            <Printer className="h-4 w-4 shrink-0" />
            인쇄{canPrint ? ` (${tags.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption({
  id,
  value,
  title,
  detail,
}: {
  id: string;
  value: PrintScope;
  title: string;
  detail: string;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/80 bg-white px-3 py-2.5 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="block text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </Label>
  );
}

function GuideStep({
  step,
  title,
  body,
  titleAction,
  children,
}: {
  step: number;
  title: string;
  body: string;
  titleAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {step}
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {body}
            </p>
          </div>
          {titleAction ? (
            <div className="shrink-0 pt-0.5">{titleAction}</div>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-lg border border-border/80 bg-gradient-to-br from-slate-50 to-white p-3">
          {children}
        </div>
      </div>
    </div>
  );
}

function NumberTagSheetIllustration() {
  const samples = ["01", "02", "15", "23", "48", "99"];
  return (
    <div className="flex flex-wrap justify-center gap-2 py-1" aria-hidden>
      {samples.map((code) => (
        <div
          key={code}
          className="flex h-10 w-10 flex-col items-center justify-center rounded-md border-2 border-dashed border-sky-300 bg-white shadow-sm"
        >
          <span className="text-[11px] font-bold tabular-nums tracking-tight text-sky-700">
            {code}
          </span>
        </div>
      ))}
    </div>
  );
}

function BasketWithTagIllustration() {
  return (
    <div className="relative mx-auto flex h-[7.5rem] w-full max-w-[14rem] items-end justify-center" aria-hidden>
      <svg
        viewBox="0 0 220 150"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="basketBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
        <path
          d="M48 58 h124 l14 72 H34 Z"
          fill="url(#basketBody)"
          stroke="#94a3b8"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M40 58 h140"
          stroke="#64748b"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M70 58 V42 c0-10 10-18 22-18 h36 c12 0 22 8 22 18 v16"
          stroke="#64748b"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <rect x="78" y="78" width="28" height="18" rx="3" fill="#bfdbfe" stroke="#60a5fa" />
        <rect x="114" y="74" width="24" height="22" rx="3" fill="#fda4af" stroke="#fb7185" />
        <circle cx="156" cy="92" r="11" fill="#86efac" stroke="#4ade80" />
        <path d="M168 52 v18" stroke="#64748b" strokeWidth="1.5" strokeDasharray="2 2" />
        <rect
          x="156"
          y="68"
          width="36"
          height="28"
          rx="4"
          fill="#fff"
          stroke="#0ea5e9"
          strokeWidth="2"
        />
        <text
          x="174"
          y="86"
          textAnchor="middle"
          fill="#0369a1"
          fontSize="12"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          15
        </text>
      </svg>
    </div>
  );
}

function MatchIllustration() {
  return (
    <div className="flex items-center justify-center gap-3 py-1" aria-hidden>
      <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg border-2 border-sky-400 bg-sky-50 shadow-sm">
        <span className="text-[10px] text-sky-600/80">바구니</span>
        <span className="text-sm font-bold tabular-nums text-sky-800">15</span>
      </div>
      <svg width="36" height="20" viewBox="0 0 36 20" fill="none">
        <path
          d="M2 10h28M24 4l8 6-8 6"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex h-14 min-w-[7.5rem] flex-col justify-center rounded-lg border border-slate-200 bg-white px-3 shadow-sm">
        <span className="text-[10px] text-muted-foreground">의뢰 · 채팅</span>
        <span className="text-xs font-semibold text-foreground">번호표 15</span>
      </div>
    </div>
  );
}
