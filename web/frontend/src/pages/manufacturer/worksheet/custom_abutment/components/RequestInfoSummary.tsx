// change-log:
// - 2026-08-04: 환자 줄=`치과명 / 환자명 / 치아`, 기공소명은 상단 1회만. 기공소=치과 동일 시 치과명 중복 생략.
// - 2026-08-04: layout=row 지원. PreviewModal은 가로 3열, 카드는 stack 유지.
// - 2026-08-04: 의뢰카드/프리뷰 공통 정보 블록. 환자·임플란트·생산 단위로 묶고 중복(치과명 등) 제거.
// related files:
// - web/frontend/rules.md
// - .cursor/rules/worksheet-request-info-ui.mdc
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
import { Fragment, type ReactNode } from "react";

export type RequestInfoSummaryProps = {
  /** 기공소명(의뢰 사업자). 상단 조직 줄에만 사용 */
  requestorLabel?: string | null;
  clinicName?: string | null;
  createdAt?: string | Date | null;
  patientName?: string | null;
  tooth?: string | number | null;
  connectionDiameter?: number | null;
  maxDiameter?: number | null;
  maxLength?: number | null;
  implantParts?: Array<string | null | undefined>;
  retentionGrooveLabel?: string | null;
  productionMetaItems?: string[];
  /** STL 오버레이에 동일 치수가 있을 때 요약에서 생략 */
  omitGeometryMetrics?: boolean;
  /** stack=카드(세로), row=프리뷰(가로 3열) */
  layout?: "stack" | "row";
  className?: string;
  /** 카드 본문 앞에 붙일 보조 배지/상태 행 */
  leadingSlot?: ReactNode;
};

/** 기공소명·치과명이 같거나 포함 관계면 true */
export function isSameOrgLabel(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/** @deprecated 조직 줄은 기공소만, 환자 줄은 치과/환자/치아로 분리. 호환용 유지 */
export function resolveOrgLabels(
  requestorLabel?: string | null,
  clinicName?: string | null,
): string[] {
  const requestor = String(requestorLabel || "").trim();
  const clinic = String(clinicName || "").trim();
  if (!requestor && !clinic) return [];
  if (!requestor) return [clinic];
  if (!clinic) return [requestor];
  if (isSameOrgLabel(requestor, clinic)) {
    return [requestor.length >= clinic.length ? requestor : clinic];
  }
  return [requestor, clinic];
}

function formatCreatedAt(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR");
}

function Dot() {
  return <span className="text-slate-300 select-none" aria-hidden>•</span>;
}

function MetaRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] leading-snug text-slate-700">
      {children}
    </div>
  );
}

function Section({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 min-w-0 ${className}`}>
      <div className="text-[10px] font-semibold tracking-wide text-slate-400">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function joinParts(parts: Array<string | null | undefined>): string {
  const cleaned = parts
    .map((p) => String(p || "").trim())
    .filter((p) => p && p !== "-");
  if (!cleaned.length) return "";
  return cleaned.join(" / ");
}

export function RequestInfoSummary({
  requestorLabel,
  clinicName,
  createdAt,
  patientName,
  tooth,
  connectionDiameter,
  maxDiameter,
  maxLength,
  implantParts,
  retentionGrooveLabel,
  productionMetaItems,
  omitGeometryMetrics = false,
  layout = "stack",
  className = "",
  leadingSlot,
}: RequestInfoSummaryProps) {
  const labName = String(requestorLabel || "").trim();
  const clinic = String(clinicName || "").trim();
  const dateLabel = formatCreatedAt(createdAt);
  const patient = String(patientName || "").trim() || "미지정";
  const toothLabel = String(tooth ?? "").trim() || "-";
  // 기공소가 이미 상단에 있으면 동일/포함 치과명은 환자 줄에서 생략
  const clinicOnPatientLine =
    clinic && !isSameOrgLabel(labName, clinic) ? clinic : "";
  const patientIdentityLine = [clinicOnPatientLine, patient, toothLabel]
    .filter(Boolean)
    .join(" / ");
  const implantLine = joinParts(implantParts || []);
  const retention = String(retentionGrooveLabel || "").trim();
  const productionItems = (productionMetaItems || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const geometryItems: string[] = [];
  if (!omitGeometryMetrics) {
    if (connectionDiameter != null && Number.isFinite(connectionDiameter)) {
      geometryItems.push(`커넥션 Ø${connectionDiameter.toFixed(2)}`);
    }
    if (maxDiameter != null && Number.isFinite(maxDiameter)) {
      geometryItems.push(`최대 Ø${maxDiameter.toFixed(3)}`);
    }
    if (maxLength != null && Number.isFinite(maxLength)) {
      geometryItems.push(`길이 ${maxLength.toFixed(2)}`);
    }
  }

  const hasPatient =
    !!labName ||
    !!dateLabel ||
    !!clinic ||
    !!patientName ||
    !!tooth;
  const hasImplant =
    !!implantLine || geometryItems.length > 0 || !!retention;
  const hasProduction = productionItems.length > 0;
  const isRow = layout === "row";
  const sectionCount = [hasPatient, hasImplant, hasProduction].filter(
    Boolean,
  ).length;
  const rowGridClass =
    sectionCount <= 1
      ? "md:grid-cols-1"
      : sectionCount === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-3";
  const sectionDividerClass = "md:pr-3 md:border-r md:border-slate-200/80";
  const sectionPadStartClass = "md:pl-3";

  if (!hasPatient && !hasImplant && !hasProduction && !leadingSlot) {
    return null;
  }

  const patientSection = hasPatient ? (
    <Section
      label="환자"
      className={
        isRow && (hasImplant || hasProduction) ? sectionDividerClass : ""
      }
    >
      {(labName || dateLabel) && (
        <MetaRow>
          {labName && (
            <span className="font-medium text-slate-800">{labName}</span>
          )}
          {dateLabel && (
            <>
              {labName ? <Dot /> : null}
              <span className="tabular-nums text-slate-600">{dateLabel}</span>
            </>
          )}
        </MetaRow>
      )}
      <MetaRow>
        <span>{patientIdentityLine}</span>
      </MetaRow>
    </Section>
  ) : null;

  const implantSection = hasImplant ? (
    <Section
      label="임플란트"
      className={[
        isRow && hasPatient ? sectionPadStartClass : "",
        isRow && hasProduction ? sectionDividerClass : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {implantLine && (
        <MetaRow>
          <span className="font-medium text-slate-800">{implantLine}</span>
          {retention && (
            <>
              <Dot />
              <span className="text-slate-600">유지홈 {retention}</span>
            </>
          )}
        </MetaRow>
      )}
      {!implantLine && retention && (
        <MetaRow>
          <span className="text-slate-600">유지홈 {retention}</span>
        </MetaRow>
      )}
      {geometryItems.length > 0 && (
        <MetaRow>
          {geometryItems.map((item, idx) => (
            <Fragment key={item}>
              {idx > 0 && <Dot />}
              <span className="tabular-nums text-slate-600">{item}</span>
            </Fragment>
          ))}
        </MetaRow>
      )}
    </Section>
  ) : null;

  const productionSection = hasProduction ? (
    <Section
      label="생산"
      className={
        isRow && (hasPatient || hasImplant) ? sectionPadStartClass : ""
      }
    >
      <MetaRow>
        {productionItems.map((item, idx) => (
          <Fragment key={`${item}-${idx}`}>
            {idx > 0 && <Dot />}
            <span className="text-slate-600">{item}</span>
          </Fragment>
        ))}
      </MetaRow>
    </Section>
  ) : null;

  return (
    <div
      className={`rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 ${
        isRow ? "py-2 space-y-2" : "py-2.5 space-y-2.5"
      } ${className}`}
    >
      {leadingSlot}

      <div
        className={
          isRow
            ? `grid grid-cols-1 gap-2.5 ${rowGridClass} md:gap-0 md:items-start`
            : "space-y-2.5"
        }
      >
        {patientSection}
        {implantSection}
        {productionSection}
      </div>
    </div>
  );
}

export default RequestInfoSummary;
