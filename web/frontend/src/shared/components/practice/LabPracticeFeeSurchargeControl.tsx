// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-14: 치과별 기공수가 할증(1.2x·1.5x·1.8x·직접).
import { useEffect, useState, type MouseEvent } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
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
  { value: 1, label: "없음" },
  { value: 1.2, label: "1.2x" },
  { value: 1.5, label: "1.5x" },
  { value: 1.8, label: "1.8x" },
] as const;

const TRIGGER_TOOLTIP =
  "세심한 작업이 필요한 치과에 기공수가 할증을 설정합니다. 이후 해당 치과 의뢰부터 적용됩니다.";

const PANEL_HELP =
  "세심한 작업으로 시간이 더 드는 치과에 기공수가를 배수로 올릴 수 있습니다.";

type LabPracticeFeeSurchargeControlProps = {
  practiceAnchorId: string;
  multiplier?: number | null;
  onChanged?: (multiplier: number) => void;
  className?: string;
  size?: "sm" | "xs";
  stopPropagation?: boolean;
};

export function LabPracticeFeeSurchargeControl({
  practiceAnchorId,
  multiplier = 1,
  onChanged,
  className,
  size = "sm",
  stopPropagation = true,
}: LabPracticeFeeSurchargeControlProps) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(() =>
    normalizeLabFeeMultiplier(multiplier),
  );
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    setCurrent(normalizeLabFeeMultiplier(multiplier));
  }, [multiplier]);

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
        description:
          saved > 1
            ? "이후 이 치과에서 보내는 의뢰에 할증 수가가 적용됩니다."
            : "이후 이 치과 의뢰는 기본 기공수가로 계산됩니다.",
        duration: 2500,
      });
    } finally {
      setSaving(false);
    }
  };

  const onTriggerPointerDown = (event: MouseEvent) => {
    if (stopPropagation) {
      // 카드 클릭(상세 모달)만 막고, 팝오버 토글은 유지한다.
      event.stopPropagation();
    }
  };

  const applyCustom = () => {
    const n = Number(customText);
    if (!Number.isFinite(n) || n < 1) {
      toast({
        title: "1 이상 숫자를 입력하세요",
        description: "예: 1.3 · 최대 5x까지 설정할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
    if (n > 5) {
      toast({
        title: "최대 5x까지 설정할 수 있습니다",
        variant: "destructive",
      });
      return;
    }
    void save(n);
  };

  const active = current > 1;
  const buttonSizeClass =
    size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs";
  const isCustomSelected =
    current > 1 &&
    !PRESETS.some(
      (preset) =>
        preset.value > 1 && Math.abs(current - preset.value) < 0.001,
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" onPointerDown={onTriggerPointerDown}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={cn(buttonSizeClass, className)}
                  aria-label={
                    active
                      ? `기공수가 ${formatLabFeeMultiplierLabel(current)}`
                      : "기공수가 할증 설정"
                  }
                >
                  {active ? formatLabFeeMultiplierLabel(current) : "기공수가 할증"}
                </Button>
              </PopoverTrigger>
            </span>
          </TooltipTrigger>
          {!open ? (
            <TooltipContent side="top" className="max-w-[16rem] text-xs leading-relaxed">
              {active
                ? `현재 ${formatLabFeeMultiplierLabel(current)}입니다. 클릭해 변경하거나 해제할 수 있습니다.`
                : TRIGGER_TOOLTIP}
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        align="start"
        className="w-[17.5rem] space-y-3 p-3"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900">기공수가 할증</p>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-slate-700"
                    aria-label="기공수가 할증 안내"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[18rem] space-y-1.5 p-3 text-xs leading-relaxed"
                >
                  <p>{PANEL_HELP}</p>
                  <p>
                    <span className="font-medium text-background">적용</span>
                    {" · "}기공비, 기공소 어벗 수가
                  </p>
                  <p>
                    <span className="font-medium text-background">제외</span>
                    {" · "}어벗츠 커스텀어벗 단가
                  </p>
                  <p>저장 후 해당 치과의 다음 의뢰부터 반영됩니다.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {PANEL_HELP}
            <br />
            기공비·기공소 어벗만 배수되며, 어벗츠 단가는 그대로입니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => {
            const selected =
              preset.value === 1
                ? current <= 1
                : Math.abs(current - preset.value) < 0.001;
            return (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                disabled={saving}
                onClick={() => void save(preset.value)}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-slate-600">
            직접 입력
            {isCustomSelected ? (
              <span className="ml-1 font-normal text-muted-foreground">
                (현재 {formatLabFeeMultiplierLabel(current)})
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={5}
              step={0.1}
              placeholder="예: 1.3"
              value={customText}
              disabled={saving}
              className="h-8 text-xs"
              aria-label="기공수가 할증 직접 입력"
              onChange={(event) => setCustomText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyCustom();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 shrink-0 px-2.5 text-xs"
              disabled={saving}
              onClick={applyCustom}
            >
              적용
            </Button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            1 초과 ~ 최대 5x. 1을 입력하면 할증이 해제됩니다.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
