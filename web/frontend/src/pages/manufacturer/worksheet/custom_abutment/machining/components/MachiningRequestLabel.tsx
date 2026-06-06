// import { generateModelNumber } from "@/utils/modelNumber";
import React from "react";

type Props = {
  caseInfos?: any;
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
  hideRequestId?: boolean;
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
  hideRequestId,
}: Props) => {
  const businessName = String(business || "").trim();
  const clinic = String(clinicName || "").trim();
  const patient = String(patientName || "").trim() || "미지정";
  const t = String(tooth || "").trim() || "-";
  const rid = String(requestId || "").trim();
  const shortLot = String(lotShortCode || "")
    .trim()
    .toUpperCase();

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

  // 유지홈(retentionGroove) 표시 - rules.md §7.4.1
  // none=없음(0.1) / shallow=얕음(0.2) / deep=깊음(0.3)
  const retentionGroove = caseInfos?.retentionGroove as
    | "none"
    | "shallow"
    | "deep"
    | undefined;
  const retentionGrooveLabel = (() => {
    if (!retentionGroove) return "";
    return retentionGroove === "none"
      ? "없음"
      : retentionGroove === "shallow"
        ? "얕음"
        : "깊음";
  })();

  const retentionBadgeClass = (() => {
    const base =
      "inline-flex items-center rounded-full px-2 py-0.5 font-semibold ";
    if (retentionGroove === "none")
      return base + "border border-amber-100 bg-amber-50 text-amber-600";
    if (retentionGroove === "shallow")
      return base + "border border-amber-200 bg-amber-50 text-amber-700";
    if (retentionGroove === "deep")
      return base + "border border-amber-400 bg-amber-100 text-amber-900";
    return base + "border border-amber-100 bg-amber-50 text-amber-600";
  })();

  const renderInfoBadges = () => {
    if (!implantParts.length && !retentionGrooveLabel && !isSample) return null;

    return (
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        {isSample ? (
          <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 font-semibold text-purple-700">
            [R&D]
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
              {/*{generateModelNumber(caseInfos) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                  {generateModelNumber(caseInfos)}
                </span>
              )}*/}
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
              {/*{generateModelNumber(caseInfos) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                  {generateModelNumber(caseInfos)}
                </span>
              )}*/}
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
