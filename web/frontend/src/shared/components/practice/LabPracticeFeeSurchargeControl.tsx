// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-14: 치과별 기공수가 할증(1x·1.1x·1.2x·1.5x·직접). Dialog + 취소/저장.
// - 2026-08-15: 버튼 툴팁·모달 강조. 저장은 다음 의뢰부터(현재 건 소급 금지).
// - 2026-08-16: 의뢰상세 채팅 헤더는 트리거 라벨「치과 평가」(모달 동일).
// - 2026-08-19: 채팅「치과 평가」= 별점 없음·수가 할증만. 설정 탭은 할증 안내 유지.
import { useEffect, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  formatLabFeeMultiplierLabel,
  normalizeLabFeeMultiplier,
} from "@/shared/practice/labFeeSchedule";
import { cn } from "@/shared/ui/cn";

const PRESETS = [
  { value: 1, label: "1x" },
  { value: 1.1, label: "1.1x" },
  { value: 1.2, label: "1.2x" },
  { value: 1.5, label: "1.5x" },
] as const;

const SURCHARGE_NEXT_ORDER_HINT =
  "저장하면 해당 치과의 다음 의뢰부터 반영됩니다.";

const SETTINGS_DESCRIPTION_LINES = [
  "세심한 작업으로 시간이 더 드는 치과는 기공수가를 할증할 수 있습니다.",
  SURCHARGE_NEXT_ORDER_HINT,
] as const;

const EVALUATE_DESCRIPTION_LINES = [
  "별점 평가가 아니라, 해당 치과 기공수가를 할증할 수 있습니다.",
  SURCHARGE_NEXT_ORDER_HINT,
] as const;

function matchesPreset(value: number, preset: number) {
  return Math.abs(value - preset) < 0.001;
}

function isPresetValue(value: number) {
  return PRESETS.some((preset) => matchesPreset(value, preset.value));
}

type LabPracticeFeeSurchargeControlProps = {
  practiceAnchorId: string;
  multiplier?: number | null;
  onChanged?: (multiplier: number) => void;
  className?: string;
  size?: "sm" | "xs";
  stopPropagation?: boolean;
  /** 트리거 버튼 라벨(비활성). 기본: 기공수가 할증 */
  buttonLabel?: string;
  /** 모달 제목. 기본: 기공수가 할증 */
  dialogTitle?: string;
  /** chat-evaluate: 의뢰상세「치과 평가」. 별점 없이 할증만. */
  variant?: "surcharge" | "evaluate";
};

export function LabPracticeFeeSurchargeControl({
  practiceAnchorId,
  multiplier = 1,
  onChanged,
  className,
  size = "sm",
  stopPropagation = true,
  buttonLabel = "기공수가 할증",
  dialogTitle = "기공수가 할증",
  variant = "surcharge",
}: LabPracticeFeeSurchargeControlProps) {
  const descriptionLines =
    variant === "evaluate"
      ? EVALUATE_DESCRIPTION_LINES
      : SETTINGS_DESCRIPTION_LINES;
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(() =>
    normalizeLabFeeMultiplier(multiplier),
  );
  const [draft, setDraft] = useState(() =>
    normalizeLabFeeMultiplier(multiplier),
  );
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    setCurrent(normalizeLabFeeMultiplier(multiplier));
  }, [multiplier]);

  useEffect(() => {
    if (!open) return;
    const next = normalizeLabFeeMultiplier(current);
    setDraft(next);
    setCustomText(isPresetValue(next) ? "" : String(next));
  }, [open, current]);

  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId) return null;

  const save = async (nextRaw: number) => {
    if (!token) return;
    const next = normalizeLabFeeMultiplier(nextRaw);
    setSaving(true);
    try {
      const res = await request<{
        data?: { labFeeMultiplier?: number };
        message?: string;
      }>({
        path: "/api/lab-trading-partners/practice-fee-multiplier",
        method: "PUT",
        token,
        jsonBody: { practiceAnchorId: practiceId, multiplier: next },
      });
      if (!res.ok) {
        toast({
          title: "기공수가 할증 저장 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const saved = normalizeLabFeeMultiplier(
        res.data?.data?.labFeeMultiplier ?? next,
      );
      setCurrent(saved);
      onChanged?.(saved);
      setOpen(false);
      toast({
        title:
          saved > 1
            ? `기공수가 ${formatLabFeeMultiplierLabel(saved)} 적용`
            : "기공수가 할증 해제",
        description: SURCHARGE_NEXT_ORDER_HINT,
        duration: 2500,
      });
    } finally {
      setSaving(false);
    }
  };

  const onTriggerPointerDown = (event: MouseEvent) => {
    if (stopPropagation) {
      // 카드 클릭(상세 모달)만 막고, 다이얼로그 토글은 유지한다.
      event.stopPropagation();
    }
  };

  const resolveDraftToSave = (): number | null => {
    const trimmed = customText.trim();
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 1) {
        toast({
          title: "1 이상 숫자를 입력하세요",
          description: "예: 1.3 · 최대 5x까지 설정할 수 있습니다.",
          variant: "destructive",
        });
        return null;
      }
      if (n > 5) {
        toast({
          title: "최대 5x까지 설정할 수 있습니다",
          variant: "destructive",
        });
        return null;
      }
      return n;
    }
    return draft;
  };

  const handleSave = () => {
    const next = resolveDraftToSave();
    if (next == null) return;
    void save(next);
  };

  const active = current > 1;
  const buttonSizeClass =
    size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs";
  const customSelected = Boolean(customText.trim()) || !isPresetValue(draft);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" onPointerDown={onTriggerPointerDown}>
            <Button
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              className={cn(buttonSizeClass, className)}
              aria-label={
                active
                  ? `기공수가 ${formatLabFeeMultiplierLabel(current)}`
                  : `${buttonLabel} 설정`
              }
              onClick={() => setOpen(true)}
            >
              {active ? formatLabFeeMultiplierLabel(current) : buttonLabel}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {SURCHARGE_NEXT_ORDER_HINT}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-xl gap-5 overflow-y-auto p-0 sm:rounded-2xl"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-200/80 px-6 pb-4 pt-6">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p className="text-slate-500">{descriptionLines[0]}</p>
                  <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm font-medium leading-snug text-amber-950">
                    {descriptionLines[1]}
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid grid-cols-5 gap-2 px-6">
            {PRESETS.map((preset) => {
              const selected =
                !customSelected && matchesPreset(draft, preset.value);
              return (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  className="h-10 w-full min-w-0 rounded-lg px-1 text-sm tabular-nums"
                  disabled={saving}
                  onClick={() => {
                    setDraft(preset.value);
                    setCustomText("");
                  }}
                >
                  {preset.label}
                </Button>
              );
            })}
            <Input
              type="number"
              min={1}
              max={5}
              step={0.1}
              placeholder="직접"
              value={customText}
              disabled={saving}
              className={cn(
                "h-10 w-full min-w-0 rounded-lg border-slate-200 bg-white px-1 text-center text-sm tabular-nums shadow-none focus-visible:ring-slate-300",
                customSelected && "border-slate-900 ring-1 ring-slate-900",
              )}
              aria-label="기공수가 할증 직접 입력"
              onChange={(event) => {
                const next = event.target.value;
                setCustomText(next);
                const n = Number(next);
                if (Number.isFinite(n) && n >= 1) {
                  setDraft(normalizeLabFeeMultiplier(n));
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>

          <DialogFooter className="border-t border-slate-200/80 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-10 min-w-[5.5rem] rounded-lg"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              className="h-10 min-w-[5.5rem] rounded-lg"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
