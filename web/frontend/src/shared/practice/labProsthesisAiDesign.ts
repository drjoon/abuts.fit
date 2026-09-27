// 기공소 채팅 — 주문 치아와 확정된 스캔 역할로 보철 디자인 계획을 만든다.

import { scanKindToken } from "@/shared/files/modelPreviewFile";
import { sortByArch } from "@/shared/practice/toothArchOrder";

export type LabOralScanRole = "upper" | "lower" | "bite" | "other";

export type LabProsthesisAiScan = {
  fileName: string;
  role: LabOralScanRole;
};

export type LabProsthesisAiImplantSpec = {
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
};

export type LabProsthesisAiTooth = {
  toothNumber: string;
  /** 의뢰 치식 번호. 작업영역에서 번호를 바꿔도 이 값으로 되찾는다. */
  sourceToothNumber: string;
  prosthesisType: string;
  /** 연결된 브리지 치아. 자기 번호는 제외 */
  linkedTeeth: string[];
  designable: boolean;
  /** 임플란트 크라운. 의뢰 사양이 없으면 빈 문자열 사양. */
  implant: LabProsthesisAiImplantSpec | null;
  /** 의뢰 치아카드의 심플어벗 규격. 있으면 스캔바디 대신 이 템플릿을 스캔에 맞춘다. */
  simpleAbutment: LabSimpleAbutmentSpec | null;
};

export type LabSimpleAbutmentSpec = {
  kind: "심플어벗" | "심플밀링";
  diameter: string;
  height: string;
};

/** 작업영역 치아 유형. 의뢰 원본은 건드리지 않고 작업 문서에만 남긴다. */
export type LabToothKind =
  | "crown"
  | "implant"
  | "inlay"
  | "onlay"
  | "pontic"
  | "natural"
  | "missing";

export const LAB_TOOTH_KINDS: Array<{ id: LabToothKind; label: string }> = [
  { id: "crown", label: "크라운" },
  { id: "implant", label: "임플란트" },
  { id: "inlay", label: "인레이" },
  { id: "onlay", label: "온레이" },
  { id: "pontic", label: "폰틱" },
  { id: "natural", label: "자연치" },
  { id: "missing", label: "결손" },
];

export type LabToothOverride = {
  toothNumber?: string;
  kind?: LabToothKind;
};

export function labToothKindOf(tooth: LabProsthesisAiTooth): LabToothKind {
  if (tooth.implant) return "implant";
  if (tooth.prosthesisType === "인레이") return "inlay";
  if (tooth.prosthesisType === "온레이") return "onlay";
  if (tooth.prosthesisType === "자연치") return "natural";
  if (tooth.prosthesisType === "결손") return "missing";
  return "crown";
}

export function parseToothOverrides(value: unknown): Record<string, LabToothOverride> {
  const out: Record<string, LabToothOverride> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const kinds = new Set(LAB_TOOTH_KINDS.map((row) => row.id));
  for (const [source, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as LabToothOverride;
    const toothNumber = /^[1-4][1-8]$/.test(String(row.toothNumber || ""))
      ? String(row.toothNumber)
      : undefined;
    const kind = kinds.has(row.kind as LabToothKind) ? row.kind : undefined;
    if (toothNumber || kind) out[source] = { toothNumber, kind };
  }
  return out;
}

const KIND_PROSTHESIS_TYPE: Record<Exclude<LabToothKind, "implant" | "pontic">, string> = {
  crown: "크라운",
  inlay: "인레이",
  onlay: "온레이",
  natural: "자연치",
  missing: "결손",
};

/** 작업 문서의 치아 번호·유형을 계획에 입힌다. 폰틱은 수정값(pontic)에서 켠다. */
export function applyToothOverrides(
  plan: LabProsthesisAiPlan,
  overrides: Readonly<Record<string, LabToothOverride>>,
): LabProsthesisAiPlan {
  if (Object.keys(overrides).length === 0) return plan;
  const renamed = new Map<string, string>();
  for (const tooth of plan.teeth) {
    const next = overrides[tooth.sourceToothNumber]?.toothNumber;
    if (next && next !== tooth.toothNumber) renamed.set(tooth.toothNumber, next);
  }
  const rename = (number: string) => renamed.get(number) ?? number;
  const teeth = plan.teeth.map((tooth) => {
    const override = overrides[tooth.sourceToothNumber];
    const toothNumber = rename(tooth.toothNumber);
    const linkedTeeth = tooth.linkedTeeth.map(rename).filter((n) => n !== toothNumber);
    const kind = override?.kind;
    if (!kind || kind === "pontic") return { ...tooth, toothNumber, linkedTeeth };
    if (kind === "implant") {
      const prosthesisType = tooth.prosthesisType === "브리지" ? "브리지" : "크라운";
      return {
        ...tooth,
        toothNumber,
        linkedTeeth,
        prosthesisType,
        designable: true,
        implant: tooth.implant ?? { manufacturer: "", brand: "", family: "", type: "" },
      };
    }
    const bridged = tooth.prosthesisType === "브리지" && (kind === "crown");
    const prosthesisType = bridged ? "브리지" : KIND_PROSTHESIS_TYPE[kind];
    return {
      ...tooth,
      toothNumber,
      linkedTeeth,
      prosthesisType,
      designable: DESIGNABLE_TYPES.has(prosthesisType),
      implant: null,
      simpleAbutment: null,
    };
  });
  return {
    ...plan,
    teeth,
    designableTeeth: teeth.filter((row) => row.designable),
  };
}

/** 작업영역 번호 배지. 임플란트는 `16i`. */
export function labToothBadgeLabel(tooth: LabProsthesisAiTooth): string {
  return tooth.implant ? `${tooth.toothNumber}i` : tooth.toothNumber;
}

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

/** 원본 스캔과 따로 저장한 작업 DCM. `상악-작업.dcm`, `상악-작업-2.dcm` */
export function isAbutsWorkScanFileName(fileName: string): boolean {
  return /(?:^|[-_])작업(?:-\d+)?\.dcm$/i.test(String(fileName || "").trim());
}

export function abutsWorkScanFileName(
  role: Exclude<LabOralScanRole, "other">,
  index = 0,
): string {
  const label = oralScanRoleLabel(role);
  if (index <= 0) return `${label}-작업.dcm`;
  return `${label}-작업-${index + 1}.dcm`;
}

export type WorkScanRole = Exclude<LabOralScanRole, "other">;

function listedFileName(file: {
  fileName?: string | null;
  originalName?: string | null;
}): string {
  return String(file.fileName || file.originalName || "").trim();
}

/** 역할별 최신 작업 DCM의 uploadedAt(ms). 없으면 그 역할은 맵에 없다. */
export function newestWorkScanUploadedAtMs(
  files: readonly {
    fileName?: string | null;
    originalName?: string | null;
    scanRole?: string | null;
    uploadedAt?: string | null;
  }[],
): Map<WorkScanRole, number> {
  const newest = new Map<WorkScanRole, number>();
  for (const file of files) {
    const fileName = listedFileName(file);
    if (!isAbutsWorkScanFileName(fileName)) continue;
    const role = resolveOralScanRole({ ...file, fileName });
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    const at = Date.parse(String(file.uploadedAt || ""));
    const ms = Number.isFinite(at) ? at : 0;
    const prev = newest.get(role) ?? -1;
    if (ms >= prev) newest.set(role, ms);
  }
  return newest;
}

/**
 * 같은 역할에 작업 DCM이 있으면 원본 대신 그 배치만 남긴다.
 * 이미지 등 스캔이 아닌 파일은 그대로 둔다.
 */
export function preferWorkingOralScanFiles<
  T extends {
    fileName?: string | null;
    scanRole?: string | null;
    uploadedAt?: string | null;
  },
>(files: readonly T[]): T[] {
  const newestByRole = new Map<Exclude<LabOralScanRole, "other">, string>();
  for (const file of files) {
    if (!isAbutsWorkScanFileName(String(file.fileName || ""))) continue;
    const role = resolveOralScanRole(file);
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    const at = String(file.uploadedAt || "");
    const prev = newestByRole.get(role) ?? "";
    if (at >= prev) newestByRole.set(role, at);
  }
  if (newestByRole.size === 0) return [...files];
  return files.filter((file) => {
    const role = resolveOralScanRole(file);
    const work = isAbutsWorkScanFileName(String(file.fileName || ""));
    if (work) {
      if (role !== "upper" && role !== "lower" && role !== "bite") return false;
      return String(file.uploadedAt || "") === (newestByRole.get(role) ?? "");
    }
    if (
      (role === "upper" || role === "lower" || role === "bite") &&
      newestByRole.has(role)
    ) {
      return false;
    }
    return true;
  });
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
    .filter((file) => !isAbutsWorkScanFileName(String(file.fileName || "")))
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
    customAbutment?: boolean | null;
    implantManufacturer?: string | null;
    implantBrand?: string | null;
    implantFamily?: string | null;
    implantType?: string | null;
    abutmentManufacturer?: string | null;
    abutmentDiameter?: string | null;
    abutmentHeight?: string | null;
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
    const manufacturer = String(row?.implantManufacturer || "").trim();
    const implant =
      row?.customAbutment === true || manufacturer
        ? {
            manufacturer,
            brand: String(row?.implantBrand || "").trim(),
            family: String(row?.implantFamily || "").trim(),
            type: String(row?.implantType || "").trim(),
          }
        : null;
    const abutmentKind = String(row?.abutmentManufacturer || "").trim();
    const abutmentDiameter = String(row?.abutmentDiameter || "").trim();
    const simpleAbutment: LabSimpleAbutmentSpec | null =
      (abutmentKind === "심플어벗" || abutmentKind === "심플밀링") && abutmentDiameter
        ? {
            kind: abutmentKind,
            diameter: abutmentDiameter,
            height: String(row?.abutmentHeight || "").trim().toUpperCase(),
          }
        : null;
    const designableImplant = implant && DESIGNABLE_TYPES.has(prosthesisType) ? implant : null;
    teeth.push({
      toothNumber,
      sourceToothNumber: toothNumber,
      prosthesisType,
      linkedTeeth,
      designable: DESIGNABLE_TYPES.has(prosthesisType),
      implant: designableImplant,
      simpleAbutment: designableImplant ? simpleAbutment : null,
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
  const base = `#${tooth.toothNumber} ${tooth.implant ? "임플란트 " : ""}${tooth.prosthesisType}`;
  if (tooth.prosthesisType !== "브리지" || tooth.linkedTeeth.length === 0) {
    return base;
  }
  return `${base} (${sortByArch(tooth.linkedTeeth).join(", ")})`;
}
