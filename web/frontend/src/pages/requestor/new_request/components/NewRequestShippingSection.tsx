import { Button } from "@/components/ui/button";
import { FunctionalItemCard } from "@/shared/ui/components/FunctionalItemCard";
import { Truck } from "lucide-react";
import type { CaseInfos } from "../hooks/newRequestTypes";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useNavigate } from "react-router-dom";

type Props = {
  caseInfos?: CaseInfos;
  setCaseInfos: (updates: Partial<CaseInfos>) => void;
  disabled?: boolean;
  highlight: boolean;
  sectionHighlightClass: string;
  weeklyBatchLabel: string;
  onOpenShippingSettings?: () => void;
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
  caseInfos,
  setCaseInfos,
  disabled,
  highlight,
  sectionHighlightClass,
  weeklyBatchLabel,
  onOpenShippingSettings,
  onSubmit,
}: Props) {
  const isDisabled = !!disabled;
  const { toast } = useToast();
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const weekdaysRef = useRef<HTMLDivElement | null>(null);
  const [pulse, setPulse] = useState(false);

  // Listen custom event to highlight this section and scroll into view
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
    const loadWeeklyBatchDays = async () => {
      if (!token) return;
      try {
        const res = await apiFetch<any>({
          path: "/api/requestor-organizations/me",
          method: "GET",
          token,
        });
        if (res.ok && res.data?.data?.shippingPolicy?.weeklyBatchDays) {
          setSelectedDays(res.data.data.shippingPolicy.weeklyBatchDays);
        }
      } catch (e) {
        console.error("Failed to load weeklyBatchDays:", e);
      }
    };
    void loadWeeklyBatchDays();
  }, [token]);

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
        path: "/api/requestor-organizations/me",
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

  const bulkLabelText = weeklyBatchLabel || "미설정";
  const holidayRolloverNote = "공휴일은 다음날 발송합니다";
  return (
    <div
      ref={containerRef}
      className={`app-glass-card app-glass-card--lg relative flex flex-col justify-center gap-2 border-2 p-4 md:p-6 transition-all border-gray-300`}
    >
      <div className="app-glass-card-content space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            <div className="flex flex-col items-center">
              <span className="text-lg font-medium text-foreground">
                묶음 배송
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="text-sm text-slate-500 font-medium mr-1 flex items-center gap-2">
              발송일:
            </div>
            <div
              ref={weekdaysRef}
              className={`flex gap-1 rounded-md px-1 py-1 transition-all ${
                pulse
                  ? "bg-red-50 border border-red-300 ring-2 ring-red-200"
                  : ""
              }`}
            >
              {WEEKDAYS.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => toggleDay(day.key)}
                  disabled={isDisabled || isUpdating}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
        </div>
      </div>

      <div className="mt-2 text-center text-sm text-slate-600">
        {holidayRolloverNote}
      </div>

      <div className="app-glass-card-content space-y-3 pt-4 border-gray-200">
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
