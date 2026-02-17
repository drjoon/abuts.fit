import { cn } from "@/shared/ui/cn";

export function RequestorPricingReferralPolicyGuidance({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-4 pt-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-md">1. 기본 가격</h3>
        <p>커스텀 어벗 1개 주문 건당 기본 가격은 15,000원입니다.</p>
        <p>
          동일 환자·동일 치아번호에 대한 재의뢰(리메이크/수정 의뢰)는
          건당 10,000원으로 고정 제공됩니다.
        </p>
        <b>
          부가가치세(VAT)는 별도이며, 배송비는 1회 발송당 3,500원(공급가)
          으로 청구됩니다.
        </b>
        <p>
          배송비는 실제 제품 발송 시점에 크레딧에서 차감되며, 한 번의
          발송에 여러 제품이 포함되더라도 배송비는 1회만 부과됩니다.
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-md">2. 주문량 할인</h3>
        <p>
          최근 30일 동안의 커스텀 어벗 주문 건수에 따라 아래와 같이 자동
          할인됩니다.
        </p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>최근 30일 주문 건당 10원이 할인됩니다.</li>
          <li>
            최대 5,000원까지 할인되며, 할인 한도 도달 시 개당 10,000원이
            됩니다.
          </li>
          <li>
            예) 최근 30일 주문 500건 이상 시 커스텀 어벗 단가는 10,000원으로
            적용됩니다.
          </li>
        </ul>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-md">
          3. 리퍼럴 그룹 기반 주문량 합산
        </h3>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            본인과 본인이 직접 추천한 기공소(직계 1단계)의 주문량을 합산하여
            할인 단가를 계산합니다.
          </li>
          <li>
            예) A 기공소 → B 기공소(A의 리퍼럴) → C 기공소(B의 리퍼럴)인
            경우,
            <b>A는 A+B</b>의 주문량을 합산하고, <b>B는 B+C</b>의 주문량을
            합산합니다.
          </li>
        </ul>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-md">
          4. 주문량 집계 시점
        </h3>
        <p>
          주문량 집계는 매일 자정(00:00 기준) 업데이트되며, 적용 단가는
          업데이트 이후 발생하는 주문부터 반영됩니다.
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-md">
          5. 런칭 이벤트 (신규 기공소)
        </h3>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            신규 가입 기공소는 가입 승인일로부터 90일 동안 커스텀 어벗 단가를
            개당 10,000원으로 고정하여 제공합니다.
          </li>
          <li>
            해당 기간 동안에는 주문량 할인 정책과 무관하게 10,000원이 우선
            적용됩니다.
          </li>
          <li>이벤트 종료 시점은 추후 별도 공지를 통해 안내드립니다.</li>
        </ul>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-md">6. 의뢰 취소</h3>
        <p>
          의뢰 취소는 <b>의뢰, CAM</b> 단계에서만 가능합니다.
          <b>가공 단계부터는</b> 취소할 수 없습니다.
        </p>
      </section>
    </div>
  );
}
