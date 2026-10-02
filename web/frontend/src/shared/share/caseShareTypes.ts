// related files:
// - web/backend/utils/practiceTransferCaseView.js
// - web/frontend/src/shared/share/CaseShareViewer.tsx
// - web/frontend/src/shared/practice/labProsthesisAiDesign.ts
// - web/frontend/src/shared/practice/workScanModel.ts
// - 2026-10-03: 파일 묶음을 상·하악이 아니라 의뢰 차수(첫 의뢰·두 번째…)로 나눈다. 최신 의뢰만 기본으로 켠다.
// - 2026-09-28: 케이스 3D 공유 — 서버 뷰 페이로드 타입과 레이어 묶음(디자인·상악·하악·바이트·추가 스캔).
// - 2026-09-28: 공유 링크 공개 범위·유효 기간 옵션·상태(차단·만료).
import { toKstYmd } from "@/shared/date/kst";
import {
  isAbutsWorkScanFileName,
  preferWorkingOralScanFiles,
  resolveOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";

export type CaseShareFile = {
  fileKey: string;
  /** 플랫폼 내 뷰에만 있다. 외부 링크는 서버 프록시로 받는다. */
  s3Key?: string;
  fileName: string;
  size: number;
  isModel: boolean;
  group: "design" | "scan";
  kind: "prosthesis" | "abutment" | "request" | "workScan";
  scanRole: string;
  tooth: string;
  uploadedAt: string | null;
};

export type CaseShareTooth = { tooth: string; prosthesisType: string };

export type CaseShareParticipants = {
  practiceName: string;
  primeLabName: string;
  assigneeLabName: string;
  assigneeKind: "cooperation" | "subcontract" | null;
};

export type CaseShareView = {
  transferId: string;
  transferMongoId?: string;
  patientName: string;
  teeth: CaseShareTooth[];
  files: CaseShareFile[];
  participants?: CaseShareParticipants;
  viewerSide?: "practice" | "lab" | "admin";
  visibility?: CaseShareVisibility;
  expiresAt?: string;
};

/** public=누구나, accounts=지정한 계정만, participants=관계자(치과·기공소)만 */
export type CaseShareVisibility = "public" | "accounts" | "participants";

export const CASE_SHARE_VISIBILITY_OPTIONS: {
  value: CaseShareVisibility;
  label: string;
  hint: string;
}[] = [
  { value: "public", label: "누구나 열람", hint: "로그인 없이 링크만 있으면 봅니다." },
  {
    value: "accounts",
    label: "지정한 계정만 열람",
    hint: "이메일로 고른 계정이 로그인해야 봅니다.",
  },
  {
    value: "participants",
    label: "관계자만 열람",
    hint: "이 의뢰의 치과·기공소(원청·협력·하청) 계정만 봅니다.",
  },
];

export const CASE_SHARE_EXPIRY_OPTIONS = [1, 7, 30] as const;

export function caseShareVisibilityLabel(value: string | undefined): string {
  return (
    CASE_SHARE_VISIBILITY_OPTIONS.find((o) => o.value === value)?.label || "누구나 열람"
  );
}

export type CaseShareLink = {
  token: string;
  visibility: CaseShareVisibility;
  status: "active" | "blocked" | "expired";
  expiresAt: string;
  createdAt: string;
  createdBySide: string;
  createdByName: string;
  isOwner: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  /** 소유자에게만 온다. */
  allowedAccounts: { email: string; name: string }[];
};

/** `design` 또는 `request:{dateKey}` */
export type CaseLayerGroupId = string;

export type CaseLayerItem = {
  file: CaseShareFile;
  badge: string;
  defaultVisible: boolean;
};

export type CaseLayerGroup = {
  id: CaseLayerGroupId;
  label: string;
  /** 의뢰 묶음이면 업로드 시각(ms). 디자인·날짜 없음은 0. */
  uploadedAtMs: number;
  /** 의뢰 차수 묶음이면 true. 선택 시 그 의뢰만 켠다(작업열기 프리뷰와 같음). */
  isRequestWave: boolean;
  items: CaseLayerItem[];
};

const ROLE_ORDER = ["upper", "lower", "bite"] as const;

export function caseShareUrl(token: string): string {
  return `${window.location.origin}/share/case/${encodeURIComponent(token)}`;
}

export function caseViewUrl(transferKey: string): string {
  return `${window.location.origin}/cases/${encodeURIComponent(transferKey)}`;
}

export function caseShareTitle(view: Pick<CaseShareView, "patientName" | "teeth" | "transferId">): string {
  const teeth = view.teeth.map((t) => t.tooth).join(", ");
  const parts = [view.patientName, teeth ? `#${teeth}` : ""].filter(Boolean);
  return parts.join(" · ") || view.transferId || "케이스";
}

function uploadedAtMs(file: Pick<CaseShareFile, "uploadedAt">): number {
  const at = Date.parse(String(file.uploadedAt || ""));
  return Number.isFinite(at) ? at : 0;
}

function requestDateKey(uploadedAt: string | null | undefined): string {
  return toKstYmd(uploadedAt) || "";
}

function workScanNameIndex(fileName: string): number {
  const match = String(fileName || "").match(/작업-(\d+)\.dcm$/i);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 1 ? n - 1 : 0;
}

function roleRank(file: Pick<CaseShareFile, "fileName" | "scanRole">): number {
  const role = resolveOralScanRole({ fileName: file.fileName, scanRole: file.scanRole });
  const rank = ROLE_ORDER.indexOf(role as (typeof ROLE_ORDER)[number]);
  return rank < 0 ? ROLE_ORDER.length : rank;
}

/**
 * 작업 스캔은 정렬 시각이 같다. 역할 순서대로 의뢰 스캔의 업로드 시각을 붙인다.
 * `상악-작업.dcm`은 그 역할의 첫 의뢰, `상악-작업-2.dcm`은 다음 의뢰.
 */
function withWorkScanRequestDates(files: readonly CaseShareFile[]): CaseShareFile[] {
  const queues = new Map<string, string[]>();
  for (const source of files) {
    if (source.group !== "scan") continue;
    if (source.kind === "workScan" || isAbutsWorkScanFileName(source.fileName)) continue;
    const role = resolveOralScanRole({ fileName: source.fileName, scanRole: source.scanRole });
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    const at = String(source.uploadedAt || "").trim();
    if (!at) continue;
    const list = queues.get(role) || [];
    list.push(at);
    queues.set(role, list);
  }
  if (queues.size === 0) return [...files];

  const workFiles = files.filter(
    (f) => f.group === "scan" && (f.kind === "workScan" || isAbutsWorkScanFileName(f.fileName)),
  );
  const ordered = [...workFiles].sort(
    (a, b) =>
      roleRank(a) - roleRank(b) ||
      workScanNameIndex(a.fileName) - workScanNameIndex(b.fileName) ||
      a.fileName.localeCompare(b.fileName),
  );
  const assigned = new Map<string, string>();
  const cursor = new Map<string, number>();
  for (const file of ordered) {
    const role = resolveOralScanRole({ fileName: file.fileName, scanRole: file.scanRole });
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    const queue = queues.get(role) || [];
    const index = cursor.get(role) || 0;
    cursor.set(role, index + 1);
    const at = queue[index];
    if (at) assigned.set(file.fileKey, at);
  }
  return files.map((file) => {
    const at = assigned.get(file.fileKey);
    return at ? { ...file, uploadedAt: at } : file;
  });
}

/** 오래된 순 0부터. 첫 업로드·두 번째 업로드… */
export function caseRequestWaveLabel(indexFromOldest: number): string {
  if (indexFromOldest <= 0) return "첫 업로드";
  if (indexFromOldest === 1) return "두 번째 업로드";
  if (indexFromOldest === 2) return "세 번째 업로드";
  return `${indexFromOldest + 1}번째 업로드`;
}

export function caseRequestGroupId(dateKey: string): CaseLayerGroupId {
  return `request:${dateKey || "none"}`;
}

/**
 * 모델 파일을 뷰어 묶음으로 나눈다.
 * 디자인은 맨 위, 스캔은 의뢰 업로드 날(KST)별 차수. 최근 의뢰가 앞.
 * 최신 의뢰의 상·하악만 기본으로 켠다(작업 DCM이 있으면 그쪽만).
 */
export function groupCaseLayers(files: readonly CaseShareFile[]): CaseLayerGroup[] {
  const dated = withWorkScanRequestDates(files);
  const models = dated.filter((f) => f.isModel);
  const designs = models.filter((f) => f.group === "design");
  const scans = models.filter((f) => f.group === "scan");

  const preferred = new Set(
    preferWorkingOralScanFiles(
      scans.map((f) => ({
        fileKey: f.fileKey,
        fileName: f.fileName,
        scanRole: f.scanRole,
        uploadedAt: f.uploadedAt,
      })),
    ).map((f) => f.fileKey),
  );

  const byDate = new Map<string, CaseShareFile[]>();
  for (const file of scans) {
    const key = requestDateKey(file.uploadedAt);
    const list = byDate.get(key) || [];
    list.push(file);
    byDate.set(key, list);
  }

  const waves = [...byDate.entries()]
    .map(([dateKey, rows]) => {
      const maxMs = rows.reduce((max, row) => Math.max(max, uploadedAtMs(row)), 0);
      return { dateKey, rows, uploadedAtMs: maxMs };
    })
    .sort(
      (a, b) =>
        a.uploadedAtMs - b.uploadedAtMs || a.dateKey.localeCompare(b.dateKey),
    );

  const latestDateKey = waves.length > 0 ? waves[waves.length - 1]!.dateKey : null;
  const groups: CaseLayerGroup[] = [];

  if (designs.length > 0) {
    groups.push({
      id: "design",
      label: "디자인",
      uploadedAtMs: designs.reduce((max, row) => Math.max(max, uploadedAtMs(row)), 0),
      isRequestWave: false,
      items: designs.map((file) => ({
        file,
        badge: file.kind === "abutment" ? "어벗 디자인" : "보철물",
        defaultVisible: true,
      })),
    });
  }

  // 화면에는 최신 의뢰가 위. 라벨은 오래된 순(첫·두 번째…).
  for (let fromOldest = waves.length - 1; fromOldest >= 0; fromOldest -= 1) {
    const wave = waves[fromOldest]!;
    const isLatest = wave.dateKey === latestDateKey;
    const sorted = [...wave.rows].sort(
      (a, b) =>
        roleRank(a) - roleRank(b) ||
        uploadedAtMs(a) - uploadedAtMs(b) ||
        a.fileName.localeCompare(b.fileName),
    );
    groups.push({
      id: caseRequestGroupId(wave.dateKey),
      label: caseRequestWaveLabel(fromOldest),
      uploadedAtMs: wave.uploadedAtMs,
      isRequestWave: true,
      items: sorted.map((file) => {
        const role = resolveOralScanRole({
          fileName: file.fileName,
          scanRole: file.scanRole,
        });
        const isWork =
          file.kind === "workScan" || isAbutsWorkScanFileName(file.fileName);
        return {
          file,
          badge: isWork ? "작업 스캔" : "스캔",
          defaultVisible:
            isLatest &&
            (role === "upper" || role === "lower") &&
            preferred.has(file.fileKey),
        };
      }),
    });
  }

  return groups;
}

/** 의뢰 차수 묶음 id 목록(최신→오래된). */
export function caseRequestWaveGroupIds(groups: readonly CaseLayerGroup[]): string[] {
  return groups.filter((g) => g.isRequestWave).map((g) => g.id);
}

/** PLY/OBJ 칼라 텍스처·MTL 후보(모델이 아닌 파일) */
export function caseCompanionFiles(files: readonly CaseShareFile[]): CaseShareFile[] {
  return files.filter((f) => !f.isModel);
}
