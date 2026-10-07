// change-log:
// - 2026-10-07: 딜러 표 — 의뢰비 건당 1만원 고정(1만·1.3만 탭 제거).
// - 2026-10-07: 딜러 표 — 의뢰비 건당 1만·1.3만 탭.
// - 2026-10-05: 어벗츠·개발운영 표 — 딜러·제조와 같은 칩·표.
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
  ABUTS_NET_FIXED_BANDS,
  ABUTS_NET_FIXED_SHARE_PCT,
  ABUTS_NET_MFR_FIXED_BANDS,
  CUSTOM_ABUTMENT_SALE_WON,
  CUSTOM_ABUTMENT_SALE_WON_10K,
  CUSTOM_ABUTMENT_SPLIT_QTY_ROWS,
  DEALER_MARGINAL_BANDS,
  DEVOPS_FIXED_BANDS,
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

const dealerColumns = [
  qtyColumn,
  {
    key: "marginalPct",
    label: "구간 분배비",
    labelShort: "구간%",
    className: MOBILE_HIDDEN_COL,
    cell: (row: CustomAbutmentSplitRow) =>
      formatSharePct(row.dealerMarginalPct),
  },
  {
    key: "bandWon",
    label: "구간 지급",
    labelShort: "구간",
    className: MOBILE_HIDDEN_COL,
    cell: (row: CustomAbutmentSplitRow) => formatManwon(row.dealerBandWon),
  },
  {
    key: "effectivePct",
    label: "누적 분배비",
    labelShort: "누적%",
    emphasize: true,
    cell: (row: CustomAbutmentSplitRow) =>
      formatSharePct(row.dealerEffectivePct),
  },
  {
    key: "dealerWon",
    label: "누적 지급",
    labelShort: "누적",
    emphasize: true,
    cell: (row: CustomAbutmentSplitRow) => formatManwon(row.dealerWon),
  },
];

export function CustomAbutmentDealerSplitTable() {
  const saleUnitWon = CUSTOM_ABUTMENT_SALE_WON_10K;
  const rows = splitAbutsFixedRows(CUSTOM_ABUTMENT_SPLIT_QTY_ROWS, saleUnitWon);
  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 px-2 py-3 sm:px-3">
      <BandPills bands={DEALER_MARGINAL_BANDS} />
      <SplitTable framed rows={rows} columns={dealerColumns} />
      <p className="px-0.5 text-xs leading-relaxed text-slate-500">
        의뢰비 {saleUnitWon.toLocaleString("ko-KR")}원 기준입니다.
      </p>
    </div>
  );
}

function partyColumns(pick: {
  marginalPct: (row: CustomAbutmentSplitRow) => number;
  bandWon: (row: CustomAbutmentSplitRow) => number;
  effectivePct: (row: CustomAbutmentSplitRow) => number;
  won: (row: CustomAbutmentSplitRow) => number;
}) {
  return [
    qtyColumn,
    {
      key: "marginalPct",
      label: "구간 분배비",
      labelShort: "구간%",
      className: MOBILE_HIDDEN_COL,
      cell: (row: CustomAbutmentSplitRow) =>
        formatSharePct(pick.marginalPct(row)),
    },
    {
      key: "bandWon",
      label: "구간 지급",
      labelShort: "구간",
      className: MOBILE_HIDDEN_COL,
      cell: (row: CustomAbutmentSplitRow) => formatManwon(pick.bandWon(row)),
    },
    {
      key: "effectivePct",
      label: "누적 분배비",
      labelShort: "누적%",
      emphasize: true,
      cell: (row: CustomAbutmentSplitRow) =>
        formatSharePct(pick.effectivePct(row)),
    },
    {
      key: "won",
      label: "누적 지급",
      labelShort: "누적",
      emphasize: true,
      cell: (row: CustomAbutmentSplitRow) => formatManwon(pick.won(row)),
    },
  ];
}

const manufacturerColumns = partyColumns({
  marginalPct: (row) => row.manufacturerMarginalPct,
  bandWon: (row) => row.manufacturerBandWon,
  effectivePct: (row) => row.manufacturerEffectivePct,
  won: (row) => row.manufacturerWon,
});

const abutsNetColumns = partyColumns({
  marginalPct: (row) => row.abutsNetMarginalPct,
  bandWon: (row) => row.abutsNetBandWon,
  effectivePct: (row) => row.abutsNetEffectivePct,
  won: (row) => row.abutsNetWon,
});

const devopsColumns = partyColumns({
  marginalPct: (row) => row.devopsMarginalPct,
  bandWon: (row) => row.devopsBandWon,
  effectivePct: () => DEVOPS_FROM_ABUTS_SHARE_PCT,
  won: (row) => row.devopsWon,
});

function PartySplitPanel({
  bands,
  rows,
  columns,
  note,
}: {
  bands: ReadonlyArray<SplitMarginalBand>;
  rows: CustomAbutmentSplitRow[];
  columns: ReturnType<typeof partyColumns>;
  note?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 px-2 py-3 sm:px-3">
      <BandPills bands={bands} />
      <SplitTable framed rows={rows} columns={columns} />
      <p className="px-0.5 text-xs leading-relaxed text-slate-500">
        의뢰비 {CUSTOM_ABUTMENT_SALE_WON.toLocaleString("ko-KR")}원 기준입니다.
        {note ? (
          <>
            <br />
            {note}
          </>
        ) : null}
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
        <PartySplitPanel
          bands={MANUFACTURER_FIXED_BANDS}
          rows={splitManufacturerFixedRows()}
          columns={manufacturerColumns}
          note="딜러 누진과 무관합니다."
        />
      </TabsContent>
      <TabsContent value="abuts-fixed" className="mt-0 min-w-0">
        <PartySplitPanel
          bands={MANUFACTURER_MARGINAL_BANDS}
          rows={splitAbutsFixedRows()}
          columns={manufacturerColumns}
          note="나머지에서 딜러 구간을 뺍니다."
        />
      </TabsContent>
    </Tabs>
  );
}

export function CustomAbutmentAbutsSplitTable() {
  return (
    <Tabs defaultValue="abuts-fixed" className="min-w-0 space-y-3">
      <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl bg-slate-100 p-1">
        <TabsTrigger
          value="abuts-fixed"
          className="rounded-lg text-xs sm:text-sm"
        >
          어벗츠 {ABUTS_FIXED_SHARE_PCT}% 고정
        </TabsTrigger>
        <TabsTrigger value="mfr-fixed" className="rounded-lg text-xs sm:text-sm">
          제조 {MANUFACTURER_FIXED_SHARE_PCT}% 고정
        </TabsTrigger>
      </TabsList>
      <TabsContent value="abuts-fixed" className="mt-0 min-w-0">
        <PartySplitPanel
          bands={ABUTS_NET_FIXED_BANDS}
          rows={splitAbutsFixedRows()}
          columns={abutsNetColumns}
          note={`개발운영 ${DEVOPS_FROM_ABUTS_SHARE_PCT}%를 뺀 순 ${ABUTS_NET_FIXED_SHARE_PCT}%입니다.`}
        />
      </TabsContent>
      <TabsContent value="mfr-fixed" className="mt-0 min-w-0">
        <PartySplitPanel
          bands={ABUTS_NET_MFR_FIXED_BANDS}
          rows={splitManufacturerFixedRows()}
          columns={abutsNetColumns}
          note={`나머지에서 딜러 구간과 개발운영 ${DEVOPS_FROM_ABUTS_SHARE_PCT}%를 뺍니다.`}
        />
      </TabsContent>
    </Tabs>
  );
}

export function CustomAbutmentDevopsSplitTable() {
  return (
    <PartySplitPanel
      bands={DEVOPS_FIXED_BANDS}
      rows={splitAbutsFixedRows()}
      columns={devopsColumns}
      note="어벗츠 몫에서 뗍니다. 제조·어벗츠 고정안과 무관합니다."
    />
  );
}
