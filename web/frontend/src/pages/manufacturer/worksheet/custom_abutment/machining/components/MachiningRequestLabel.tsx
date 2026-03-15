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

  return (
    <div className={className || ""}>
      <div className="hidden md:flex flex-wrap items-center gap-2 text-sm text-slate-700 min-w-0">
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

      <div className="flex md:hidden flex-wrap items-center gap-2 text-sm text-slate-700 min-w-0">
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
    </div>
  );
};
