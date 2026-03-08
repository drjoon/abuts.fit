import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type LeadTimeRange = { minBusinessDays: number; maxBusinessDays: number };
type DiameterKey = "d6" | "d8" | "d10" | "d12";

const DEFAULT_LEAD_TIMES: Record<DiameterKey, LeadTimeRange> = {
  d6: { minBusinessDays: 1, maxBusinessDays: 2 },
  d8: { minBusinessDays: 1, maxBusinessDays: 2 },
  d10: { minBusinessDays: 4, maxBusinessDays: 7 },
  d12: { minBusinessDays: 4, maxBusinessDays: 7 },
};

export const PricingPolicyDialog = ({ open, onOpenChange }: Props) => {
  const { token } = useAuthStore();
  const [leadTimes, setLeadTimes] = useState(DEFAULT_LEAD_TIMES);

  useEffect(() => {
    if (!open) return;
    if (!token) {
      setLeadTimes(DEFAULT_LEAD_TIMES);
      return;
    }
    const load = async () => {
      try {
        const res = await request<any>({
          path: `/api/requestor-organizations/manufacturer-lead-times`,
          method: "GET",
          token,
        });
        if (!res.ok) return;
        const data = res.data?.data || res.data || {};
        const serverLeadTimes = data?.leadTimes;
        const normalized: Record<DiameterKey, LeadTimeRange> = {
          ...DEFAULT_LEAD_TIMES,
        };
        (Object.keys(normalized) as DiameterKey[]).forEach((key) => {
          const entry = serverLeadTimes?.[key];
          if (!entry) return;
          const min = Number.isFinite(entry.minBusinessDays)
            ? Math.max(0, Math.floor(entry.minBusinessDays))
            : normalized[key].minBusinessDays;
          const max = Number.isFinite(entry.maxBusinessDays)
            ? Math.max(0, Math.floor(entry.maxBusinessDays))
            : normalized[key].maxBusinessDays;
          normalized[key] = {
            minBusinessDays: Math.min(min, max),
            maxBusinessDays: Math.max(min, max),
          };
        });
        setLeadTimes(normalized);
      } catch (err) {
        console.error("[PricingPolicyDialog] load leadTimes failed", err);
      }
    };
    void load();
  }, [open, token]);

  const renderLeadTimeLine = (label: string, key: DiameterKey) => {
    const min = leadTimes[key]?.minBusinessDays;
    const max = leadTimes[key]?.maxBusinessDays;
    const minText = Number.isFinite(min) ? min : "-";
    const maxText = Number.isFinite(max) ? max : "-";
    return (
      <p>
        {label}: <b>의뢰일 +{minText}영업일</b> (최대 +{maxText}영업일)
      </p>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>가격 & 리퍼럴 정책 안내</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 pt-2 text-sm text-muted-foreground">
              <section className="space-y-1">
                <h3 className="font-semibold text-foreground text-md">
                  1. 기본 가격
                </h3>
                <p>커스텀 어벗 기본 가격은 1개당 15,000원입니다.</p>
                <p>
                  동일 환자·동일 치아번호의 재의뢰(리메이크/수정)는 1건당
                  10,000원입니다.
                </p>
                <p>
                  <b>VAT는 별도</b>이며, 배송비는{" "}
                  <b>발송 1회당 3,500원(공급가)</b>
                  입니다.
                </p>
                <p>
                  배송비는 실제 발송 시 크레딧에서 차감되며, 한 번에 여러 제품을
                  보내도 1회만 부과됩니다.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="font-semibold text-foreground text-md">
                  2. 무료 크레딧(보너스)
                </h3>
                <p>
                  신규 가입 기공소는 가입 시{" "}
                  <b>가입축하 무료 크레딧 30,000원</b>이 1회 지급됩니다.
                </p>
                <p>
                  무료 크레딧은 <b>유료 크레딧과 같은 금액 기준</b>으로
                  사용됩니다.
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>커스텀 어벗 의뢰 결제에만 사용할 수 있습니다.</li>
                  <li>배송비에는 사용할 수 없습니다.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="font-semibold text-foreground text-md">
                  3. 주문량 할인
                </h3>
                <p>
                  <b>오늘 자정(KST 00:00) 기준 최근 30일</b> 완료 주문 수에 따라
                  자동 할인됩니다.
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>최근 30일 주문 건당 20원이 할인됩니다.</li>
                  <li>
                    최대 할인액은 5,000원이며, 250건 이상이면 개당 10,000원이
                    적용됩니다.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="font-semibold text-foreground text-md">
                  4. 리퍼럴 그룹 기반 주문량 합산
                </h3>
                <p>
                  할인 단가는 본인과 본인이 직접 추천한 기공소(직계 1단계)의
                  <b> 최근 30일 주문량</b>을 합산해 계산합니다.
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    예: A 기공소 → B 기공소(A의 리퍼럴) → C 기공소(B의 리퍼럴)인
                    경우, <b>A는 A+B</b>, <b>B는 B+C</b> 주문량을 합산합니다.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="font-semibold text-foreground text-md">
                  5. 주문량 집계 시점
                </h3>
                <p>
                  주문량은 <b>매일 자정(KST 00:00)</b>에 갱신되며, 그 시점 기준
                  최근 30일 데이터가 반영됩니다.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="font-semibold text-foreground text-md">
                  6. 런칭 이벤트(신규 기공소)
                </h3>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    신규 가입 기공소는 가입 승인일로부터 90일 동안 개당
                    10,000원에 이용할 수 있습니다.
                  </li>
                  <li>
                    이 기간에는 주문량 할인과 무관하게 10,000원이 우선
                    적용됩니다.
                  </li>
                  <li>종료 시점은 별도 공지로 안내드립니다.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="font-semibold text-foreground text-md">
                  7. 의뢰 취소
                </h3>
                <p>
                  의뢰 취소는 <b>의뢰·CAM 단계</b>에서만 가능하며,{" "}
                  <b>가공 단계부터는</b> 취소할 수 없습니다.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-foreground text-md">
                  8. 발송 리드타임 (최대 직경 기준)
                </h3>
                {renderLeadTimeLine("6mm", "d6")}
                {renderLeadTimeLine("8mm", "d8")}
                {renderLeadTimeLine("10mm", "d10")}
                {renderLeadTimeLine("12mm", "d12")}
              </section>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};
