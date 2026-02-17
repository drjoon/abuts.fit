import React from "react";

type Props = {
  organization?: string | null;
  clinicName?: string | null;
  patientName?: string | null;
  tooth?: string | null;
  requestId?: string | null;
  lotNumber?: string | null;
  className?: string;
};

export const MachiningRequestLabel = ({
  organization,
  clinicName,
  patientName,
  tooth,
  requestId,
  lotNumber,
  className,
}: Props) => {
  const org = String(organization || "").trim();
  const clinic = String(clinicName || "").trim();
  const patient = String(patientName || "").trim() || "미지정";
  const t = String(tooth || "").trim() || "-";
  const rid = String(requestId || "").trim();

  const lotBadge = String(lotNumber || "").trim().slice(-3);

  const desktopParts = [org, clinic, patient, t, rid].filter(Boolean);
  const mobileParts = [clinic, patient, t].filter(Boolean);

  return (
    <div className={className || ""}>
      <div className="hidden md:flex flex-wrap items-center gap-2 text-sm text-slate-700 min-w-0">
        {desktopParts.length ? (
          desktopParts.map((part, idx) => (
            <React.Fragment key={`${idx}-${part}`}>
              {idx > 0 ? <span className="text-slate-400">/</span> : null}
              <span className="truncate" title={part}>
                {part}
              </span>
            </React.Fragment>
          ))
        ) : (
          <span className="truncate">-</span>
        )}
        {lotBadge ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            {lotBadge}
          </span>
        ) : null}
      </div>

      <div className="flex md:hidden flex-wrap items-center gap-2 text-sm text-slate-700 min-w-0">
        {mobileParts.length ? (
          mobileParts.map((part, idx) => (
            <React.Fragment key={`${idx}-${part}`}>
              {idx > 0 ? <span className="text-slate-400">/</span> : null}
              <span className="truncate" title={part}>
                {part}
              </span>
            </React.Fragment>
          ))
        ) : (
          <span className="truncate">-</span>
        )}
        {lotBadge ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            {lotBadge}
          </span>
        ) : null}
      </div>
    </div>
  );
};
