// change-log:
// - 2026-10-07: 제조 표 — 의뢰비 1만원 기준으로 계산.
// - 2026-10-07: 분배 표 — 전폭·헤더·줄무늬·호버·열 비율로 가독성 개선.
// - 2026-10-07: 제조 표 — 누적 분배비 열 제거(구간과 동일 고정).
// - 2026-10-07: 제조 표 — 하단 의뢰비·분배 안내 제거(팩트 카드로 이동).
// - 2026-10-07: 제조 표 — 전 구간 49.5% 상단 칩 제거(표만).
// - 2026-10-07: 제조·어벗츠 표 — 제조 49.5% 고정만. 제조44%/어벗츠40% 탭 제거.
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
import { cn } from "@/shared/ui/cn";
import {
  ABUTS_NET_MFR_FIXED_BANDS,
  CUSTOM_ABUTMENT_SALE_WON,
  CUSTOM_ABUTMENT_SALE_WON_10K,
  CUSTOM_ABUTMENT_SPLIT_QTY_ROWS,
  DEALER_MARGINAL_BANDS,
  DEVOPS_FIXED_BANDS,
  DEVOPS_FROM_ABUTS_SHARE_PCT,
  MANUFACTURER_FIXED_SHARE_PCT,
  formatManwon,
  formatSharePct,
  splitAbutsFixedRows,
  splitManufacturerFixedRows,
  type CustomAbutmentSplitRow,
  type SplitMarginalBand,
} from "@/shared/settlement/customAbutmentSplitPolicy";

type SplitColumn = {
  key: string;
  label: string;
  labelShort?: string;
  align?: "left" | "right";
  emphasize?: boolean;
  className?: string;
  /** table-fixed 열 비율(예: w-[22%]). */
  widthClass?: string;
  cell: (row: CustomAbutmentSplitRow) => ReactNode;
};

function SplitTable({
  columns,
  rows,
  framed = false,
  wide = false,
}: {
  columns: ReadonlyArray<SplitColumn>;
  rows: CustomAbutmentSplitRow[];
  framed?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 w-full",
        framed &&
          "overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.02]",
        wide ? "overflow-x-auto" : "overflow-x-hidden",
      )}
    >
      <table
        className={cn(
          "w-full border-collapse text-sm",
          wide ? "min-w-[40rem]" : "min-w-0 table-fixed",
        )}
      >
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} className={col.widthClass} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200/90 bg-slate-50/95 text-[11px] text-slate-500 sm:text-xs">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-2.5 py-2.5 font-semibold tracking-tight sm:px-3.5 sm:whitespace-nowrap",
                  col.align === "left" ? "text-left" : "text-right",
                  col.emphasize ? "text-slate-800" : "text-slate-500",
                  col.className,
                )}
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
          {rows.map((row, index) => (
            <tr
              key={row.qty}
              className={cn(
                "border-b border-slate-100/90 last:border-0 transition-colors hover:bg-sky-50/50",
                index % 2 === 1 && "bg-slate-50/60",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-2.5 py-2 tabular-nums tracking-tight sm:px-3.5 sm:whitespace-nowrap",
                    col.align === "left" ? "text-left" : "text-right",
                    col.emphasize
                      ? "font-semibold text-slate-900"
                      : "text-slate-700",
                    col.className,
                  )}
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
            {formatSharePct(band.pct)}
          </span>
        </div>
      ))}
    </div>
  );
}

const MOBILE_HIDDEN_COL = "hidden sm:table-cell";

const qtyColumn: SplitColumn = {
  key: "qty",
  label: "월 개수",
  align: "left",
  widthClass: "w-[22%]",
  cell: (row) => (
    <span className="font-medium text-slate-900">
      {row.qty.toLocaleString("ko-KR")}
    </span>
  ),
};

const dealerColumns: SplitColumn[] = [
  { ...qtyColumn, widthClass: "w-[18%]" },
  {
    key: "marginalPct",
    label: "구간 분배비",
    labelShort: "구간%",
    className: MOBILE_HIDDEN_COL,
    widthClass: "w-[18%]",
    cell: (row) => formatSharePct(row.dealerMarginalPct),
  },
  {
    key: "bandWon",
    label: "구간 지급",
    labelShort: "구간",
    className: MOBILE_HIDDEN_COL,
    widthClass: "w-[20%]",
    cell: (row) => formatManwon(row.dealerBandWon),
  },
  {
    key: "effectivePct",
    label: "누적 분배비",
    labelShort: "누적%",
    emphasize: true,
    widthClass: "w-[22%]",
    cell: (row) => formatSharePct(row.dealerEffectivePct),
  },
  {
    key: "dealerWon",
    label: "누적 지급",
    labelShort: "누적",
    emphasize: true,
    widthClass: "w-[22%]",
    cell: (row) => formatManwon(row.dealerWon),
  },
];

export function CustomAbutmentDealerSplitTable() {
  const saleUnitWon = CUSTOM_ABUTMENT_SALE_WON_10K;
  const rows = splitAbutsFixedRows(CUSTOM_ABUTMENT_SPLIT_QTY_ROWS, saleUnitWon);
  return (
    <div className="w-full space-y-3">
      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-2.5 py-3 sm:px-3">
        <BandPills bands={DEALER_MARGINAL_BANDS} />
      </div>
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
}): SplitColumn[] {
  return [
    { ...qtyColumn, widthClass: "w-[18%]" },
    {
      key: "marginalPct",
      label: "구간 분배비",
      labelShort: "구간%",
      className: MOBILE_HIDDEN_COL,
      widthClass: "w-[18%]",
      cell: (row) => formatSharePct(pick.marginalPct(row)),
    },
    {
      key: "bandWon",
      label: "구간 지급",
      labelShort: "구간",
      className: MOBILE_HIDDEN_COL,
      widthClass: "w-[20%]",
      cell: (row) => formatManwon(pick.bandWon(row)),
    },
    {
      key: "effectivePct",
      label: "누적 분배비",
      labelShort: "누적%",
      emphasize: true,
      widthClass: "w-[22%]",
      cell: (row) => formatSharePct(pick.effectivePct(row)),
    },
    {
      key: "won",
      label: "누적 지급",
      labelShort: "누적",
      emphasize: true,
      widthClass: "w-[22%]",
      cell: (row) => formatManwon(pick.won(row)),
    },
  ];
}

const manufacturerColumns: SplitColumn[] = [
  { ...qtyColumn, widthClass: "w-[22%]" },
  {
    key: "marginalPct",
    label: "구간 분배비",
    labelShort: "구간%",
    className: MOBILE_HIDDEN_COL,
    widthClass: "w-[20%]",
    cell: (row) => formatSharePct(row.manufacturerMarginalPct),
  },
  {
    key: "bandWon",
    label: "구간 지급",
    labelShort: "구간",
    className: MOBILE_HIDDEN_COL,
    widthClass: "w-[29%]",
    cell: (row) => formatManwon(row.manufacturerBandWon),
  },
  {
    key: "won",
    label: "누적 지급",
    labelShort: "누적",
    emphasize: true,
    widthClass: "w-[29%]",
    cell: (row) => formatManwon(row.manufacturerWon),
  },
];

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
  showSaleNote = true,
}: {
  bands?: ReadonlyArray<SplitMarginalBand>;
  rows: CustomAbutmentSplitRow[];
  columns: ReadonlyArray<SplitColumn>;
  note?: ReactNode;
  showSaleNote?: boolean;
}) {
  const footer =
    showSaleNote || note ? (
      <p className="px-0.5 text-xs leading-relaxed text-slate-500">
        {showSaleNote ? (
          <>의뢰비 {CUSTOM_ABUTMENT_SALE_WON.toLocaleString("ko-KR")}원 기준입니다.</>
        ) : null}
        {note ? (
          <>
            {showSaleNote ? <br /> : null}
            {note}
          </>
        ) : null}
      </p>
    ) : null;
  return (
    <div className="w-full space-y-3">
      {bands?.length ? (
        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-2.5 py-3 sm:px-3">
          <BandPills bands={bands} />
        </div>
      ) : null}
      <SplitTable framed rows={rows} columns={columns} />
      {footer}
    </div>
  );
}

export function CustomAbutmentManufacturerSplitTable() {
  return (
    <PartySplitPanel
      rows={splitManufacturerFixedRows(
        CUSTOM_ABUTMENT_SPLIT_QTY_ROWS,
        CUSTOM_ABUTMENT_SALE_WON_10K,
      )}
      columns={manufacturerColumns}
      showSaleNote={false}
    />
  );
}

export function CustomAbutmentAbutsSplitTable() {
  return (
    <PartySplitPanel
      bands={ABUTS_NET_MFR_FIXED_BANDS}
      rows={splitManufacturerFixedRows()}
      columns={abutsNetColumns}
      note={
        <>
          제조 {formatSharePct(MANUFACTURER_FIXED_SHARE_PCT)} 고정 후 나머지입니다.
          <br />
          딜러 구간과 개발운영 {DEVOPS_FROM_ABUTS_SHARE_PCT}%를 뺍니다.
        </>
      }
    />
  );
}

export function CustomAbutmentDevopsSplitTable() {
  return (
    <PartySplitPanel
      bands={DEVOPS_FIXED_BANDS}
      rows={splitManufacturerFixedRows()}
      columns={devopsColumns}
      note="어벗츠 몫에서 뺍니다."
    />
  );
}
