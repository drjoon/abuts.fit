// change-log:
// - 2026-08-06: 마감까지 남은 시간 뱃지(getDeadlineInfo) 표시. estimatedShipYmd 기반.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/utils/label.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// import { generateModelNumber } from "@/utils/modelNumber";
import React from "react";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import type { ShippingModeSource } from "@/shared/shipping/shippingMode";
import { getDeadlineInfo } from "../../utils/request";

type Props = {
  caseInfos?: any;
  hasNc?: boolean | null;
  business?: string | null;
  clinicName?: string | null;
  patientName?: string | null;
  tooth?: string | null;
  requestId?: string | null;
  lotShortCode?: string | null;
  className?: string;
  camDiameter?: number | string | null;
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  isSample?: boolean | null;
  isRndArchivedSample?: boolean | null;
  isCopiedSample?: boolean | null;
  hideRequestId?: boolean;
  shippingSource?: ShippingModeSource;
  showFastMachiningRebalance?: boolean | null;
  estimatedShipYmd?: string | null;
};

export const MachiningRequestLabel = ({
  business,
  clinicName,
  patientName,
  tooth,
  requestId,
  lotShortCode,
  className,
  caseInfos,
  camDiameter,
  implantManufacturer,
  implantBrand,
  implantFamily,
  isSample,
  isRndArchivedSample,
  isCopiedSample,
  hasNc,
  hideRequestId,
  shippingSource,
  showFastMachiningRebalance,
  estimatedShipYmd,
}: Props) => {
  const businessName = String(business || "").trim();
  const clinic = String(clinicName || "").trim();
  const patient = String(patientName || "").trim() || "미지정";
  const t = String(tooth || "").trim() || "-";
  const rid = String(requestId || "").trim();
  const shortLot = String(lotShortCode || "")
    .trim()
    .toUpperCase();
  const shipYmd = String(
    estimatedShipYmd || caseInfos?.timeline?.estimatedShipYmd || "",
  ).trim();
  const deadlineInfo = getDeadlineInfo(null, shipYmd || null);

  const desktopParts = [
    businessName,
    clinic,
    patient,
    t,
    hideRequestId ? null : rid,
  ].filter(Boolean);
  const mobileParts = [clinic, patient, t].filter(Boolean);

  const implantParts = [
    implantManufacturer ?? caseInfos?.implantManufacturer,
    implantBrand ?? caseInfos?.implantBrand,
    implantFamily ?? caseInfos?.implantFamily,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  // 유지홈(retentionGroove) 표시
  // none=없음 / shallow=없음 / deep=있음
  const retentionGroove = caseInfos?.retentionGroove as
    | "none"
    | "shallow"
    | "deep"
    | undefined;
  const retentionGrooveLabel = (() => {
    if (!retentionGroove) return "";
    return retentionGroove === "deep" ? "있음" : "없음";
  })();

  const showNcBadge =
    typeof hasNc === "boolean" ? hasNc : Boolean(caseInfos?.ncFile?.s3Key);

  const retentionBadgeClass = (() => {
    const base =
      "inline-flex items-center rounded-full px-2 py-0.5 font-semibold ";
    if (retentionGroove === "none" || retentionGroove === "shallow")
      return base + "border border-amber-100 bg-amber-50 text-amber-600";
    if (retentionGroove === "deep")
      return base + "border border-amber-400 bg-amber-100 text-amber-900";
    return base + "border border-amber-100 bg-amber-50 text-amber-600";
  })();

  const renderInfoBadges = () => {
    if (
      !implantParts.length &&
      !retentionGrooveLabel &&
      !isSample &&
      !showNcBadge &&
      !shippingSource &&
      !showFastMachiningRebalance &&
      !deadlineInfo
    )
      return null;

    return (
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        {deadlineInfo ? (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold whitespace-nowrap ${deadlineInfo.badgeClass}`}
          >
            {deadlineInfo.displayText}
          </span>
        ) : null}
        {showNcBadge ? (
          <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-extrabold text-cyan-700">
            NC
          </span>
        ) : null}
        {shippingSource ? (
          <ShippingModeBadge source={shippingSource} size="sm" />
        ) : null}
        {showFastMachiningRebalance ? (
          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-extrabold text-violet-700">
            빠른 가공 재배치
          </span>
        ) : null}
        {isSample ? (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${
              isRndArchivedSample
                ? "border-purple-200 bg-purple-50 text-purple-700"
                : "border-blue-200 bg-blue-50 text-blue-700"
            }`}
          >
            {isRndArchivedSample
              ? "R&D"
              : isCopiedSample
                ? "복사샘플"
                : "샘플"}
          </span>
        ) : null}
        {implantParts.length ? (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
            {implantParts.join(" / ")}
          </span>
        ) : null}
        {retentionGrooveLabel ? (
          <span className={retentionBadgeClass}>
            유지홈 {retentionGrooveLabel}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className={className || ""}>
      <div className="hidden md:flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {desktopParts.length ? (
            desktopParts.map((part, idx) => (
              <span key={`${idx}-${part}`} className="flex items-center gap-1">
                {idx > 0 ? <span className="text-slate-400">/</span> : null}
                <span className="truncate" title={part}>
                  {part}
                </span>
              </span>
            ))
          ) : (
            <span className="truncate">-</span>
          )}
          {shortLot ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
                {shortLot}
              </span>
            </div>
          ) : null}
        </div>
        {renderInfoBadges()}
      </div>

      <div className="flex min-w-0 flex-wrap items-start gap-2 text-sm text-slate-700 md:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {mobileParts.length ? (
            mobileParts.map((part, idx) => (
              <span key={`${idx}-${part}`} className="flex items-center gap-1">
                {idx > 0 ? <span className="text-slate-400">/</span> : null}
                <span className="truncate" title={part}>
                  {part}
                </span>
              </span>
            ))
          ) : (
            <span className="truncate">-</span>
          )}
          {shortLot ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
                {shortLot}
              </span>
            </div>
          ) : null}
        </div>
        {(() => {
          const badges = renderInfoBadges();
          return badges ? <div className="w-full">{badges}</div> : null;
        })()}
      </div>
    </div>
  );
};
