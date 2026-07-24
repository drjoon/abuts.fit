import type { CaseInfos } from "../hooks/newRequestTypes";

// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestDetailsSection.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useCompanionBinding.ts

export type RequestDesignSoftwareMode = "3Shape" | "ExoCAD" | "custom";

export const WEEKDAY_TO_KST_INDEX: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
};

export const getLowerExt = (name: string) => {
  const lower = String(name || "").trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
};

export const isCadCompanionFile = (fileName: string) => {
  const lower = String(fileName || "").trim().toLowerCase();
  const ext = getLowerExt(fileName);
  return (
    ext === ".xml" || ext === ".constructioninfo" || lower.includes("constructioninfo")
  );
};

export const isCompanionAllowedByDesignSoftware = (
  fileName: string,
  designSoftware: RequestDesignSoftwareMode | null,
) => {
  const lower = String(fileName || "").trim().toLowerCase();
  const ext = getLowerExt(fileName);

  if (designSoftware === "3Shape") {
    return ext === ".xml";
  }

  if (designSoftware === "ExoCAD") {
    return ext === ".constructioninfo" || lower.includes("constructioninfo");
  }

  // 직접 입력(custom) 또는 미설정(null)에서는 기존 허용 범위를 유지
  return isCadCompanionFile(fileName);
};

export const getCompanionAcceptByDesignSoftware = (
  designSoftware: RequestDesignSoftwareMode | null,
) => {
  if (designSoftware === "3Shape") return ".xml";
  if (designSoftware === "ExoCAD") return ".constructionInfo";
  return ".xml,.constructionInfo";
};

export const getCompanionHintByDesignSoftware = (
  designSoftware: RequestDesignSoftwareMode | null,
) => {
  if (designSoftware === "3Shape") {
    return "3Shape 선택: STL과 함께 ImplantDirectionPosition_*.xml 파일을 업로드해 주세요.";
  }
  if (designSoftware === "ExoCAD") {
    return "ExoCAD 선택: 케이스당 1개의 .constructionInfo 파일을 업로드해 주세요.";
  }
  return "STL 파일이 있는 폴더에서 구성정보 파일을 추가해 주세요.";
};

export const getStem = (name: string) => {
  const trimmed = String(name || "").trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0) return trimmed;
  return trimmed.slice(0, dot);
};

export const buildStemKeys = (stemRaw: string) => {
  const stem = String(stemRaw || "").trim().toLowerCase();
  const keys = new Set<string>();
  if (!stem) return keys;

  keys.add(stem);

  const tokens = stem.split(/[-_\s]+/).filter(Boolean);
  if (tokens[0]) keys.add(tokens[0]);
  if (tokens[0] && tokens[1]) keys.add(`${tokens[0]}-${tokens[1]}`);

  return keys;
};

export const isStemMatch = (aRaw: string, bRaw: string) => {
  const a = String(aRaw || "").trim().toLowerCase();
  const b = String(bRaw || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;

  const aKeys = buildStemKeys(a);
  const bKeys = buildStemKeys(b);
  for (const k of aKeys) {
    if (bKeys.has(k)) return true;
  }

  return false;
};

const readTextTag = (raw: string, tagNames: string[]) => {
  for (const tag of tagNames) {
    const re = new RegExp(
      `<\\s*${tag}\\b[^>]*>([^<]+)<\\s*\\/\\s*${tag}\\s*>`,
      "i",
    );
    const m = raw.match(re);
    const value = String(m?.[1] || "").trim();
    if (value) return value;
  }
  return "";
};

const readKeyValue = (raw: string, keys: string[]) => {
  for (const key of keys) {
    const re = new RegExp(`${key}\\s*[:=]\\s*["']?([^"'\\r\\n]+)`, "i");
    const m = raw.match(re);
    const value = String(m?.[1] || "").trim();
    if (value) return value;
  }
  return "";
};

export const parseCadCompanionMetadata = async (file: File) => {
  if (!isCadCompanionFile(file.name)) {
    return {} as Partial<CaseInfos>;
  }

  const raw = await file.text();

  const clinicName =
    readTextTag(raw, ["ClinicName", "Clinic", "Practice", "OfficeName"]) ||
    readKeyValue(raw, ["ClinicName", "Clinic", "Practice", "OfficeName"]);

  const patientName =
    readTextTag(raw, ["PatientName", "Patient", "Name"]) ||
    readKeyValue(raw, ["PatientName", "PatientNameFull", "Patient"]);

  const tooth =
    readTextTag(raw, ["Tooth", "ToothNumber", "ToothNo", "ToothNum"]) ||
    readKeyValue(raw, ["Tooth", "ToothNumber", "ToothNo", "ToothNum"]);

  const result: Partial<CaseInfos> = {};
  if (clinicName) result.clinicName = clinicName;
  if (patientName) result.patientName = patientName;
  if (tooth) result.tooth = tooth;
  return result;
};
