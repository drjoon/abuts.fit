// change-log:
// - 2026-11-28: 구강스캔 묶음 toothWorks → 어벗 1개당 caseInfo 1건(스캔 files 공유).
// related files:
// - docs/intent/oral-scan-bundle-multi-abutment.md
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestSubmitV2.ts
// - web/frontend/src/pages/requestor/new_request/components/NewRequestDetailsSection.tsx
// - web/frontend/src/pages/requestor/new_request/utils/patientGroups.ts

import { isCustomAbutmentWork } from "@/shared/practice/labFeeSchedule";
import {
  formatImplantSummary,
  hasToothWorkImplantPreset,
  normalizeToothWorks,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import type { CaseInfos } from "../hooks/newRequestTypes";

const TOOTH_NUMBER_RE = /^[1-4][1-8]$/;

export function listCustomAbutmentToothWorks(
  toothWorks: ToothWorkSelection[] | undefined | null,
): ToothWorkSelection[] {
  return normalizeToothWorks(Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) =>
      isCustomAbutmentWork(row) &&
      TOOTH_NUMBER_RE.test(String(row.toothNumber || "").trim()),
  );
}

/** 구강스캔 공유 모달·카드에 쓸 어벗 행(치아번호·임플란트 요약). */
export function summarizeOralScanAbutmentCard(row: ToothWorkSelection): {
  toothNumber: string;
  implantSummary: string;
} {
  const toothNumber = String(row.toothNumber || "").trim();
  const implantSummary = formatImplantSummary(row) || "임플란트 미입력";
  return { toothNumber, implantSummary };
}

/**
 * 구강스캔(묶음·단일) 확인 검증.
 * 치식의 커스텀어벗마다 치아번호·임플란트가 있어야 한다.
 */
export function missingFieldsForOralScanAbutments(
  caseInfos: Partial<CaseInfos> | null | undefined,
): string[] {
  const missing: string[] = [];
  if (!String(caseInfos?.clinicName || "").trim()) missing.push("치과이름");
  if (!String(caseInfos?.patientName || "").trim()) missing.push("환자이름");

  const abutments = listCustomAbutmentToothWorks(caseInfos?.toothWorks);
  if (abutments.length === 0) {
    missing.push("커스텀어벗 치식");
    return missing;
  }

  const incomplete = abutments.filter((row) => !hasToothWorkImplantPreset(row));
  if (incomplete.length > 0) {
    missing.push(
      `임플란트(${incomplete
        .map((row) => String(row.toothNumber || "").trim())
        .filter(Boolean)
        .join(", ")})`,
    );
  }
  return missing;
}

/**
 * 공유 caseInfos + 스캔 파일 payload를 어벗 치아 수만큼 복제한다.
 * 의뢰 1건 = 커스텀어벗 1개. 스캔 file/files는 동일.
 */
export function expandCasePayloadsForOralScanAbutments<T extends Record<string, unknown>>(
  basePayload: T & {
    tooth?: string;
    toothWorks?: ToothWorkSelection[];
    implantManufacturer?: string;
    implantBrand?: string;
    implantFamily?: string;
    implantType?: string;
    implantInputMode?: string;
    newSystemRequest?: unknown;
  },
): T[] {
  const abutments = listCustomAbutmentToothWorks(
    basePayload.toothWorks as ToothWorkSelection[] | undefined,
  );
  if (abutments.length === 0) {
    return [basePayload];
  }

  return abutments.map((work) => {
    const tooth = String(work.toothNumber || "").trim();
    return {
      ...basePayload,
      tooth,
      implantManufacturer: work.implantManufacturer,
      implantBrand: work.implantBrand,
      implantFamily: work.implantFamily,
      implantType: work.implantType,
      implantInputMode: "catalog",
      newSystemRequest: undefined,
      toothWorks: [work],
      workType: "abutment",
      productMode: "custom_abutment",
    } as T;
  });
}
