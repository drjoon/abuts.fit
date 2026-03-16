import { generateModelNumber } from "@/utils/modelNumber";
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
  maxDiameter?: number | string | null;
  camDiameter?: number | string | null;
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
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
  maxDiameter,
  camDiameter,
  implantManufacturer,
  implantBrand,
  implantFamily,
  implantType,
}: Props) => {
  const businessName = String(business || "").trim();
  const clinic = String(clinicName || "").trim();
  const patient = String(patientName || "").trim() || "미지정";
  const t = String(tooth || "").trim() || "-";
  const rid = String(requestId || "").trim();
  const shortLot = String(lotShortCode || "")
    .trim()
    .toUpperCase();

  const desktopParts = [businessName, clinic, patient, t, rid].filter(Boolean);
  const mobileParts = [clinic, patient, t].filter(Boolean);

  const toNumberOrNull = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const resolvedMaxDia =
    toNumberOrNull(maxDiameter) ??
    toNumberOrNull(caseInfos?.maxDiameter) ??
    toNumberOrNull(caseInfos?.diameter);

  const resolvedCamDia =
    toNumberOrNull(camDiameter) ??
    toNumberOrNull(caseInfos?.camDiameter) ??
    toNumberOrNull(caseInfos?.productionSchedule?.diameter) ??
    toNumberOrNull(caseInfos?.materialDiameter);

  const formatDia = (value: number) =>
    value % 1 === 0 ? `${value}mm` : `${value.toFixed(1)}mm`;

  const implantParts = [
    implantManufacturer ?? caseInfos?.implantManufacturer,
    implantBrand ?? caseInfos?.implantBrand,
    implantFamily ?? caseInfos?.implantFamily,
    implantType ?? caseInfos?.implantType,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  const infoBadges =
    resolvedMaxDia || resolvedCamDia || implantParts.length ? (
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        {resolvedMaxDia ? (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold">
            최대 {formatDia(resolvedMaxDia)}
          </span>
        ) : null}
        {resolvedCamDia ? (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold">
            CAM {formatDia(resolvedCamDia)}
          </span>
        ) : null}
        {implantParts.length ? (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
            {implantParts.join(" / ")}
          </span>
        ) : null}
      </div>
    ) : null;

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
              {generateModelNumber(caseInfos, lotShortCode) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                  {generateModelNumber(caseInfos, lotShortCode)}
                </span>
              )}
            </div>
          ) : null}
        </div>
        {infoBadges}
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
              {generateModelNumber(caseInfos, lotShortCode) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                  {generateModelNumber(caseInfos, lotShortCode)}
                </span>
              )}
            </div>
          ) : null}
        </div>
        {infoBadges ? <div className="w-full">{infoBadges}</div> : null}
      </div>
    </div>
  );
};
