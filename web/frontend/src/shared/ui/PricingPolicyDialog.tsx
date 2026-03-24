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
  variant?: "default" | "devops" | "salesman";
};

type LeadTimeRange = { minBusinessDays: number; maxBusinessDays: number };
type DiameterKey = "d6" | "d8" | "d10" | "d12";

const DEFAULT_LEAD_TIMES: Record<DiameterKey, LeadTimeRange> = {
  d6: { minBusinessDays: 1, maxBusinessDays: 2 },
  d8: { minBusinessDays: 1, maxBusinessDays: 2 },
  d10: { minBusinessDays: 4, maxBusinessDays: 7 },
  d12: { minBusinessDays: 4, maxBusinessDays: 7 },
};

export const PricingPolicyDialog = ({
  open,
  onOpenChange,
  variant = "default",
}: Props) => {
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
          path: `/api/businesses/manufacturer-lead-times`,
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
          <DialogTitle>
            {variant === "devops"
              ? "개발운영사 분배 기준"
              : variant === "salesman"
                ? "영업자 수수료 정책"
                : "가격 & 소개 정책 안내"}
          </DialogTitle>
          <DialogDescription asChild>
            {variant === "salesman" ? (
              <div className="space-y-4 pt-2 text-sm text-muted-foreground">
                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    1. 직접 소개 수수료 (5%)
                  </h3>
                  <p>
                    영업자가 <b>직접 소개한 의뢰자</b>의 유료 매출의 <b>5%</b>를
                    수수료로 지급합니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>소개 관계 기준: 의뢰자 가입 시 입력한 영업자 코드</li>
                    <li>유료 매출 기준: 의뢰 결제 완료 시점 기준 집계</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    2. 간접 소개 수수료 (2.5%)
                  </h3>
                  <p>
                    내가 직접 소개한 <b>영업자</b>가 소개한 의뢰자 매출의{" "}
                    <b>2.5%</b>를 추가 수수료로 지급합니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      간접 소개는 1단계(직접 소개 영업자의 의뢰자)까지만 적용
                    </li>
                    <li>2단계 이상 간접 소개는 수수료 미적용</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    3. 집계 및 지급
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>수수료는 사업자 기준으로 매일 자정(00:00) 업데이트</li>
                    <li>지급 계좌는 설정 &gt; 결제에서 관리</li>
                    <li>정산 원장은 보유 크레딧 모달에서 확인 가능</li>
                  </ul>
                </section>
              </div>
            ) : variant === "devops" ? (
              <div className="space-y-4 pt-2 text-sm text-muted-foreground">
                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    1. 분배 구조
                  </h3>
                  <p>
                    개발운영사 정산은 <b>사업자 기준</b>으로 집계됩니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>직접 연결 매출: 5%</li>
                    <li>집계 기준 키: `businessAnchorId`</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    2. 네트워크 반영 기준
                  </h3>
                  <p>
                    소개자 미지정 가입 건도 운영 정책에 따라 개발운영사
                    네트워크에 반영될 수 있습니다.
                  </p>
                  <p>
                    직접 연결된 의뢰자 매출만 정산 대상이며, 간접 연결은 정산에
                    포함되지 않습니다.
                  </p>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    3. 화면 해석 기준
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>정산 예정액: 미지급 누적 금액</li>
                    <li>지급 완료액: 지급 완료 누적 금액</li>
                    <li>사업자 요약: 기간 기준 사업자별 매출/주문/정산 요약</li>
                    <li>정산 원장: 적립·정산·조정 내역 확인용</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    4. 확인 및 지급
                  </h3>
                  <p>
                    지급 계좌 정보는 <b>설정 &gt; 수익 분배</b>에서 관리합니다.
                  </p>
                  <p>
                    원장과 요약 카드의 수치는 동일한 집계 기준을 사용하며, 지급
                    반영은 원장 기록을 기준으로 확인합니다.
                  </p>
                </section>
              </div>
            ) : (
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
                    배송비는 실제 발송 시 크레딧에서 차감되며, 한 번에 여러
                    제품을 보내도 1회만 부과됩니다.
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
                    <b>오늘 자정(KST 00:00) 기준 최근 30일</b> 완료 주문 수에
                    따라 자동 할인됩니다.
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
                    4. 소개 그룹 기반 주문량 합산
                  </h3>
                  <p>
                    할인 단가는 본인 사업자와 본인 사업자가{" "}
                    <b>직접 소개한 기공소</b>의<b> 최근 30일 주문량</b>을 합산해
                    계산합니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      예: A 기공소가 B, C 기공소를 직접 소개하고, B 기공소가 D
                      기공소를 소개한 경우 →{" "}
                      <b>A, B, C는 같은 그룹(합산 할인)</b>, D는 별도 그룹
                    </li>
                    <li>
                      같은 그룹 내 모든 사업자는 동일한 할인율을 적용받습니다.
                    </li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    5. 주문량 집계 시점
                  </h3>
                  <p>
                    주문량은 <b>매일 자정(KST 00:00)</b>에 갱신되며, 그 시점
                    기준 최근 30일 데이터가 반영됩니다.
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
                    <b>가공 단계부터는</b>
                    취소할 수 없습니다.
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
            )}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};
