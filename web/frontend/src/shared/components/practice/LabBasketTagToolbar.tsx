// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/practice/practiceTransferDetailPrint.ts
// - 2026-09-20: 부모 @container ≥24rem이면 라벨, 좁으면 아이콘(iconOnly면 항상 아이콘).
// - 2026-09-20: iconOnly — 프린트·번호표 아이콘만(좁은 상세 패널).
// - 2026-09-20: nowrap·축약 — 헤더 작업시작/취소와 한 줄.
// - 2026-09-20: 번호표 — 글자만(A–Z) 또는 글자+숫자(A1–Z9). 숫자는 옵션.
// - 2026-09-20: 기공소 의뢰상세 — 프린트·바구니 번호표·안내 모달.
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Info, Printer, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";

const STORAGE_PREFIX = "lab_basket_tag_v1:";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** A–Z 또는 A1–Z9 */
export const LAB_BASKET_TAG_RE = /^[A-Z][1-9]?$/;

export function normalizeLabBasketTag(value: unknown): string {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  return LAB_BASKET_TAG_RE.test(raw) ? raw : "";
}

export function readLabBasketTag(storageKey: string | null | undefined): string {
  const key = String(storageKey || "").trim();
  if (!key || typeof window === "undefined") return "";
  try {
    return normalizeLabBasketTag(
      window.localStorage.getItem(`${STORAGE_PREFIX}${key}`),
    );
  } catch {
    return "";
  }
}

export function writeLabBasketTag(
  storageKey: string | null | undefined,
  tag: string,
): void {
  const key = String(storageKey || "").trim();
  if (!key || typeof window === "undefined") return;
  const next = normalizeLabBasketTag(tag);
  try {
    if (next) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, next);
    } else {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    }
  } catch {
    // ignore quota / private mode
  }
}

type LabBasketTagToolbarProps = {
  storageKey?: string | null;
  value: string;
  onChange: (tag: string) => void;
  onPrint: () => void;
  /**
   * true면 항상 아이콘만.
   * false(기본)면 부모 `@container` 폭 ≥24rem일 때 라벨 표시.
   */
  iconOnly?: boolean;
  className?: string;
};

export function LabBasketTagToolbar({
  storageKey = null,
  value,
  onChange,
  onPrint,
  iconOnly = false,
  className,
}: LabBasketTagToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [draftLetter, setDraftLetter] = useState<string | null>(null);

  const selected = normalizeLabBasketTag(value);
  const selectedLetter = selected ? selected[0] : null;
  const selectedNumber =
    selected.length === 2 ? Number(selected[1]) : null;
  const activeLetter = draftLetter || selectedLetter;

  const letterButtons = useMemo(
    () =>
      LETTERS.map((letter) => (
        <button
          key={letter}
          type="button"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-colors",
            activeLetter === letter
              ? "bg-primary text-primary-foreground"
              : "bg-muted/60 text-foreground hover:bg-muted",
          )}
          onClick={() => setDraftLetter(letter)}
        >
          {letter}
        </button>
      )),
    [activeLetter],
  );

  const applyTag = (next: string) => {
    const normalized = normalizeLabBasketTag(next);
    onChange(normalized);
    writeLabBasketTag(storageKey, normalized);
  };

  const commitLetterAndNumber = (letter: string, num: number) => {
    applyTag(`${letter}${num}`);
    setDraftLetter(null);
    setPickerOpen(false);
  };

  const clearTag = () => {
    applyTag("");
    setDraftLetter(null);
    setPickerOpen(false);
  };

  const handlePickerOpenChange = (next: boolean) => {
    if (!next) {
      // 글자만 고르고 닫으면 A–Z로 확정(숫자는 옵션)
      if (draftLetter) {
        applyTag(draftLetter);
      }
      setDraftLetter(null);
    }
    setPickerOpen(next);
  };

  const labelVisibleClass = iconOnly ? "hidden" : "hidden @[24rem]:inline";
  const iconFallbackClass = iconOnly
    ? "inline"
    : "inline @[24rem]:hidden";

  return (
    <>
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
          className={cn(
            "h-7 text-xs",
            iconOnly
              ? "w-7 gap-0 px-0"
              : "w-7 gap-0 px-0 @[24rem]:w-auto @[24rem]:gap-1 @[24rem]:px-2",
          )}
          title="의뢰 상세 인쇄 (A5)"
          aria-label="의뢰 상세 인쇄 (A5)"
          onClick={onPrint}
        >
          <Printer className="h-3.5 w-3.5 shrink-0" />
          <span className={labelVisibleClass}>프린트</span>
        </Button>

        <Popover open={pickerOpen} onOpenChange={handlePickerOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-7 text-xs tabular-nums",
                selected
                  ? "max-w-[4.75rem] gap-0.5 px-1.5 border-primary/40 bg-primary/5 font-semibold text-primary"
                  : iconOnly
                    ? "w-7 gap-0 px-0"
                    : "w-7 gap-0 px-0 @[24rem]:w-auto @[24rem]:max-w-[4.75rem] @[24rem]:gap-0.5 @[24rem]:px-1.5",
              )}
              title="기공물 바구니 번호표"
              aria-label="기공물 바구니 번호표 선택"
            >
              {selected ? (
                <span className="min-w-0 truncate">{selected}</span>
              ) : (
                <>
                  <Tags
                    className={cn("h-3.5 w-3.5 shrink-0", iconFallbackClass)}
                  />
                  <span className={cn("min-w-0 truncate", labelVisibleClass)}>
                    번호표
                  </span>
                </>
              )}
              {selected ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
              ) : iconOnly ? null : (
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 opacity-70",
                    "hidden @[24rem]:inline",
                  )}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="z-[400] w-[17.5rem] p-3"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  바구니 번호표
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
              <div className="grid grid-cols-9 gap-1">{letterButtons}</div>
              <div className="flex items-center gap-1 border-t border-border/70 pt-2">
                {NUMBERS.map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={!activeLetter}
                    className={cn(
                      "inline-flex h-8 flex-1 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      selectedLetter === activeLetter &&
                        selectedNumber === num &&
                        !draftLetter
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-foreground hover:bg-muted",
                    )}
                    onClick={() => {
                      if (!activeLetter) return;
                      commitLetterAndNumber(activeLetter, num);
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="번호표·바구니 안내"
          aria-label="번호표·바구니 안내"
          onClick={() => setGuideOpen(true)}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      <LabBasketTagGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  );
}

function LabBasketTagGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[340] gap-0 overflow-hidden p-0 sm:max-w-md"
        overlayClassName="z-[335]"
      >
        <DialogHeader className="space-y-1 border-b bg-slate-50 px-5 py-4 text-left">
          <DialogTitle className="text-base">번호표 · 바구니</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            바구니에 번호표를 넣고, 화면에서 같은 번호를 고릅니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <GuideStep step={1} title="번호표 인쇄" body="A–Z 또는 A1–Z9">
            <NumberTagSheetIllustration />
          </GuideStep>

          <GuideStep step={2} title="바구니에 넣기" body="작업 바구니마다 하나씩">
            <BasketWithTagIllustration />
          </GuideStep>

          <GuideStep
            step={3}
            title="의뢰에 선택"
            body="헤더 번호표 = 바구니 번호. 프린트에도 표시"
          >
            <MatchIllustration />
          </GuideStep>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GuideStep({
  step,
  title,
  body,
  children,
}: {
  step: number;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {step}
      </div>
      <div className="min-w-0 space-y-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border/80 bg-gradient-to-br from-slate-50 to-white p-3">
          {children}
        </div>
      </div>
    </div>
  );
}

function NumberTagSheetIllustration() {
  const samples = ["A", "B", "C3", "D", "E2", "F1"];
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
        {/* basket */}
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
        {/* work pieces */}
        <rect x="78" y="78" width="28" height="18" rx="3" fill="#bfdbfe" stroke="#60a5fa" />
        <rect x="114" y="74" width="24" height="22" rx="3" fill="#fda4af" stroke="#fb7185" />
        <circle cx="156" cy="92" r="11" fill="#86efac" stroke="#4ade80" />
        {/* hanging tag */}
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
          B3
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
        <span className="text-sm font-bold tabular-nums text-sky-800">B3</span>
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
        <span className="text-xs font-semibold text-foreground">번호표 B3</span>
      </div>
    </div>
  );
}
