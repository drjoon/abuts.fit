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
    const hasSameDayNote = Number(minText) === 1;
    return (
      <p>
        {label}: <b>기준 +{minText}영업일</b> (최대 +{maxText}영업일)
        {hasSameDayNote ? " · 자정(0시)까지 접수 시 당일 집하 가능" : ""}
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
                    1. 소개 수수료 (10%)
                  </h3>
                  <p>
                    소개한 의뢰자의 유료의뢰비에서 <b>10%</b>가 수수료로
                    지급됩니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>소개 관계 기준: 의뢰자 가입 시 입력한 영업자 코드</li>
                    <li>집계 범위: 1단계 소개만 포함</li>
                    <li>유료 매출 기준: 의뢰 결제 완료 시점</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    2. 집계 및 지급
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>매일 자정(KST 00:00) 사업자 기준으로 업데이트</li>
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
                    개발·운영사는 유료의뢰비 기준 <b>10%</b>가 정산됩니다.
                  </p>
                  <p>
                    영업자 소개 유무와 무관하게 개발·운영사 비율은 동일합니다.
                  </p>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    2. 네트워크 반영
                  </h3>
                  <p>
                    영업자 소개 없이 가입한 의뢰 건은 제조사 65% / 관리자 25% /
                    개발·운영사 10% 규칙이 적용됩니다.
                  </p>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    3. 화면 안내
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>정산 예정액: 미지급 누적 금액</li>
                    <li>지급 완료액: 지급 완료 누적 금액</li>
                    <li>사업자 요약: 기간별 사업자 매출·주문·정산 요약</li>
                    <li>정산 원장: 적립·정산·조정 내역</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    4. 지급 계좌
                  </h3>
                  <p>
                    지급 계좌 정보는 <b>설정 &gt; 수익 분배</b>에서 관리합니다.
                  </p>
                </section>
              </div>
            ) : (
              <div className="space-y-4 pt-2 text-sm text-muted-foreground">
                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    1. 기본 가격
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      커스텀 어벗: <b>1개당 15,000원</b>
                    </li>
                    <li>
                      리메이크 무료: <b>사업자(기공소) 기준 월 3건까지 0원</b>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        (동일 치과·환자·치식, 최근 90일 조건 충족 건에 한함 /
                        3건 초과 시 건당 10,000원 적용)
                      </span>
                    </li>
                    <li>
                      배송비: <b>발송 1회당 3,500원</b> — 한 번에 여러 제품을
                      보내도 1회만 부과
                    </li>
                    <li>VAT 별도</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    2. 가입 축하 무료 크레딧
                  </h3>
                  <p>
                    신규 가입 기공소에 <b>30,000원</b>이 1회 지급됩니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>커스텀 어벗 의뢰 결제에만 사용 가능</li>
                    <li>배송비에는 사용할 수 없습니다.</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    3. 주문량 할인
                  </h3>
                  <p>
                    <b>최근 30일 완료 주문 수</b>에 따라 자동 할인됩니다. (매일
                    자정 KST 기준 갱신)
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>주문 1건당 100원 할인</li>
                    <li>최대 5,000원 할인 (50건 이상 시 개당 10,000원 고정)</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    4. 소개 그룹 합산
                  </h3>
                  <p>
                    할인 단가는{" "}
                    <b>나를 소개한 기공소 + 나 + 내가 소개한 기공소</b>의 최근
                    30일 주문량을 합산해 계산합니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      각 사업자의 할인 단가는 자신이 속한 모든 그룹 구성원의
                      주문량을 합산해 개별 계산합니다.
                    </li>
                    <li>
                      예: A가 B·C를 소개하고, B가 D를 소개한 경우
                      <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                        <li>A: A+B+C 합산 (자녀: B·C)</li>
                        <li>B: A+B+D 합산 (부모: A, 자녀: D)</li>
                        <li>C: A+C 합산 (부모: A, 자녀 없음)</li>
                        <li>D: B+D 합산 (부모: B, 자녀 없음)</li>
                      </ul>
                    </li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    5. 런칭 이벤트 (신규 기공소)
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      가입 승인일로부터 <b>90일간 개당 10,000원</b> 고정 적용
                    </li>
                    <li>이 기간에는 주문량 할인과 무관하게 우선 적용됩니다.</li>
                    <li>종료 시점은 별도 공지로 안내드립니다.</li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    6. 의뢰 취소
                  </h3>
                  <p>
                    <b>의뢰·CAM 단계</b>에서만 취소 가능하며,{" "}
                    <b>가공 단계부터는 취소할 수 없습니다.</b>
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="font-semibold text-foreground text-md">
                    7. 발송 리드타임 (최대 직경 기준)
                  </h3>
                  <p>
                    KST 기준 <b>자정(0시)까지</b> 접수 건은 1영업일 리드타임의
                    경우 당일 집하로 계산되고,{" "}
                    <b>자정 이후 접수 건부터는 익영업일</b> 기준으로 계산됩니다.
                  </p>
                  {renderLeadTimeLine("6mm", "d6")}
                  {renderLeadTimeLine("8mm", "d8")}
                  {renderLeadTimeLine("10mm", "d10")}
                  {renderLeadTimeLine("12mm", "d12")}
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    8. 배송 일정 (시간 안내, KST)
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      <b>0시</b>: 당일 의뢰 접수 마감
                    </li>
                    <li>
                      <b>15:00</b>: 포장 마감 후 택배 수거 신청
                    </li>
                    <li>
                      <b>16:00</b>: 택배 집하
                    </li>
                  </ul>
                </section>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};
