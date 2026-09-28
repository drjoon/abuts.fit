// related files:
// - web/backend/utils/practiceTransferCaseView.js
// - web/frontend/src/shared/share/CaseShareViewer.tsx
// - web/frontend/src/shared/practice/labProsthesisAiDesign.ts
// - 2026-09-28: 케이스 3D 공유 — 서버 뷰 페이로드 타입과 레이어 묶음(디자인·상악·하악·바이트·추가 스캔).
// - 2026-09-28: 공유 링크 공개 범위·유효 기간 옵션·상태(차단·만료).
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

export type CaseLayerGroupId = "design" | "upper" | "lower" | "bite" | "other";

export type CaseLayerItem = {
  file: CaseShareFile;
  badge: string;
  defaultVisible: boolean;
};

export type CaseLayerGroup = {
  id: CaseLayerGroupId;
  label: string;
  items: CaseLayerItem[];
};

const GROUP_LABEL: Record<CaseLayerGroupId, string> = {
  design: "디자인",
  upper: "상악",
  lower: "하악",
  bite: "바이트",
  other: "추가 스캔",
};

const GROUP_ORDER: CaseLayerGroupId[] = ["design", "upper", "lower", "bite", "other"];

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

/**
 * 모델 파일을 뷰어 묶음으로 나눈다.
 * 상·하악은 켜고(작업 DCM이 있으면 그쪽만), 바이트·추가 스캔은 꺼 둔다.
 */
export function groupCaseLayers(files: readonly CaseShareFile[]): CaseLayerGroup[] {
  const models = files.filter((f) => f.isModel);
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

  const byGroup = new Map<CaseLayerGroupId, CaseLayerItem[]>();
  const push = (id: CaseLayerGroupId, item: CaseLayerItem) => {
    const list = byGroup.get(id) || [];
    list.push(item);
    byGroup.set(id, list);
  };

  for (const file of models) {
    if (file.group === "design") {
      push("design", {
        file,
        badge: file.kind === "abutment" ? "어벗 디자인" : "보철물",
        defaultVisible: true,
      });
      continue;
    }
    const role = resolveOralScanRole({ fileName: file.fileName, scanRole: file.scanRole });
    const groupId: CaseLayerGroupId =
      role === "upper" || role === "lower" || role === "bite" ? role : "other";
    const isWork = file.kind === "workScan" || isAbutsWorkScanFileName(file.fileName);
    push(groupId, {
      file,
      badge: isWork ? "작업 스캔" : "스캔",
      defaultVisible:
        (groupId === "upper" || groupId === "lower") && preferred.has(file.fileKey),
    });
  }

  return GROUP_ORDER.filter((id) => byGroup.has(id)).map((id) => ({
    id,
    label: GROUP_LABEL[id],
    items: byGroup.get(id)!,
  }));
}

/** PLY/OBJ 칼라 텍스처·MTL 후보(모델이 아닌 파일) */
export function caseCompanionFiles(files: readonly CaseShareFile[]): CaseShareFile[] {
  return files.filter((f) => !f.isModel);
}
