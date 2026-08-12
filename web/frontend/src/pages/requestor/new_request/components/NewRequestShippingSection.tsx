// change-log:
// - 2026-08-11: 의뢰하기 위 «디자인까지 의뢰할 경우 1일 추가» 안내 삭제.
// - 2026-08-11: 묶음/신속 옵션 카드 ring·그림자 잘림 방지(내부 여백 확대).
// - 2026-08-09: 첨부 건이 디자인+생산이면 신속 선택 판정에 productMode(+1영업일) 반영.
// - 2026-08-09: 출고 카드 상단 여백 정리(세로 중앙정렬 제거, 상하좌우 패딩 균일).
// - 2026-08-09: 묶음/신속 카피 정리, 디자인+1일 안내를 의뢰하기 버튼 바로 위로.
// - 2026-08-09: 디자인+1일 안내를 신속 카드 밖으로 이동(묶음/신속 내부 카피 삭제).
// - 2026-08-09: 신속 카피 «디자인까지 의뢰할 경우 1일 추가».
// - 2026-08-09: 출고 카드 max-h 제거·왼쪽과 동일 높이로 의뢰하기 버튼 잘림 방지.
// - 2026-08-09: 디자인+생산 출고 +1영업일 안내(묶음/신속 카피).
// - 2026-08-06: 배송/발송 표기를 출고로 통일 (제조사 출발일).
// - 2026-08-08: weeklyBatchDays prop SSOT — selectedDays 이중 상태 제거, optimistic 반영.
// - 2026-08-08: 신속 선택 = 신속 ETA < 묶음 ETA일 때만 (조기 이점 없으면 비활성).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/shared/shipping/weeklyBatchSchedule.ts
// - web/frontend/src/shared/shipping/estimateShipDate.ts
// - web/backend/controllers/requests/creation.from-draft.controller.js
import { Button } from "@/components/ui/button";
import { Package, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useNavigate } from "react-router-dom";
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings,
} from "@/hooks/useSystemSettings";
import { cn } from "@/shared/ui/cn";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import {
  normalizeWeeklyBatchDays,
  type WeeklyBatchDayKey,
} from "@/shared/shipping/weeklyBatchSchedule";
import {
  EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE,
  isExpressShippingSelectable,
  type LeadTimesMap,
} from "@/shared/shipping/estimateShipDate";

type ShippingMode = "normal" | "express";

type Props = {
  disabled?: boolean;
  weeklyBatchDays: string[];
  onWeeklyBatchDaysChange?: (days: string[]) => void;
  leadTimes?: LeadTimesMap | null;
  /** 첨부 건이 디자인+생산(구강 스캔 묶음 등)이면 +1영업일 반영 */
  expressProductMode?: string | null;
  defaultShippingMode: ShippingMode;
  onDefaultShippingModeChange: (mode: ShippingMode) => void;
  onSubmit: () => void;
};

type WeekDay = WeeklyBatchDayKey;

const WEEKDAYS: { key: WeekDay; label: string }[] = [
  { key: "mon", label: "월" },
  { key: "tue", label: "화" },
  { key: "wed", label: "수" },
  { key: "thu", label: "목" },
  { key: "fri", label: "금" },
];

export function NewRequestShippingSection({
  disabled,
  weeklyBatchDays,
  onWeeklyBatchDaysChange,
  leadTimes = null,
  expressProductMode = null,
  defaultShippingMode,
  onDefaultShippingModeChange,
  onSubmit,
}: Props) {
  const isDisabled = !!disabled;
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const businessType = useMemo(
    () => resolveBusinessType(user?.role, "requestor"),
    [user?.role],
  );
  const { data: systemSettings } = useSystemSettings();
  const expressFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.expressFee ??
        CREDIT_SETTINGS_DEFAULTS.expressFee,
    ) || CREDIT_SETTINGS_DEFAULTS.expressFee,
  );
  const expressFeeLabel = expressFee.toLocaleString("ko-KR");
  const [isUpdating, setIsUpdating] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const weekdaysRef = useRef<HTMLDivElement | null>(null);
  const [pulse, setPulse] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const selectedDays = useMemo(
    () => normalizeWeeklyBatchDays(weeklyBatchDays),
    [weeklyBatchDays],
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const expressSelectable = useMemo(
    () =>
      isExpressShippingSelectable({
        weeklyBatchDays: selectedDays,
        leadTimes,
        diameter: null,
        productMode: expressProductMode,
        requestedAt: now,
      }),
    [selectedDays, leadTimes, expressProductMode, now],
  );

  // 저장된 기본값(preference)은 유지하고, 선택 불가 구간에서는 표시·적용만 묶음으로 본다.
  const effectiveDefaultMode: ShippingMode =
    !expressSelectable && defaultShippingMode === "express"
      ? "normal"
      : defaultShippingMode;

  useEffect(() => {
    const handler = () => {
      setPulse(true);
      try {
        (weekdaysRef.current || containerRef.current)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } catch {}
      const t = setTimeout(() => setPulse(false), 4000);
      return () => clearTimeout(t as any);
    };
    window.addEventListener("abuts:shipping:needs-weekly-days", handler as any);
    return () =>
      window.removeEventListener(
        "abuts:shipping:needs-weekly-days",
        handler as any,
      );
  }, []);

  const toggleDay = async (day: WeekDay) => {
    if (isDisabled || isUpdating) return;

    const previousDays = selectedDays;
    const newDays = previousDays.includes(day)
      ? previousDays.filter((d) => d !== day)
      : [...previousDays, day];

    if (newDays.length === 0) {
      toast({
        title: "최소 1개 선택 필요",
        description: "최소 1개의 출고일을 선택해야 합니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    onWeeklyBatchDaysChange?.(newDays);
    if (import.meta.env.DEV) {
      console.debug("[ship-eta] toggleDay optimistic", { previousDays, newDays });
    }
    setIsUpdating(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/businesses/me?businessType=${encodeURIComponent(
          businessType,
        )}`,
        method: "PATCH",
        token,
        jsonBody: {
          shippingPolicy: {
            weeklyBatchDays: newDays,
          },
        },
      });

      if (res.ok) {
        toast({
          title: "출고일 설정 완료",
          description: "출고일이 업데이트되었습니다.",
          duration: 2000,
        });
      } else {
        onWeeklyBatchDaysChange?.(previousDays);
        const nextMessage = res.data?.message || "";
        const missingBusinessInfo =
          res.status === 400 &&
          typeof nextMessage === "string" &&
          nextMessage.includes("기공소");

        if (missingBusinessInfo) {
          toast({
            title: "기공소 정보가 필요합니다",
            description: "사업자 설정에서 기공소 정보를 모두 입력해주세요.",
            variant: "destructive",
            duration: 4000,
          });
          navigate("/dashboard/settings?tab=business", { replace: true });
          return;
        }

        toast({
          title: "업데이트 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (e: any) {
      onWeeklyBatchDaysChange?.(previousDays);
      toast({
        title: "오류",
        description: e.message || "출고일 업데이트 중 오류가 발생했습니다.",
        duration: 3000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const persistDefaultShippingMode = async (mode: ShippingMode) => {
    if (isDisabled || isUpdating) return;
    if (mode === "express" && !expressSelectable) {
      toast({
        title: "신속 출고 선택 불가",
        description: EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE,
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    // 기본값이 이미 express여도 건별 모드는 요일 변경 등으로 normal에 묶여 있을 수 있다.
    // 같은 카드 재클릭 시에도 파일 모드를 다시 적용한다.
    const modeUnchanged = mode === defaultShippingMode;
    onDefaultShippingModeChange(mode);
    if (modeUnchanged) return;

    setIsUpdating(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/businesses/me?businessType=${encodeURIComponent(
          businessType,
        )}`,
        method: "PATCH",
        token,
        jsonBody: {
          shippingPolicy: {
            defaultShippingMode: mode,
          },
        },
      });

      if (!res.ok) {
        const nextMessage = res.data?.message || "";
        const missingBusinessInfo =
          res.status === 400 &&
          typeof nextMessage === "string" &&
          nextMessage.includes("기공소");

        if (missingBusinessInfo) {
          toast({
            title: "기공소 정보가 필요합니다",
            description: "사업자 설정에서 기공소 정보를 모두 입력해주세요.",
            variant: "destructive",
            duration: 4000,
          });
          navigate("/dashboard/settings?tab=business", { replace: true });
          return;
        }

        toast({
          title: "기본 출고 방식 저장 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (e: any) {
      toast({
        title: "오류",
        description: e.message || "기본 출고 방식 저장 중 오류가 발생했습니다.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const modeCardClass = (active: boolean, cardDisabled = false) =>
    cn(
      "w-full rounded-lg border bg-white/70 px-4 py-4 space-y-3 text-center transition-all cursor-pointer",
      active
        ? "border-primary ring-2 ring-primary/25 bg-primary/5 shadow-[0_0_0_1px_rgba(37,99,235,0.12)]"
        : "border-slate-200 hover:border-primary/40 hover:bg-slate-50/80",
      (isDisabled || cardDisabled) && "opacity-50 cursor-not-allowed",
      cardDisabled && !active && "hover:border-slate-200 hover:bg-white/70",
    );

  return (
    <div
      ref={containerRef}
      className="app-glass-card app-glass-card--lg relative flex flex-1 min-h-0 h-full flex-col gap-4 border-2 p-5 md:p-7 transition-all border-gray-300"
    >
      <div className="app-glass-card-content flex min-h-0 flex-1 flex-col items-center justify-start gap-3 overflow-y-auto p-2">
        <div
          className="w-full flex flex-col gap-4"
          role="radiogroup"
          aria-label="기본 출고 방식"
        >
          <div
            role="radio"
            aria-checked={effectiveDefaultMode === "normal"}
            tabIndex={isDisabled || isUpdating ? -1 : 0}
            className={modeCardClass(effectiveDefaultMode === "normal")}
            onClick={() => {
              void persistDefaultShippingMode("normal");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void persistDefaultShippingMode("normal");
              }
            }}
          >
            <div className="flex items-center justify-center gap-2 text-base font-medium text-foreground">
              <Package className="w-5 h-5 text-primary" />
              묶음 출고
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className="text-sm text-slate-500 font-medium">출고일</div>
              <div
                ref={weekdaysRef}
                className={`flex gap-1 rounded-md px-1 py-1 transition-all ${
                  pulse
                    ? "bg-destructive-soft border border-destructive/80 ring-2 ring-destructive-muted"
                    : ""
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.key)}
                    disabled={isDisabled || isUpdating}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedDays.includes(day.key)
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    } ${
                      isDisabled || isUpdating
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-sm text-destructive">적어도 2-3개 요일 선택 권장</div>
            <div className="text-sm text-slate-600 leading-relaxed">
              준비되는대로 바로 의뢰해주세요.
              <br />
              지정된 요일에 일괄 출고해드립니다.
            </div>
          </div>

          <div
            role="radio"
            aria-checked={effectiveDefaultMode === "express"}
            aria-disabled={!expressSelectable}
            tabIndex={
              isDisabled || isUpdating || !expressSelectable ? -1 : 0
            }
            className={modeCardClass(
              effectiveDefaultMode === "express",
              !expressSelectable,
            )}
            onClick={() => {
              if (!expressSelectable) {
                toast({
                  title: "신속 출고 선택 불가",
                  description: EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE,
                  variant: "destructive",
                  duration: 4000,
                });
                return;
              }
              void persistDefaultShippingMode("express");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!expressSelectable) return;
                void persistDefaultShippingMode("express");
              }
            }}
          >
            <div className="flex items-center justify-center gap-2 text-base font-medium text-foreground">
              <Zap className="w-5 h-5 text-accent" />
              신속 출고
            </div>
            {expressSelectable ? (
              <>
                <div className="text-base text-foreground leading-relaxed">
                  오늘 낮 12시 이전 의뢰 시 오늘 오후 출고
                </div>
                <div className="text-sm text-slate-600 leading-relaxed">
                  의뢰크레딧 {expressFeeLabel}원이 추가로 소비됩니다.
                  <br />
                  (생산지연시 내일 출고·추가 크레딧 없음)
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-600 leading-relaxed">
                신속 출고일이 묶음 출고일과 같아 선택할 이유가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="app-glass-card-content mt-auto shrink-0 px-2">
        <div className="flex justify-center">
          <Button
            onClick={onSubmit}
            size="lg"
            className="w-full sm:w-1/2 text-lg mx-auto"
            disabled={isDisabled}
          >
            의뢰하기
          </Button>
        </div>
      </div>
    </div>
  );
}
