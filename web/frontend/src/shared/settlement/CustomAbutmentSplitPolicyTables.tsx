// change-log:
// - 2026-10-05: 딜러 표 — 구간 분배비·누적 분배비(세금 구간) 분리 설명.
import type { ReactNode } from "react";
import {
  ABUTS_FIXED_SHARE_PCT,
  CUSTOM_ABUTMENT_SALE_WON,
  DEALER_MARGINAL_BANDS,
  DEVOPS_FROM_ABUTS_SHARE_PCT,
  MANUFACTURER_FIXED_SHARE_PCT,
  formatManwon,
  formatSharePct,
  splitAbutsFixedRows,
  splitManufacturerFixedRows,
  type CustomAbutmentSplitRow,
} from "@/shared/settlement/customAbutmentSplitPolicy";

function SplitTable({
  columns,
  rows,
}: {
  columns: ReadonlyArray<{
    key: string;
    label: string;
    align?: "left" | "right";
    cell: (row: CustomAbutmentSplitRow) => ReactNode;
  }>;
  rows: CustomAbutmentSplitRow[];
}) {
  return (
    <div className="overflow-x-auto px-1.5 py-1.5">
      <table className="w-full min-w-[22rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-2 py-2 font-medium ${
                  col.align === "left" ? "text-left" : "text-right"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.qty}
              className="border-b border-slate-100 last:border-0"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`whitespace-nowrap px-2 py-1.5 tabular-nums ${
                    col.align === "left" ? "text-left" : "text-right"
                  }`}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealerBandList() {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {DEALER_MARGINAL_BANDS.map((band) => (
        <li key={band.fromQty}>
          {band.toQty
            ? `${band.fromQty.toLocaleString("ko-KR")}~${band.toQty.toLocaleString("ko-KR")}개 ${band.pct}%`
            : `${band.fromQty.toLocaleString("ko-KR")}개 초과 ${band.pct}%`}
        </li>
      ))}
    </ul>
  );
}

const qtyColumn = {
  key: "qty",
  label: "월 개수",
  align: "left" as const,
  cell: (row: CustomAbutmentSplitRow) => row.qty.toLocaleString("ko-KR"),
};

export function CustomAbutmentDealerSplitTable() {
  const rows = splitAbutsFixedRows();
  return (
    <div className="space-y-3">
      <p>
        커스텀어벗 의뢰비 {CUSTOM_ABUTMENT_SALE_WON.toLocaleString("ko-KR")}원
        대비입니다.
        <br />
        소득세처럼 구간마다 요율이 달라지고, 앞 구간은 낮은 요율을 유지합니다.
        <br />
        금액은 부가세 포함입니다.
      </p>
      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold text-slate-800">구간 분배비</h4>
        <p>
          그 구간에 들어간 개수에만 적용하는 요율입니다.
          <br />
          3,000개면 1~1,000개는 10%, 1,001~2,000개는 12%, 2,001~3,000개만
          14%입니다.
        </p>
        <DealerBandList />
      </div>
      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold text-slate-800">누적 분배비</h4>
        <p>
          그달 전체 의뢰비 합 대비 딜러 지급 합의 비율입니다.
          <br />
          실효세율과 같습니다. 3,000개면 구간 마지막은 14%여도 누적은 12%입니다.
        </p>
      </div>
      <SplitTable
        rows={rows}
        columns={[
          qtyColumn,
          {
            key: "marginalPct",
            label: "구간 분배비",
            cell: (row) => formatSharePct(row.dealerMarginalPct),
          },
          {
            key: "bandWon",
            label: "구간 지급",
            cell: (row) => formatManwon(row.dealerBandWon),
          },
          {
            key: "effectivePct",
            label: "누적 분배비",
            cell: (row) => formatSharePct(row.dealerEffectivePct),
          },
          {
            key: "dealerWon",
            label: "누적 지급",
            cell: (row) => formatManwon(row.dealerWon),
          },
        ]}
      />
    </div>
  );
}

export function CustomAbutmentManufacturerSplitTables() {
  const abutsFixed = splitAbutsFixedRows();
  const mfrFixed = splitManufacturerFixedRows();
  const mfrColumns = [
    qtyColumn,
    {
      key: "mfrPct",
      label: "제조 실효",
      cell: (row: CustomAbutmentSplitRow) =>
        formatSharePct(row.manufacturerEffectivePct),
    },
    {
      key: "mfrWon",
      label: "제조",
      cell: (row: CustomAbutmentSplitRow) => formatManwon(row.manufacturerWon),
    },
  ];
  return (
    <div className="space-y-4">
      <p>
        커스텀어벗 의뢰비 {CUSTOM_ABUTMENT_SALE_WON.toLocaleString("ko-KR")}원
        대비입니다.
        <br />
        딜러는 1천 개 단위 10~20% 누진입니다. 금액은 부가세 포함입니다.
      </p>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">
          어벗츠 {ABUTS_FIXED_SHARE_PCT}% 고정
        </h4>
        <p>
          나머지에서 딜러 누진을 뺀 금액이 제조 몫입니다.
        </p>
        <SplitTable rows={abutsFixed} columns={mfrColumns} />
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">
          제조 {MANUFACTURER_FIXED_SHARE_PCT}% 고정
        </h4>
        <p>딜러 누진과 무관하게 의뢰비의 {MANUFACTURER_FIXED_SHARE_PCT}%입니다.</p>
        <SplitTable rows={mfrFixed} columns={mfrColumns} />
      </div>
    </div>
  );
}

const adminColumns = [
  qtyColumn,
  {
    key: "dealerMarginal",
    label: "딜러 구간",
    cell: (row: CustomAbutmentSplitRow) =>
      formatSharePct(row.dealerMarginalPct),
  },
  {
    key: "dealerPct",
    label: "딜러 누적",
    cell: (row: CustomAbutmentSplitRow) =>
      formatSharePct(row.dealerEffectivePct),
  },
  {
    key: "mfrPct",
    label: "제조 실효",
    cell: (row: CustomAbutmentSplitRow) =>
      formatSharePct(row.manufacturerEffectivePct),
  },
  {
    key: "mfrWon",
    label: "제조",
    cell: (row: CustomAbutmentSplitRow) => formatManwon(row.manufacturerWon),
  },
  {
    key: "dealerWon",
    label: "딜러",
    cell: (row: CustomAbutmentSplitRow) => formatManwon(row.dealerWon),
  },
  {
    key: "abutsGross",
    label: "어벗츠 차감 전",
    cell: (row: CustomAbutmentSplitRow) => formatManwon(row.abutsGrossWon),
  },
  {
    key: "devops",
    label: `개발운영 ${DEVOPS_FROM_ABUTS_SHARE_PCT}%`,
    cell: (row: CustomAbutmentSplitRow) => formatManwon(row.devopsWon),
  },
  {
    key: "abutsNet",
    label: "어벗츠 순",
    cell: (row: CustomAbutmentSplitRow) => formatManwon(row.abutsNetWon),
  },
];

export function CustomAbutmentAdminSplitTables() {
  const abutsFixed = splitAbutsFixedRows();
  const mfrFixed = splitManufacturerFixedRows();
  return (
    <div className="space-y-4">
      <p>
        커스텀어벗 의뢰비 {CUSTOM_ABUTMENT_SALE_WON.toLocaleString("ko-KR")}원
        대비입니다.
        <br />
        딜러는 소득세처럼 구간 분배비(그 구간 개수에만)와 누적 분배비(그달 전체
        대비)를 씁니다.
        <br />
        개발운영 {DEVOPS_FROM_ABUTS_SHARE_PCT}%는 어벗츠 몫에서 뗍니다.
        <br />
        표 금액은 각 주체 부가세 포함입니다. 배송비는 이 표에 없습니다.
      </p>
      <DealerBandList />
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">
          어벗츠 {ABUTS_FIXED_SHARE_PCT}% 고정
        </h4>
        <p>
          차감 전 {ABUTS_FIXED_SHARE_PCT}%에서 개발운영{" "}
          {DEVOPS_FROM_ABUTS_SHARE_PCT}%를 뺀 금액이 어벗츠 순입니다.
        </p>
        <SplitTable rows={abutsFixed} columns={adminColumns} />
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">
          제조 {MANUFACTURER_FIXED_SHARE_PCT}% 고정
        </h4>
        <p>
          나머지에서 딜러 누진을 뺀 뒤, 그 어벗츠 몫에서 개발운영을 뗍니다.
        </p>
        <SplitTable rows={mfrFixed} columns={adminColumns} />
      </div>
    </div>
  );
}
