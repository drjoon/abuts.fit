// change-log:
// - 2026-08-08: density=compact|full — 카드/재생목록은 필수 뱃지만, 상세 모달은 전체.
// - 2026-08-07: 모바일 라벨에도 의뢰자명(business) 표시.
// - 2026-08-06: 마감까지 남은 시간 뱃지(getDeadlineInfo) 표시. estimatedShipYmd 기반.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/utils/label.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
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
  /** compact: 카드/재생목록 — 필수 뱃지만. full: 상세 모달 — 기존 전체 */
  density?: "compact" | "full";
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
  density = "full",
}: Props) => {
  const compact = density === "compact";
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
  // compact: 출고 48시간 이내(또는 지남)만 표시 — 여유 건은 노이즈
  const urgentDeadline =
    deadlineInfo != null && deadlineInfo.remainingMs <= 48 * 60 * 60 * 1000;

  const desktopParts = [
    businessName,
    clinic,
    patient,
    t,
    hideRequestId ? null : rid,
  ].filter(Boolean);
  const mobileParts = [businessName, clinic, patient, t].filter(Boolean);

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

  const showNcBadge = (() => {
    const has =
      typeof hasNc === "boolean" ? hasNc : Boolean(caseInfos?.ncFile?.s3Key);
    // compact: NC 없을 때만 경고성으로 표시하지 않음 — 있으면 짧게, 없으면 생략
    // 계획: NC(없을 때만 또는 짧게) → has일 때 짧게 표시 유지하되 compact에서는 NC만
    return has;
  })();

  const chipBase =
    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap";

  const retentionBadgeClass = (() => {
    const base = `${chipBase} `;
    if (retentionGroove === "none" || retentionGroove === "shallow")
      return base + "border-amber-100 bg-amber-50 text-amber-600";
    if (retentionGroove === "deep")
      return base + "border-amber-400 bg-amber-100 text-amber-900";
    return base + "border-amber-100 bg-amber-50 text-amber-600";
  })();

  const renderInfoBadges = () => {
    const showDeadline = compact
      ? Boolean(deadlineInfo && urgentDeadline)
      : Boolean(deadlineInfo);
    const showNc = compact ? showNcBadge : showNcBadge;
    const showShipping = Boolean(shippingSource);
    const showRebalance = !compact && Boolean(showFastMachiningRebalance);
    const showSample = Boolean(isSample);
    const showImplant = !compact && implantParts.length > 0;
    const showRetention = !compact && Boolean(retentionGrooveLabel);

    if (
      !showDeadline &&
      !showNc &&
      !showShipping &&
      !showRebalance &&
      !showSample &&
      !showImplant &&
      !showRetention
    )
      return null;

    return (
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        {showDeadline && deadlineInfo ? (
          <span
            className={`${chipBase} ${deadlineInfo.badgeClass}`}
          >
            {deadlineInfo.displayText}
          </span>
        ) : null}
        {showNc ? (
          <span
            className={`${chipBase} border-cyan-200 bg-cyan-50 text-cyan-700`}
          >
            NC
          </span>
        ) : null}
        {showShipping && shippingSource ? (
          <ShippingModeBadge source={shippingSource} size="sm" />
        ) : null}
        {showRebalance ? (
          <span
            className={`${chipBase} border-violet-200 bg-violet-50 text-violet-700`}
          >
            빠른 가공 재배치
          </span>
        ) : null}
        {showSample ? (
          <span
            className={`${chipBase} ${
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
        {showImplant ? (
          <span
            className={`${chipBase} border-slate-200 bg-slate-50 text-slate-600`}
          >
            {implantParts.join(" / ")}
          </span>
        ) : null}
        {showRetention ? (
          <span className={retentionBadgeClass}>
            유지홈 {retentionGrooveLabel}
          </span>
        ) : null}
      </div>
    );
  };

  const lotChipClass = compact
    ? "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-900 text-white"
    : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900";

  const textClass = compact
    ? "text-[13px] font-semibold text-slate-800"
    : "text-sm text-slate-700";

  return (
    <div className={className || ""}>
      <div
        className={`hidden md:flex min-w-0 flex-wrap items-center justify-between gap-2 ${textClass}`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
            <span className={lotChipClass}>{shortLot}</span>
          ) : null}
        </div>
        {renderInfoBadges()}
      </div>

      <div
        className={`flex min-w-0 flex-wrap items-start gap-1.5 md:hidden ${textClass}`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
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
            <span className={lotChipClass}>{shortLot}</span>
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
