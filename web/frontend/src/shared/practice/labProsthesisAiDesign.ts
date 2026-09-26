// 기공소 채팅 — 주문 치아와 확정된 스캔 역할로 보철 디자인 계획을 만든다.

import { scanKindToken } from "@/shared/files/modelPreviewFile";

export type LabOralScanRole = "upper" | "lower" | "bite" | "other";

export type LabProsthesisAiScan = {
  fileName: string;
  role: LabOralScanRole;
};

export type LabProsthesisAiTooth = {
  toothNumber: string;
  prosthesisType: string;
  /** 연결된 브리지 치아. 자기 번호는 제외 */
  linkedTeeth: string[];
  designable: boolean;
};

export type LabProsthesisAiPlan = {
  teeth: LabProsthesisAiTooth[];
  scans: LabProsthesisAiScan[];
  designableTeeth: LabProsthesisAiTooth[];
  missingRoles: Array<Exclude<LabOralScanRole, "other">>;
};

const MESH_EXT = /\.(stl|ply|obj|dcm)$/i;

export const ORAL_SCAN_ROLE_OPTIONS: LabOralScanRole[] = [
  "upper",
  "lower",
  "bite",
  "other",
];

export function isOralScanMeshName(fileName: string): boolean {
  return MESH_EXT.test(String(fileName || "").trim());
}

export function oralScanFileKey(file: {
  name: string;
  size: number;
  lastModified?: number;
}): string {
  return `${file.name}\0${file.size}\0${Number(file.lastModified || 0)}`;
}

/** 고정성 보철 학습·디자인 대상 */
const DESIGNABLE_TYPES = new Set(["크라운", "인레이", "온레이", "브리지"]);

const ROLE_ORDER: LabOralScanRole[] = ["upper", "lower", "bite", "other"];

export function classifyOralScanFileName(fileName: string): LabOralScanRole {
  const name = String(fileName || "").trim();
  if (!name || !MESH_EXT.test(name)) return "other";
  const token = scanKindToken(name);
  if (
    token === "bitescan" ||
    token === "bite" ||
    token.includes("occlusion") ||
    token.includes("바이트") ||
    token.includes("교합")
  ) {
    return "bite";
  }
  if (
    token === "upperjawscan" ||
    token === "upperjaw" ||
    token.includes("maxilla") ||
    token.includes("상악") ||
    token.includes("upper")
  ) {
    return "upper";
  }
  if (
    token === "lowerjawscan" ||
    token === "lowerjaw" ||
    token.includes("mandib") ||
    token.includes("하악") ||
    token.includes("lower")
  ) {
    return "lower";
  }
  return "other";
}

export function oralScanRoleLabel(role: LabOralScanRole): string {
  if (role === "upper") return "상악";
  if (role === "lower") return "하악";
  if (role === "bite") return "바이트";
  return "그 외";
}

export function isOralScanRole(value: string | null | undefined): value is LabOralScanRole {
  return (
    value === "upper" ||
    value === "lower" ||
    value === "bite" ||
    value === "other"
  );
}

/** 메시 업로드에 실을 파일명 구분. 메시가 아니면 null. */
export function filenameScanRoleFields(fileName: string): {
  scanRole: LabOralScanRole;
  scanRoleSetBy: "filename";
} | null {
  const name = String(fileName || "").trim();
  if (!isOralScanMeshName(name)) return null;
  return {
    scanRole: classifyOralScanFileName(name),
    scanRoleSetBy: "filename",
  };
}

/** 저장된 역할. 없으면 파일명 구분. 메시가 아니면 null. */
export function resolveOralScanRole(file: {
  fileName?: string | null;
  scanRole?: string | null;
}): LabOralScanRole | null {
  const stored = String(file.scanRole || "").trim();
  if (isOralScanRole(stored)) return stored;
  const fileName = String(file.fileName || "").trim();
  if (!isOralScanMeshName(fileName)) return null;
  return classifyOralScanFileName(fileName);
}

function oralScanSetByConfirmed(setBy: string | null | undefined): boolean {
  return setBy === "lab" || setBy === "practice";
}

/**
 * 기공소가 아직 확정하지 않았고, 파일명만으로 역할을 정하기 어려운 파일.
 * 바이트가 둘(BiteScan·BiteScan2)인 경우는 보통 스캔이라 제외한다.
 * 상악·하악이 겹치거나 그 외로 남은 파일을 반환한다.
 */
export function ambiguousOralScanFileKeys(
  files: ReadonlyArray<{
    s3Key?: string | null;
    fileName?: string | null;
    scanRole?: string | null;
    scanRoleSetBy?: string | null;
  }>,
): Set<string> {
  const rows = files
    .map((file) => {
      const key = String(file.s3Key || "").trim();
      const role = resolveOralScanRole({
        fileName: file.fileName,
        scanRole: file.scanRole,
      });
      return {
        key,
        role,
        confirmed: oralScanSetByConfirmed(file.scanRoleSetBy),
      };
    })
    .filter((row) => row.key && row.role);
  const counts = { upper: 0, lower: 0 };
  for (const row of rows) {
    if (row.role === "upper" || row.role === "lower") counts[row.role] += 1;
  }
  const ambiguous = new Set<string>();
  for (const row of rows) {
    if (!row.role || row.confirmed) continue;
    if (row.role === "other") ambiguous.add(row.key);
    if (
      (row.role === "upper" || row.role === "lower") &&
      counts[row.role] > 1
    ) {
      ambiguous.add(row.key);
    }
  }
  return ambiguous;
}

function normalizeToothNumber(value: unknown): string {
  return String(value || "").trim();
}

export function buildLabProsthesisAiPlan(input: {
  toothWorks?: ReadonlyArray<{
    toothNumber?: string | null;
    prosthesisType?: string | null;
    bridgeLinkedTeeth?: readonly string[] | null;
  }> | null;
  files?: ReadonlyArray<{
    fileName?: string | null;
    scanRole?: string | null;
  }> | null;
}): LabProsthesisAiPlan {
  const teeth: LabProsthesisAiTooth[] = [];
  for (const row of input.toothWorks || []) {
    const toothNumber = normalizeToothNumber(row?.toothNumber);
    if (!toothNumber) continue;
    const prosthesisType =
      String(row?.prosthesisType || "").trim() || "크라운";
    const linkedTeeth = (row?.bridgeLinkedTeeth || [])
      .map((n) => normalizeToothNumber(n))
      .filter((n) => n && n !== toothNumber);
    teeth.push({
      toothNumber,
      prosthesisType,
      linkedTeeth,
      designable: DESIGNABLE_TYPES.has(prosthesisType),
    });
  }

  const scans: LabProsthesisAiScan[] = (input.files || [])
    .map((file) => {
      const fileName = String(file?.fileName || "").trim();
      const stored = String(file?.scanRole || "").trim();
      const role =
        stored === "upper" ||
        stored === "lower" ||
        stored === "bite" ||
        stored === "other"
          ? stored
          : classifyOralScanFileName(fileName);
      return {
        fileName,
        role,
      };
    })
    .filter((row) => row.fileName)
    .sort(
      (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
    );

  const present = new Set(scans.map((row) => row.role));
  const missingRoles = (["upper", "lower", "bite"] as const).filter(
    (role) => !present.has(role),
  );
  const designableTeeth = teeth.filter((row) => row.designable);

  return { teeth, scans, designableTeeth, missingRoles };
}

export type LabJawArch = "upper" | "lower";

/** FDI 1·2 / 상악 → 상악, 3·4 / 하악 → 하악. */
export function labJawArchFromToothNumber(toothNumber: string): LabJawArch | null {
  const raw = String(toothNumber || "").trim();
  if (raw === "상악" || /^[12]/.test(raw)) return "upper";
  if (raw === "하악" || /^[34]/.test(raw)) return "lower";
  return null;
}

/** 주문 치아(지대치)가 있는 악. 상·하악이 함께 있으면 both. */
export function prepArchFromProsthesisTeeth(
  teeth: ReadonlyArray<Pick<LabProsthesisAiTooth, "toothNumber" | "linkedTeeth">>,
): LabJawArch | "both" | null {
  const arches = new Set<LabJawArch>();
  for (const tooth of teeth) {
    const own = labJawArchFromToothNumber(tooth.toothNumber);
    if (own) arches.add(own);
    for (const linked of tooth.linkedTeeth) {
      const arch = labJawArchFromToothNumber(linked);
      if (arch) arches.add(arch);
    }
  }
  if (arches.size === 0) return null;
  if (arches.size > 1) return "both";
  return arches.has("upper") ? "upper" : "lower";
}

/** 모달을 열 때 지대치 악만 켠다. 대합악·바이트는 숨긴다. */
export function initialLabOralScanVisible(
  role: LabOralScanRole,
  prepArch: LabJawArch | "both" | null,
): boolean {
  if (role !== "upper" && role !== "lower") return false;
  if (prepArch === "upper" || prepArch === "lower") return role === prepArch;
  return true;
}

export function formatProsthesisAiToothLabel(tooth: LabProsthesisAiTooth): string {
  const base = `#${tooth.toothNumber} ${tooth.prosthesisType}`;
  if (tooth.prosthesisType !== "브리지" || tooth.linkedTeeth.length === 0) {
    return base;
  }
  return `${base} (${tooth.linkedTeeth.join(", ")})`;
}
