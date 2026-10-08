// related files:
// - web/backend/services/creditRevenuePolicy.service.js
// - web/frontend/src/shared/pricing/requestorUnitPricePolicy.ts
// change-log:
// - 2026-10-09: 딜러 표 아래 부가세·수수료 안내 삭제.
// - 2026-10-08: 누적 구간표 폐지. 거래처 판매가(1.2~1.5만)별 고정 분배표(제조 5,500 · 개발운영 1,000 · 어벗츠 3,500 · 나머지 딜러, 부가세 포함).
import { cn } from "@/shared/ui/cn";
import {
  REQUESTOR_UNIT_PRICE_BASE,
  REQUESTOR_UNIT_PRICE_MANUFACTURER_COST,
  REQUESTOR_UNIT_PRICE_DEALER_SUPPLY,
  DELIVERY_MONTHLY_FEE,
  REQUESTOR_UNIT_PRICE_MIN,
  dealerCommissionOf,
  formatRequestorWon,
} from "@/shared/pricing/requestorUnitPricePolicy";

const DEVOPS_WON = 1_000;
const ABUTS_WON = 3_500;
const STEP = 500;

type Party = "dealer" | "manufacturer" | "abuts" | "devops";

const PRICES: number[] = (() => {
  const out: number[] = [];
  for (let p = REQUESTOR_UNIT_PRICE_MIN; p <= REQUESTOR_UNIT_PRICE_BASE; p += STEP) {
    out.push(p);
  }
  return out;
})();

function SplitByPriceTable({ highlight }: { highlight: Party }) {
  const cols: { key: Party; label: string; won: (price: number) => number }[] = [
    { key: "manufacturer", label: "제조", won: () => REQUESTOR_UNIT_PRICE_MANUFACTURER_COST },
    { key: "devops", label: "개발운영", won: () => DEVOPS_WON },
    { key: "abuts", label: "어벗츠", won: () => ABUTS_WON },
    { key: "dealer", label: "딜러", won: (p) => dealerCommissionOf(p) },
  ];
  return (
    <div className="w-full space-y-2">
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.02]">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200/90 bg-slate-50/95 text-[11px] text-slate-500 sm:text-xs">
              <th className="px-2.5 py-2.5 text-left font-semibold sm:px-3.5">판매가</th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-2.5 py-2.5 text-right font-semibold sm:px-3.5",
                    c.key === highlight ? "text-slate-900" : "text-slate-500",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRICES.map((price, i) => (
              <tr
                key={price}
                className={cn(
                  "border-b border-slate-100/90 last:border-0",
                  i % 2 === 1 && "bg-slate-50/60",
                )}
              >
                <td className="px-2.5 py-2 text-left font-medium tabular-nums text-slate-900 sm:px-3.5">
                  {formatRequestorWon(price)}
                </td>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-2.5 py-2 text-right tabular-nums sm:px-3.5",
                      c.key === highlight
                        ? "font-semibold text-slate-900"
                        : "text-slate-700",
                    )}
                  >
                    {formatRequestorWon(c.won(price))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-0.5 text-xs leading-relaxed text-slate-500">
        어벗 1개당 · 부가세 포함, 원 단위입니다.
        <br />
        딜러가 없으면 딜러 몫은 어벗츠가 가져갑니다.
      </p>
    </div>
  );
}

/** 딜러에게는 매입가·판매가·월정액만 보인다(제조사·어벗츠 몫은 비공개). */
export function CustomAbutmentDealerSplitTable() {
  const rows: { label: string; value: string }[] = [
    { label: "매입가", value: `${formatRequestorWon(REQUESTOR_UNIT_PRICE_DEALER_SUPPLY)}원` },
    {
      label: "판매가",
      value: `딜러가 정함 (${formatRequestorWon(REQUESTOR_UNIT_PRICE_MIN)}~${formatRequestorWon(REQUESTOR_UNIT_PRICE_BASE)}원)`,
    },
    { label: "배송비", value: `월 ${formatRequestorWon(DELIVERY_MONTHLY_FEE)}원 · 딜러 부담` },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.02]">
      <dl className="divide-y divide-slate-100/90 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-slate-500">{r.label}</dt>
            <dd className="text-right font-semibold tabular-nums text-slate-900">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** 자기 몫만 보여준다(다른 당사자 금액은 관리자 화면에만). */
function OwnShareTable({ label, won }: { label: string; won: number }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
      <div className="text-xs text-slate-500">{label} · 어벗 1개당</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
        {formatRequestorWon(won)}원
      </div>
      <div className="mt-0.5 text-xs text-slate-500">부가세 포함 · 고정 금액</div>
    </div>
  );
}

export function CustomAbutmentManufacturerSplitTable() {
  return (
    <OwnShareTable label="제조사 몫" won={REQUESTOR_UNIT_PRICE_MANUFACTURER_COST} />
  );
}

export function CustomAbutmentAbutsSplitTable() {
  return <SplitByPriceTable highlight="abuts" />;
}

export function CustomAbutmentDevopsSplitTable() {
  return <OwnShareTable label="개발운영 몫" won={DEVOPS_WON} />;
}
