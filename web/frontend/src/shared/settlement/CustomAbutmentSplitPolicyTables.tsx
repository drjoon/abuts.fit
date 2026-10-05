// change-log:
// - 2026-10-05: 제조·딜러 표 — 모바일은 구간 열 숨김·가로 스크롤 없음.
// - 2026-10-05: 제조 표 — 상단 탭(제조 44% 고정 / 어벗츠 40% 고정).
// - 2026-10-05: 제조 표 — 딜러와 같은 칩·표. 어벗츠 고정 후 나머지.
// - 2026-10-05: 딜러 표 — 커스텀어벗만. 제목 아래 설명 제거. 구간 칩·표만.
// - 2026-10-05: 딜러 표 — 스토어·커스텀어벗 공통 10~20% 누적 구간.
// - 2026-10-05: 딜러 표 — 구간 분배비·누적 분배비(세금 구간) 분리 설명.
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ABUTS_FIXED_SHARE_PCT,
  CUSTOM_ABUTMENT_SALE_WON,
  DEALER_MARGINAL_BANDS,
  DEVOPS_FROM_ABUTS_SHARE_PCT,
  MANUFACTURER_FIXED_BANDS,
  MANUFACTURER_FIXED_SHARE_PCT,
  MANUFACTURER_MARGINAL_BANDS,
  formatManwon,
  formatSharePct,
  splitAbutsFixedRows,
  splitManufacturerFixedRows,
  type CustomAbutmentSplitRow,
  type SplitMarginalBand,
} from "@/shared/settlement/customAbutmentSplitPolicy";

function SplitTable({
  columns,
  rows,
  framed = false,
  wide = false,
}: {
  columns: ReadonlyArray<{
    key: string;
    label: string;
    labelShort?: string;
    align?: "left" | "right";
    emphasize?: boolean;
    className?: string;
    cell: (row: CustomAbutmentSplitRow) => ReactNode;
  }>;
  rows: CustomAbutmentSplitRow[];
  framed?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={
        framed
          ? `min-w-0 rounded-xl border border-slate-200/80 bg-white px-1 py-1.5 shadow-sm sm:px-1.5 ${
              wide ? "overflow-x-auto" : "overflow-x-hidden"
            }`
          : `min-w-0 px-1 py-1.5 sm:px-1.5 ${wide ? "overflow-x-auto" : "overflow-x-hidden"}`
      }
    >
      <table
        className={
          wide
            ? "w-full min-w-[40rem] border-collapse text-sm"
            : "w-full min-w-0 table-fixed border-collapse text-[11px] sm:text-sm"
        }
      >
        <thead>
          <tr className="border-b border-slate-200 text-[10px] text-slate-500 sm:text-xs">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-1 py-1.5 font-medium sm:px-2.5 sm:py-2 sm:whitespace-nowrap ${
                  col.align === "left" ? "text-left" : "text-right"
                } ${col.emphasize ? "text-slate-800" : ""} ${col.className ?? ""}`}
              >
                {col.labelShort ? (
                  <>
                    <span className="sm:hidden">{col.labelShort}</span>
                    <span className="hidden sm:inline">{col.label}</span>
                  </>
                ) : (
                  col.label
                )}
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
                  className={`px-1 py-1.5 tabular-nums sm:px-2.5 sm:whitespace-nowrap ${
                    col.align === "left" ? "text-left" : "text-right"
                  } ${
                    col.emphasize
                      ? "font-semibold text-slate-900"
                      : "text-slate-700"
                  } ${col.className ?? ""}`}
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

function bandQtyLabel(band: SplitMarginalBand) {
  return band.toQty
    ? `${band.fromQty.toLocaleString("ko-KR")}~${band.toQty.toLocaleString("ko-KR")}개`
    : `${band.fromQty.toLocaleString("ko-KR")}개~`;
}

function DealerBandList() {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {DEALER_MARGINAL_BANDS.map((band) => (
        <li key={band.fromQty}>
          {bandQtyLabel(band)} {band.pct}%
        </li>
      ))}
    </ul>
  );
}

function BandPills({ bands }: { bands: ReadonlyArray<SplitMarginalBand> }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {bands.map((band) => (
        <div
          key={band.fromQty}
          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 shadow-sm"
        >
          <span className="text-[11px] leading-tight text-slate-500">
            {bandQtyLabel(band)}
          </span>
          <span className="text-sm font-semibold tabular-nums tracking-tight text-slate-900">
            {band.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

const MOBILE_HIDDEN_COL = "hidden sm:table-cell";

const qtyColumn = {
  key: "qty",
  label: "월 개수",
  align: "left" as const,
  cell: (row: CustomAbutmentSplitRow) => row.qty.toLocaleString("ko-KR"),
};

export function CustomAbutmentDealerSplitTable() {
  const rows = splitAbutsFixedRows();
  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 px-2 py-3 sm:px-3">
      <BandPills bands={DEALER_MARGINAL_BANDS} />
      <SplitTable
        framed
        rows={rows}
        columns={[
          qtyColumn,
          {
            key: "marginalPct",
            label: "구간 분배비",
            labelShort: "구간%",
            className: MOBILE_HIDDEN_COL,
            cell: (row) => formatSharePct(row.dealerMarginalPct),
          },
          {
            key: "bandWon",
            label: "구간 지급",
            labelShort: "구간",
            className: MOBILE_HIDDEN_COL,
            cell: (row) => formatManwon(row.dealerBandWon),
          },
          {
            key: "effectivePct",
            label: "누적 분배비",
            labelShort: "누적%",
            emphasize: true,
            cell: (row) => formatSharePct(row.dealerEffectivePct),
          },
          {
            key: "dealerWon",
            label: "누적 지급",
            labelShort: "누적",
            emphasize: true,
            cell: (row) => formatManwon(row.dealerWon),
          },
        ]}
      />
      <p className="px-0.5 text-xs leading-relaxed text-slate-500">
        의뢰비 {CUSTOM_ABUTMENT_SALE_WON.toLocaleString("ko-KR")}원 기준입니다.
      </p>
    </div>
  );
}

const manufacturerColumns = [
  qtyColumn,
  {
    key: "marginalPct",
    label: "구간 분배비",
    labelShort: "구간%",
    className: MOBILE_HIDDEN_COL,
    cell: (row: CustomAbutmentSplitRow) =>
      formatSharePct(row.manufacturerMarginalPct),
  },
  {
    key: "bandWon",
    label: "구간 지급",
    labelShort: "구간",
    className: MOBILE_HIDDEN_COL,
    cell: (row: CustomAbutmentSplitRow) =>
      formatManwon(row.manufacturerBandWon),
  },
  {
    key: "effectivePct",
    label: "누적 분배비",
    labelShort: "누적%",
    emphasize: true,
    cell: (row: CustomAbutmentSplitRow) =>
      formatSharePct(row.manufacturerEffectivePct),
  },
  {
    key: "manufacturerWon",
    label: "누적 지급",
    labelShort: "누적",
    emphasize: true,
    cell: (row: CustomAbutmentSplitRow) => formatManwon(row.manufacturerWon),
  },
];

function ManufacturerSplitPanel({
  bands,
  rows,
  note,
}: {
  bands: ReadonlyArray<SplitMarginalBand>;
  rows: CustomAbutmentSplitRow[];
  note: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 px-2 py-3 sm:px-3">
      <BandPills bands={bands} />
      <SplitTable framed rows={rows} columns={manufacturerColumns} />
      <p className="px-0.5 text-xs leading-relaxed text-slate-500">
        의뢰비 {CUSTOM_ABUTMENT_SALE_WON.toLocaleString("ko-KR")}원 기준입니다.
        <br />
        {note}
      </p>
    </div>
  );
}

export function CustomAbutmentManufacturerSplitTable() {
  return (
    <Tabs defaultValue="mfr-fixed" className="min-w-0 space-y-3">
      <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl bg-slate-100 p-1">
        <TabsTrigger value="mfr-fixed" className="rounded-lg text-xs sm:text-sm">
          제조 {MANUFACTURER_FIXED_SHARE_PCT}% 고정
        </TabsTrigger>
        <TabsTrigger
          value="abuts-fixed"
          className="rounded-lg text-xs sm:text-sm"
        >
          어벗츠 {ABUTS_FIXED_SHARE_PCT}% 고정
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mfr-fixed" className="mt-0 min-w-0">
        <ManufacturerSplitPanel
          bands={MANUFACTURER_FIXED_BANDS}
          rows={splitManufacturerFixedRows()}
          note="딜러 누진과 무관합니다."
        />
      </TabsContent>
      <TabsContent value="abuts-fixed" className="mt-0 min-w-0">
        <ManufacturerSplitPanel
          bands={MANUFACTURER_MARGINAL_BANDS}
          rows={splitAbutsFixedRows()}
          note="나머지에서 딜러 구간을 뺍니다."
        />
      </TabsContent>
    </Tabs>
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
        <SplitTable wide rows={abutsFixed} columns={adminColumns} />
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">
          제조 {MANUFACTURER_FIXED_SHARE_PCT}% 고정
        </h4>
        <p>
          나머지에서 딜러 누진을 뺀 뒤, 그 어벗츠 몫에서 개발운영을 뗍니다.
        </p>
        <SplitTable wide rows={mfrFixed} columns={adminColumns} />
      </div>
    </div>
  );
}
