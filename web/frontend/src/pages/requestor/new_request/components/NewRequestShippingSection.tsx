// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/backend/controllers/requests/creation.from-draft.controller.js
import { Button } from "@/components/ui/button";
import { Package, Zap } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useNavigate } from "react-router-dom";
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings,
} from "@/hooks/useSystemSettings";
import { cn } from "@/shared/ui/cn";

type ShippingMode = "normal" | "express";

type Props = {
  disabled?: boolean;
  weeklyBatchDays: string[];
  onWeeklyBatchDaysChange?: (days: string[]) => void;
  defaultShippingMode: ShippingMode;
  onDefaultShippingModeChange: (mode: ShippingMode) => void;
  onSubmit: () => void;
};

type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri";

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
  defaultShippingMode,
  onDefaultShippingModeChange,
  onSubmit,
}: Props) {
  const isDisabled = !!disabled;
  const { toast } = useToast();
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const { data: systemSettings } = useSystemSettings();
  const expressFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.expressFee ??
        CREDIT_SETTINGS_DEFAULTS.expressFee,
    ) || CREDIT_SETTINGS_DEFAULTS.expressFee,
  );
  const expressFeeLabel = expressFee.toLocaleString("ko-KR");
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const weekdaysRef = useRef<HTMLDivElement | null>(null);
  const [pulse, setPulse] = useState(false);

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

  useEffect(() => {
    const nextDays = Array.isArray(weeklyBatchDays)
      ? weeklyBatchDays.filter((day): day is WeekDay =>
          WEEKDAYS.some((item) => item.key === day),
        )
      : [];
    setSelectedDays(nextDays);
  }, [weeklyBatchDays]);

  const toggleDay = async (day: WeekDay) => {
    if (isDisabled || isUpdating) return;

    const newDays = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];

    if (newDays.length === 0) {
      toast({
        title: "최소 1개 선택 필요",
        description: "최소 1개의 배송일을 선택해야 합니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setIsUpdating(true);
    try {
      const res = await apiFetch<any>({
        path: "/api/businesses/me?businessType=requestor",
        method: "PATCH",
        token,
        jsonBody: {
          shippingPolicy: {
            weeklyBatchDays: newDays,
          },
        },
      });

      if (res.ok) {
        setSelectedDays(newDays);
        onWeeklyBatchDaysChange?.(newDays);
        toast({
          title: "배송일 설정 완료",
          description: "배송일이 업데이트되었습니다.",
          duration: 2000,
        });
      } else {
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
      toast({
        title: "오류",
        description: e.message || "배송일 업데이트 중 오류가 발생했습니다.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const persistDefaultShippingMode = async (mode: ShippingMode) => {
    if (isDisabled || isUpdating) return;
    if (mode === defaultShippingMode) return;

    onDefaultShippingModeChange(mode);
    setIsUpdating(true);
    try {
      const res = await apiFetch<any>({
        path: "/api/businesses/me?businessType=requestor",
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
          title: "기본 배송 방식 저장 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (e: any) {
      toast({
        title: "오류",
        description: e.message || "기본 배송 방식 저장 중 오류가 발생했습니다.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const modeCardClass = (active: boolean) =>
    cn(
      "w-full rounded-lg border bg-white/70 px-4 py-4 space-y-3 text-center transition-all cursor-pointer",
      active
        ? "border-primary ring-2 ring-primary/25 bg-primary/5 shadow-[0_0_0_1px_rgba(37,99,235,0.12)]"
        : "border-slate-200 hover:border-primary/40 hover:bg-slate-50/80",
      isDisabled && "opacity-50 cursor-not-allowed",
    );

  return (
    <div
      ref={containerRef}
      className="app-glass-card app-glass-card--lg relative flex flex-col justify-center gap-4 border-2 p-4 md:p-6 transition-all border-gray-300"
    >
      <div className="app-glass-card-content flex flex-col items-center gap-3">
        <div
          className="w-full flex flex-col gap-4"
          role="radiogroup"
          aria-label="기본 배송 방식"
        >
          <div
            role="radio"
            aria-checked={defaultShippingMode === "normal"}
            tabIndex={isDisabled || isUpdating ? -1 : 0}
            className={modeCardClass(defaultShippingMode === "normal")}
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
              묶음 배송
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className="text-sm text-slate-500 font-medium">발송일</div>
              <div
                ref={weekdaysRef}
                className={`flex gap-1 rounded-md px-1 py-1 transition-all ${
                  pulse
                    ? "bg-red-50 border border-red-300 ring-2 ring-red-200"
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
            <div className="text-sm text-red-500">묶음 배송일 복수 선택 권장</div>
            <div className="text-sm text-slate-600 leading-relaxed">
              선택한 요일 중 가장 먼저 도래한 날 모두 발송합니다.
              <br />
              공휴일은 쉬고 다음날 발송합니다.
            </div>
          </div>

          <div
            role="radio"
            aria-checked={defaultShippingMode === "express"}
            tabIndex={isDisabled || isUpdating ? -1 : 0}
            className={modeCardClass(defaultShippingMode === "express")}
            onClick={() => {
              void persistDefaultShippingMode("express");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void persistDefaultShippingMode("express");
              }
            }}
          >
            <div className="flex items-center justify-center gap-2 text-base font-medium text-foreground">
              <Zap className="w-5 h-5 text-amber-500" />
              신속 배송
            </div>
            <div className="text-base text-foreground leading-relaxed">
              오늘 낮 12시 이전 의뢰 시 오늘 오후 발송
            </div>
            <div className="text-sm text-slate-600 leading-relaxed">
              의뢰크레딧 {expressFeeLabel}원이 추가로 소비됩니다.
              <br />
              단, 생산지연시 내일 발송되고, 추가 의뢰크레딧은 취소됩니다.
            </div>
          </div>
        </div>
      </div>

      <div className="app-glass-card-content pt-1">
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
