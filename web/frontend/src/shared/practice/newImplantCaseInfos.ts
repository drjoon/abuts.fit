import type { CaseInfos } from "@/pages/requestor/new_request/hooks/newRequestTypes";

const text = (value: unknown) => String(value || "").trim();

export function isCustomImplantCaseInfos(
  ci: Partial<CaseInfos> | null | undefined,
): boolean {
  if (!ci) return false;
  if (ci.implantInputMode === "custom") return true;
  const nsr = ci.newSystemRequest;
  if (nsr?.requested === true) return true;
  return Boolean(
    text(nsr?.manufacturer) || text(nsr?.brand) || text(nsr?.family),
  );
}

export function buildNewSystemRequestPayload(
  ci: Partial<CaseInfos>,
): CaseInfos["newSystemRequest"] | undefined {
  const nsr = ci.newSystemRequest;
  const manufacturer = text(nsr?.manufacturer);
  const brand = text(nsr?.brand);
  const family = text(nsr?.family);
  if (!manufacturer || !brand || !family) return undefined;
  return {
    requested: true,
    manufacturer,
    brand,
    family,
    message: text(nsr?.message) || "랩아날로그와 기존 어벗 샘플을 요청드립니다",
    free: true,
    tag: text(nsr?.tag) || "신규 임플란트 의뢰",
  };
}

export function finalizeCustomImplantCaseUpdates(
  ci: Partial<CaseInfos>,
): Partial<CaseInfos> {
  const newSystemRequest = buildNewSystemRequestPayload(ci);
  if (!newSystemRequest) return {};
  return {
    implantInputMode: "custom",
    implantManufacturer: "",
    implantBrand: "",
    implantFamily: "",
    implantType: "",
    newSystemRequest,
  };
}

export function collectNewImplantAckLines(
  map: Record<string, CaseInfos> | undefined,
  fileKeys: Set<string>,
): string[] {
  if (!map) return [];
  const lines: string[] = [];
  for (const key of fileKeys) {
    const ci = map[key];
    if (!ci?.newSystemRequest?.requested) continue;
    const nsr = ci.newSystemRequest;
    const spec = [nsr.manufacturer, nsr.brand, nsr.family]
      .map(text)
      .filter(Boolean)
      .join(" / ");
    const tooth = text(ci.tooth);
    const patient = text(ci.patientName);
    const label = [patient, tooth ? `${tooth}번` : "", spec]
      .filter(Boolean)
      .join(" · ");
    if (label) lines.push(label);
  }
  return lines;
}
