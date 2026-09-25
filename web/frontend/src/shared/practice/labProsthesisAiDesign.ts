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

export function formatProsthesisAiToothLabel(tooth: LabProsthesisAiTooth): string {
  const base = `#${tooth.toothNumber} ${tooth.prosthesisType}`;
  if (tooth.prosthesisType !== "브리지" || tooth.linkedTeeth.length === 0) {
    return base;
  }
  return `${base} (${tooth.linkedTeeth.join(", ")})`;
}
