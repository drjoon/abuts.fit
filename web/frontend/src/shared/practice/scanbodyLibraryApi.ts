// 스캔바디 라이브러리(3Shape .dme · exocad · 형상 한 개)·심플어벗 템플릿 API와 AI 디자인용 선택 규칙.
// 같은 사양이 여러 곳에 있으면 기공소 자체 등록(사본 포함) → 공용 순으로 쓴다.
// 라이브러리 업로드: 묶음 → presigned POST(S3 격리) → complete → 서버가 악성코드 검사·해석 → 폴링.
// 템플릿 업로드: 축·치수 계산 → presigned POST(S3 격리) → complete → 검사·해석 → templates에 등록(관리자 검토 없음).
// related files:
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
// - web/frontend/src/shared/files/scanbodyLibraryBundle.ts
// - web/frontend/src/shared/components/practice/ScanbodyLibraryManager.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

import { useCallback, useEffect, useState } from "react";
import { apiFetch, invalidateApiGetCache } from "@/shared/api/apiClient";
import { parseHpsDcmMeshData } from "@/shared/files/hpsDcmPreview";
import type { ScanbodyUploadBundle } from "@/shared/files/scanbodyLibraryBundle";
import {
  computeAbutmentTemplateFrame,
  toTemplateModel,
  type AbutmentTemplateFrame,
  type ScanbodyMesh,
} from "@/shared/practice/scanbodyRegistration";
import type { LabSimpleAbutmentSpec } from "@/shared/practice/labProsthesisAiDesign";
import { libraryMatchesMaker } from "@/shared/practice/scanbodyLibraryIdentity";
import { SIMPLE_ABUTMENT_KINDS, SIMPLE_HEALING_KIND } from "@/shared/practice/transferMemo";

const BASE = "/api/scanbody-libraries";

export type LibraryScope = "public" | "lab";

export type ScanbodyPartClass =
  | "scanAbutment"
  | "implant"
  | "screw"
  | "base"
  | "blank"
  | "analogInterface"
  | "interface"
  | "other";

export type ScanbodyLibraryPart = {
  partId: string;
  name: string;
  partClass: ScanbodyPartClass;
  /** stl: 서버가 새로 만든 모델 좌표 STL. dcm: 예전 원본. */
  format: "stl" | "dcm";
  hash: string;
  s3Key: string;
  size: number;
  /** 모델 좌표(축 +Y) 직경·높이. 예전 업로드는 null. */
  diameterMm?: number | null;
  heightMm?: number | null;
};

export type ScanbodyLibraryKit = {
  kitId: string;
  name: string;
  implantPartId: string | null;
  scanAbutmentPartIds: string[];
  screwPartId: string | null;
  basePartId: string | null;
  blankPartId: string | null;
  catalogIds: string[];
  /** 규격 접미사. 예: `LL H55`. */
  spec?: string;
  /** 파일에 있던 코드. 예: `C1W_LL_H55`. */
  code?: string;
};

export type ScanbodyLibraryRow = {
  id: string;
  scope: LibraryScope;
  canEdit: boolean;
  /** 공용이라 직접 못 고치지만, 고치면 우리 기공소 사본이 생긴다. */
  canCopyEdit?: boolean;
  /** 공용 원본을 고친 우리 기공소 사본이면 원본 id. */
  forkOf?: string | null;
  /** 사본을 만든 뒤 공용 원본에 새 키트·형상이 올라왔다. 업데이트하면 연결은 두고 형상만 새 공용으로 바꾼다. */
  forkBehind?: boolean;
  /** 새 공용 시각. 「나중에」를 이 값으로 기억해 다음 버전에 다시 묻는다. */
  baseContentUpdatedAt?: string | null;
  /** 기공소 라이브러리가 검사를 통과해 공용이 됐다(관리자가 내리면 false). */
  isPublic: boolean;
  /** 관리자 화면에서만 채워진다. */
  ownerName: string;
  /** scan: 기공소가 스캔하거나 다른 CAD에서 내보낸 형상 한 개. */
  source: "3shape" | "exocad" | "scan" | "generated";
  systemName: string;
  fileNames: string[];
  /** AI 디자인에서 의뢰 스캔바디 때문에 올릴 때 받은 제조사 이름. */
  manufacturers?: string[];
  /** 생성기에서 받은 스캔바디 제품명. */
  productName?: string;
  /** 파일에 있던 임플란트 제조사·브랜드·연결. */
  implantManufacturer?: string;
  brand?: string;
  implantType?: string;
  containerVersions: string[];
  parts: ScanbodyLibraryPart[];
  kits: ScanbodyLibraryKit[];
  updatedAt: string;
};

/** 템플릿 종류. 직접어벗의 심플어벗·심플밀링, 스캔바디의 심플힐링. */
export const TEMPLATE_KINDS = [...SIMPLE_ABUTMENT_KINDS, SIMPLE_HEALING_KIND] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** 의뢰가 쓰는 템플릿 규격. 심플힐링은 스캔바디라 높이까지 맞아야 한다. */
export type TemplateSpec = { kind: TemplateKind; diameter: string; height: string };

export type AbutmentTemplateRow = {
  id: string;
  scope: LibraryScope;
  canEdit: boolean;
  /** 기공소가 올려 검사를 통과한 공용 템플릿. */
  isPublic?: boolean;
  forkOf?: string | null;
  ownerName: string;
  kind: TemplateKind;
  diameter: string;
  height: string;
  fileName: string;
  hash: string;
  s3Key: string;
  size: number;
  frame: Pick<AbutmentTemplateFrame, "origin" | "axis" | "ref">;
  marginHeightMm: number;
  maxDiameterMm: number;
  heightMm: number;
  updatedAt: string;
};

/** 템플릿 업로드: 보류 → 관리자 검토 → 검사 → 해석. done이 되기 전에는 templates에 없고 AI 디자인에 쓰지 않는다. */
export type AbutmentTemplateUploadStatus =
  | "uploading"
  | "pending_review"
  | "scanning"
  | "processing"
  | "done"
  | "rejected"
  | "failed";

export type AbutmentTemplateUploadRow = {
  id: string;
  fileName: string;
  size: number;
  status: AbutmentTemplateUploadStatus;
  scanStatus: string;
  message: string;
  kind: TemplateKind | "";
  diameter: string;
  height: string;
  templateId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  finishedAt: string | null;
};

/** 관리자 검토 화면 행. */
export type AbutmentTemplateReviewRow = AbutmentTemplateUploadRow & {
  uploader: {
    userId: string | null;
    name: string;
    email: string;
    businessAnchorId: string | null;
    businessName: string;
  };
  autoApproved: boolean;
  reviewReason: string;
  markedMalicious: boolean;
};

export type UploadBlockRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  businessAnchorId: string | null;
  businessName: string;
  reason: string;
  source: "guardduty" | "admin";
  uploadKind: string;
  fileName: string;
  createdByName: string;
  createdAt: string;
};

export const isTemplateUploadActive = (status: AbutmentTemplateUploadStatus) =>
  status === "scanning" || status === "processing";

export type ScanbodyCatalog = {
  libraries: ScanbodyLibraryRow[];
  templates: AbutmentTemplateRow[];
  /** 내 템플릿 업로드 중 검토·검사 중이거나 최근에 거절·실패한 것. */
  templateUploads: AbutmentTemplateUploadRow[];
  /** 관리자가 기공소에 올려 달라고 표시한 규격 key(scanbodySpecKey). 나머지는 어벗츠가 준비한다. */
  labUploadRequestKeys: string[];
};

const EMPTY: ScanbodyCatalog = { libraries: [], templates: [], templateUploads: [], labUploadRequestKeys: [] };

async function fail(res: { data: unknown }, fallback: string): Promise<never> {
  const message = (res.data as { message?: unknown } | null)?.message;
  throw new Error(String(message || fallback));
}

export function useScanbodyCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<ScanbodyCatalog>(EMPTY);
  const [loading, setLoading] = useState(false);
  /** 한 번이라도 받았다. 받기 전 빈 목록을 「라이브러리 없음」으로 읽지 않게 한다. */
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => {
    invalidateApiGetCache(BASE);
    setNonce((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void apiFetch<{ data: ScanbodyCatalog }>({ path: BASE, cacheTtlMs: 30_000 })
      .then((res) => {
        if (cancelled || !res.ok) return;
        const data = res.data?.data;
        setCatalog(
          data
            ? {
                ...EMPTY,
                ...data,
                templateUploads: data.templateUploads ?? [],
                labUploadRequestKeys: data.labUploadRequestKeys ?? [],
              }
            : EMPTY,
        );
        setLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);
  return { catalog, setCatalog, loading, loaded, reload };
}

export type ScanbodyUploadStatus = "uploading" | "scanning" | "processing" | "done" | "rejected" | "failed";

export type ScanbodyUploadRow = {
  id: string;
  fileName: string;
  size: number;
  status: ScanbodyUploadStatus;
  scanStatus: string;
  message: string;
  notes: string[];
  libraries: {
    libraryId: string | null;
    systemName: string;
    source: string;
    kitCount: number;
    partCount: number;
  }[];
  createdAt: string;
  finishedAt: string | null;
};

export const isUploadFinished = (status: ScanbodyUploadStatus) =>
  status === "done" || status === "rejected" || status === "failed";

function postToS3(
  url: string,
  fields: Record<string, string>,
  blob: Blob,
  onProgress: (ratio: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("파일을 올리지 못했습니다."));
    xhr.onerror = () => reject(new Error("파일을 올리지 못했습니다."));
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append("file", blob);
    xhr.send(form);
  });
}

/**
 * 묶음 하나를 S3 격리 경로에 올리고 검사를 시작시킨다. 끝나면 서버 상태를 돌려준다.
 * `manufacturer`: 의뢰 스캔바디 제조사. 3Shape 시스템 이름에는 제조사가 없어 라이브러리에 붙여 둔다.
 */
export async function uploadScanbodyBundle(
  bundle: ScanbodyUploadBundle,
  onProgress: (ratio: number) => void,
  manufacturer?: string,
): Promise<ScanbodyUploadRow> {
  const created = await apiFetch<{
    data: { upload: ScanbodyUploadRow; uploadUrl: string; fields: Record<string, string> };
  }>({
    path: `${BASE}/uploads`,
    method: "POST",
    jsonBody: { fileName: bundle.fileName, size: bundle.blob.size, manufacturer: manufacturer || undefined },
  });
  if (!created.ok || !created.data?.data) return fail(created, "업로드를 시작하지 못했습니다.");
  const { upload, uploadUrl, fields } = created.data.data;
  await postToS3(uploadUrl, fields, bundle.blob, onProgress);
  const done = await apiFetch<{ data: ScanbodyUploadRow }>({
    path: `${BASE}/uploads/${upload.id}/complete`,
    method: "POST",
  });
  if (!done.ok || !done.data?.data) return fail(done, "업로드를 마치지 못했습니다.");
  return done.data.data;
}

export async function fetchScanbodyUploads(ids: readonly string[] = []): Promise<ScanbodyUploadRow[]> {
  const query = ids.length > 0 ? `?ids=${ids.map(encodeURIComponent).join(",")}` : "";
  const res = await apiFetch<{ data: ScanbodyUploadRow[] }>({
    path: `${BASE}/uploads${query}`,
    skipCache: true,
  });
  if (!res.ok) return fail(res, "업로드 상태를 받지 못했습니다.");
  return res.data?.data ?? [];
}

const UPLOAD_POLL_MS = 1500;
const UPLOAD_WAIT_MS = 25 * 60 * 1000;

/** 검사 중이면 그대로 두고, 등록 중이고 파일이 여러 개면 끝난 비율을 붙여 진행 막대가 움직이게 한다. */
function libraryRegisterStatus(rows: readonly ScanbodyUploadRow[]): string {
  if (rows.some((row) => row.status === "scanning")) return "악성코드 검사 중…";
  if (rows.length <= 1) return "라이브러리 등록 중…";
  const done = rows.filter((row) => isUploadFinished(row.status)).length;
  const pct = Math.round((done / rows.length) * 100);
  return `라이브러리 등록 중 (${done}/${rows.length}) ${pct}%`;
}

/**
 * 고른 파일을 묶어 올리고 검사·등록이 끝날 때까지 기다린다(AI 디자인 안에서 올릴 때).
 * `onStatus`에 진행 문구를 준다. 끝나면 업로드별 결과.
 */
export async function uploadScanbodyFilesAndWait(
  files: readonly File[],
  manufacturer: string,
  onStatus: (text: string) => void,
): Promise<{ rows: ScanbodyUploadRow[]; notes: string[] }> {
  const { buildScanbodyUploadBundles } = await import("@/shared/files/scanbodyLibraryBundle");
  onStatus("파일을 묶는 중…");
  const built = await buildScanbodyUploadBundles(files);
  if (built.bundles.length === 0) {
    throw new Error("올릴 라이브러리가 없습니다. 3Shape .dme 파일이나 exocad 라이브러리를 골라 주세요.");
  }
  let rows: ScanbodyUploadRow[] = [];
  for (const [i, bundle] of built.bundles.entries()) {
    const label = built.bundles.length > 1 ? ` (${i + 1}/${built.bundles.length})` : "";
    rows.push(
      await uploadScanbodyBundle(
        bundle,
        (ratio) => onStatus(`올리는 중${label} ${Math.round(ratio * 100)}%`),
        manufacturer,
      ),
    );
  }
  const started = Date.now();
  while (rows.some((row) => !isUploadFinished(row.status)) && Date.now() - started < UPLOAD_WAIT_MS) {
    onStatus(libraryRegisterStatus(rows));
    await new Promise((resolve) => window.setTimeout(resolve, UPLOAD_POLL_MS));
    const next = await fetchScanbodyUploads(rows.map((row) => row.id));
    const byId = new Map(next.map((row) => [row.id, row]));
    rows = rows.map((row) => byId.get(row.id) ?? row);
  }
  invalidateApiGetCache(BASE);
  return { rows, notes: built.notes };
}

/**
 * 기공소가 스캔하거나 다른 CAD에서 내보낸 스캔바디 형상 한 개(.dcm·.stl·.ply·.obj)를 의뢰 규격으로 올리고 기다린다.
 * 축·플랫폼은 템플릿과 같은 방법으로 계산한다(스캔 맨 아래가 플랫폼). 서버가 원본에서 형상을 다시 읽는다.
 */
export async function uploadScanbodyMeshAndWait(
  file: File,
  order: { manufacturer: string; diameter: string; height: string },
  onStatus: (text: string) => void,
): Promise<ScanbodyUploadRow> {
  onStatus("형상을 읽는 중…");
  const frame = computeAbutmentTemplateFrame(await loadMeshFile(file));
  const created = await apiFetch<{
    data: { upload: ScanbodyUploadRow; uploadUrl: string; fields: Record<string, string> };
  }>({
    path: `${BASE}/uploads`,
    method: "POST",
    jsonBody: {
      fileName: file.name,
      size: file.size,
      manufacturer: order.manufacturer,
      meshMeta: {
        frame: { origin: frame.origin, axis: frame.axis, ref: frame.ref },
        diameter: order.diameter.trim().replace(",", "."),
        height: order.height.trim().replace(",", "."),
      },
    },
  });
  if (!created.ok || !created.data?.data) return fail(created, "업로드를 시작하지 못했습니다.");
  const { upload, uploadUrl, fields } = created.data.data;
  await postToS3(uploadUrl, fields, file, (ratio) => onStatus(`올리는 중 ${Math.round(ratio * 100)}%`));
  const done = await apiFetch<{ data: ScanbodyUploadRow }>({
    path: `${BASE}/uploads/${upload.id}/complete`,
    method: "POST",
  });
  if (!done.ok || !done.data?.data) return fail(done, "업로드를 마치지 못했습니다.");
  let row = done.data.data;
  const started = Date.now();
  while (!isUploadFinished(row.status) && Date.now() - started < UPLOAD_WAIT_MS) {
    onStatus(libraryRegisterStatus([row]));
    await new Promise((resolve) => window.setTimeout(resolve, UPLOAD_POLL_MS));
    row = (await fetchScanbodyUploads([row.id]))[0] ?? row;
  }
  invalidateApiGetCache(BASE);
  return row;
}

/** 스캔바디 생성기 입력. DME에서 가져온 구조(임플란트 제조사·브랜드·연결 타입·키트 규격)만 남겼다. */
export type ScanbodySpecInput = {
  /** 스캔바디 제조사. 예: 지오메디 */
  maker: string;
  /** 스캔바디 제품명. */
  productName: string;
  /** 임플란트 제조사. 예: OSSTEM */
  implantManufacturer: string;
  /** 임플란트 브랜드. 예: TS3 */
  brand: string;
  /** 표 열 머리글. 숫자·문자. 예: 4.5 */
  diameter: string;
  /** 표 행 머리글. 숫자·문자. 예: 10, H */
  height: string;
  /** 임플란트 축. auto는 가장 긴 방향. */
  axis: "auto" | "x" | "y" | "z";
  /** 플랫폼(임플란트 접촉) 쪽 끝. auto는 더 가는 쪽. */
  platformEnd: "auto" | "min" | "max";
  /** 브라우저가 맞춘 모델 STL이면 서버는 다시 해석하지 않는다. */
  localGenerated?: boolean;
};

/**
 * 관리자 스캔바디 생성기: STEP(.stp·.step), STL, DCM 한 개와 스펙으로 AI 디자인용 라이브러리를 만든다.
 * 서버가 면을 플랫폼 원점·+Y 축 STL로 저장하고, 스펙은 라이브러리·키트에 붙인다.
 */
export async function uploadScanbodySpecAndWait(
  file: File,
  spec: ScanbodySpecInput,
  onStatus: (text: string) => void,
): Promise<ScanbodyUploadRow> {
  const created = await apiFetch<{
    data: { upload: ScanbodyUploadRow; uploadUrl: string; fields: Record<string, string> };
  }>({
    path: `${BASE}/uploads`,
    method: "POST",
    jsonBody: { fileName: file.name, size: file.size, specMeta: spec },
  });
  if (!created.ok || !created.data?.data) return fail(created, "업로드를 시작하지 못했습니다.");
  const { upload, uploadUrl, fields } = created.data.data;
  await postToS3(uploadUrl, fields, file, (ratio) => onStatus(`올리는 중 ${Math.round(ratio * 100)}%`));
  const done = await apiFetch<{ data: ScanbodyUploadRow }>({
    path: `${BASE}/uploads/${upload.id}/complete`,
    method: "POST",
  });
  if (!done.ok || !done.data?.data) return fail(done, "업로드를 마치지 못했습니다.");
  let row = done.data.data;
  const started = Date.now();
  while (!isUploadFinished(row.status) && Date.now() - started < UPLOAD_WAIT_MS) {
    onStatus(libraryRegisterStatus([row]));
    await new Promise((resolve) => window.setTimeout(resolve, UPLOAD_POLL_MS));
    row = (await fetchScanbodyUploads([row.id]))[0] ?? row;
  }
  invalidateApiGetCache(BASE);
  return row;
}

/** 관리자: 기공소 템플릿을 공용에서 내리거나 다시 올린다. */
export async function setAbutmentTemplatePublic(id: string, isPublic: boolean): Promise<AbutmentTemplateRow> {
  const res = await apiFetch<{ data: AbutmentTemplateRow }>({
    path: `${BASE}/templates/${id}/visibility`,
    method: "PATCH",
    jsonBody: { isPublic },
  });
  if (!res.ok || !res.data?.data) return fail(res, "공용 설정을 바꾸지 못했습니다.");
  invalidateApiGetCache(BASE);
  return res.data.data;
}

/** 관리자: 기공소 라이브러리를 공용에서 내리거나 다시 올린다. */
export async function setScanbodyLibraryPublic(id: string, isPublic: boolean): Promise<ScanbodyLibraryRow> {
  const res = await apiFetch<{ data: ScanbodyLibraryRow }>({
    path: `${BASE}/${id}/visibility`,
    method: "PATCH",
    jsonBody: { isPublic },
  });
  if (!res.ok || !res.data?.data) return fail(res, "공용 설정을 바꾸지 못했습니다.");
  invalidateApiGetCache(BASE);
  return res.data.data;
}

export async function updateScanbodyKit(
  libraryId: string,
  kitId: string,
  catalogIds: string[],
): Promise<ScanbodyLibraryRow> {
  const res = await apiFetch<{ data: ScanbodyLibraryRow }>({
    path: `${BASE}/${libraryId}/kits/${encodeURIComponent(kitId)}`,
    method: "PATCH",
    jsonBody: { catalogIds },
  });
  if (!res.ok || !res.data?.data) return fail(res, "임플란트 연결을 저장하지 못했습니다.");
  invalidateApiGetCache(BASE);
  return res.data.data;
}

/** 우리 기공소 사본을 새 공용으로 업데이트한다. 임플란트 연결과 사본에만 있는 키트는 남는다. */
export async function rebaseScanbodyLibrary(id: string): Promise<ScanbodyLibraryRow> {
  const res = await apiFetch<{ data: ScanbodyLibraryRow }>({ path: `${BASE}/${id}/rebase`, method: "POST" });
  if (!res.ok || !res.data?.data) return fail(res, "라이브러리를 업데이트하지 못했습니다.");
  invalidateApiGetCache(BASE);
  return res.data.data;
}

export type ScanbodyDemandSpec = {
  key: string;
  diameter: string;
  height: string;
  /** 심플어벗·심플밀링은 직경 하나에 높이를 모은다. */
  heights: string[];
};

export type ScanbodyDemandRow = {
  /** 카드 id. `library|제조사` 또는 `template|종류`. */
  key: string;
  /** 기공소 요청에 같이 켜는 저장 key. 카드 안 규격 전부. */
  keys: string[];
  /** library: 제조사 스캔바디 라이브러리, template: 심플어벗·심플밀링·심플힐링 템플릿. */
  type: "library" | "template";
  maker: string;
  diameter: string;
  height: string;
  /** 라이브러리·단일 규격에 모인 높이. 심플 템플릿 묶음은 specs를 본다. */
  heights: string[];
  /** 이 카드에 들어 있는, 아직 없는 규격. */
  specs: ScanbodyDemandSpec[];
  teethCount: number;
  transferCount: number;
  /** 이 규격을 의뢰한 치과·받은 기공소 수. */
  practiceCount: number;
  labCount: number;
  /** 같이 의뢰된 임플란트(많은 순 3개). */
  implants: { manufacturer: string; brand: string; family: string; type: string; count: number }[];
  firstAt: string;
  latestAt: string;
  /** 카드 안 규격이 모두 기공소 요청이면 true. */
  labUploadRequested: boolean;
};

/** 관리자: 의뢰에 쌓인 규격 중 공용 라이브러리·템플릿이 없는 것(최근 의뢰 먼저). */
export async function fetchScanbodyDemand(): Promise<ScanbodyDemandRow[]> {
  const res = await apiFetch<{ data: ScanbodyDemandRow[] }>({ path: `${BASE}/demand`, skipCache: true });
  if (!res.ok) return fail(res, "라이브러리 요청 목록을 받지 못했습니다.");
  return res.data?.data ?? [];
}

/** 관리자: 이 카드 안 규격 전부를 기공소에 올려 달라고 한다(또는 거둔다). */
export async function setScanbodyDemandLabRequest(keys: string[], requested: boolean) {
  const res = await apiFetch({
    path: `${BASE}/demand/lab-request`,
    method: "PATCH",
    jsonBody: { keys, requested },
  });
  if (!res.ok) return fail(res, "기공소 요청을 바꾸지 못했습니다.");
  invalidateApiGetCache(BASE);
}

/**
 * 의뢰 스캔바디 규격 key. 서버 scanbodyDemand.service.js demandOf와 같게 만든다.
 * 심플어벗·심플밀링은 직경만 맞으면 쓰니 높이를 비운다.
 */
export function scanbodySpecKey(order: { manufacturer: string; diameter: string; height: string }) {
  const maker = order.manufacturer.trim();
  // 숫자 규격은 `9`와 `9.0`을 같게 본다. 서버 normSize와 같게 유지한다.
  const norm = (value: string) => {
    const raw = value.trim().replace(",", ".");
    return /^\d+(\.\d+)?$/.test(raw) ? String(Number(raw)) : value.trim();
  };
  const diameter = norm(order.diameter);
  const isTemplate = (SIMPLE_ABUTMENT_KINDS as readonly string[]).includes(maker) || maker === SIMPLE_HEALING_KIND;
  const height = (SIMPLE_ABUTMENT_KINDS as readonly string[]).includes(maker)
    ? ""
    : isTemplate
      ? order.height.trim().toUpperCase()
      : norm(order.height);
  return [isTemplate ? "template" : "library", maker, diameter, height].join("|");
}

export async function deleteScanbodyLibrary(id: string) {
  const res = await apiFetch({ path: `${BASE}/${id}`, method: "DELETE" });
  if (!res.ok) return fail(res, "라이브러리를 지우지 못했습니다.");
  invalidateApiGetCache(BASE);
}

/** 생성기에서 남긴 규격만 둔다. */
export async function retainGeneratedScanbodyKits(id: string, specs: string[]) {
  const res = await apiFetch({
    path: `${BASE}/${id}/generated`,
    method: "PATCH",
    jsonBody: { specs },
  });
  if (!res.ok) return fail(res, "스캔바디 규격을 맞추지 못했습니다.");
  invalidateApiGetCache(BASE);
}

/** 저장된 STL을 편집 칸에 넣을 파일로 받는다. */
export async function fetchScanbodyPartFile(s3Key: string, fileName: string): Promise<File> {
  const res = await apiFetch({
    path: `${BASE}/file?key=${encodeURIComponent(s3Key)}`,
    skipCache: true,
  });
  if (!res.ok) return fail(res, "스캔바디 형상을 받지 못했습니다.");
  const buffer = await res.raw.arrayBuffer();
  return new File([buffer], fileName, { type: "model/stl" });
}

/** 파일 이름 `6M.DCM` → 직경 6, 높이 M. */
export function parseTemplateFileName(name: string): { diameter: string; height: string } | null {
  const m = /^(\d+(?:\.\d+)?)\s*([SMLX]{1,2})?\b/i.exec(name.replace(/\.[^.]+$/, "").trim());
  if (!m) return null;
  return { diameter: m[1]!, height: (m[2] ?? "").toUpperCase() };
}

/** 서버가 읽는 형상 파일. 3Shape .dcm, exocad·다른 CAD의 .stl·.ply·.obj. */
export const MESH_FILE_ACCEPT = ".dcm,.stl,.ply,.obj";
export const isMeshFileName = (name: string) => /\.(dcm|stl|ply|obj)$/i.test(name);

/** 형상 파일 → 같은 좌표 꼭짓점을 합친 인덱스 메시(축 계산에 열린 경계가 필요하다). */
export async function loadMeshFile(file: File): Promise<ScanbodyMesh> {
  if (/\.dcm$/i.test(file.name)) {
    const mesh = await parseHpsDcmMeshData(await file.arrayBuffer());
    return { positions: mesh.positions, indices: mesh.indices };
  }
  if (!isMeshFileName(file.name)) throw new Error(".dcm·.stl·.ply·.obj 파일만 올릴 수 있습니다.");
  const [{ parseModelPreview }, { mergeVertices }] = await Promise.all([
    import("@/shared/files/modelPreviewFile"),
    import("three/examples/jsm/utils/BufferGeometryUtils.js"),
  ]);
  const { geometry } = await parseModelPreview(file);
  for (const name of Object.keys(geometry.attributes)) if (name !== "position") geometry.deleteAttribute(name);
  const merged = mergeVertices(geometry, 1e-5);
  const positions = Float32Array.from(merged.getAttribute("position").array as ArrayLike<number>);
  const index = merged.getIndex();
  const indices = index
    ? Uint32Array.from(index.array as ArrayLike<number>)
    : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
  geometry.dispose();
  merged.dispose();
  return { positions, indices };
}

/**
 * 템플릿 형상(.dcm·.stl·.ply·.obj): 축·치수는 브라우저가 계산해 보내고, 원본은 presigned POST로 S3 격리 경로에 올린다.
 * 악성코드 검사·해석을 통과하면 관리자 검토 없이 등록된다.
 */
export async function uploadAbutmentTemplate(
  file: File,
  spec: TemplateSpec,
  onProgress: (ratio: number) => void = () => undefined,
): Promise<AbutmentTemplateUploadRow> {
  const mesh = await loadMeshFile(file);
  const frame = computeAbutmentTemplateFrame(mesh);
  const created = await apiFetch<{
    data: { upload: AbutmentTemplateUploadRow; uploadUrl: string; fields: Record<string, string> };
  }>({
    path: `${BASE}/templates/uploads`,
    method: "POST",
    jsonBody: {
      fileName: file.name,
      size: file.size,
      meta: {
        ...spec,
        frame: { origin: frame.origin, axis: frame.axis, ref: frame.ref },
        marginHeightMm: frame.marginHeightMm,
        maxDiameterMm: frame.maxDiameterMm,
        heightMm: frame.heightMm,
      },
    },
  });
  if (!created.ok || !created.data?.data) return fail(created, "템플릿을 올리지 못했습니다.");
  const { upload, uploadUrl, fields } = created.data.data;
  await postToS3(uploadUrl, fields, file, onProgress);
  const done = await apiFetch<{ data: AbutmentTemplateUploadRow }>({
    path: `${BASE}/templates/uploads/${upload.id}/complete`,
    method: "POST",
  });
  if (!done.ok || !done.data?.data) return fail(done, "템플릿 업로드를 마치지 못했습니다.");
  invalidateApiGetCache(BASE);
  return done.data.data;
}

/** 의뢰 규격 템플릿 형상 하나를 올리고 검사·등록이 끝날 때까지 기다린다(AI 디자인 안에서 올릴 때). */
export async function uploadTemplateFileAndWait(
  file: File,
  spec: TemplateSpec,
  onStatus: (text: string) => void,
): Promise<AbutmentTemplateUploadRow> {
  onStatus("형상을 읽는 중…");
  let row = await uploadAbutmentTemplate(file, spec, (ratio) =>
    onStatus(`올리는 중 ${Math.round(ratio * 100)}%`),
  );
  const started = Date.now();
  while (!["done", "rejected", "failed"].includes(row.status) && Date.now() - started < UPLOAD_WAIT_MS) {
    onStatus(row.status === "scanning" ? "악성코드 검사 중…" : "템플릿 등록 중…");
    await new Promise((resolve) => window.setTimeout(resolve, UPLOAD_POLL_MS));
    row = (await fetchTemplateUploads([row.id]))[0] ?? row;
  }
  invalidateApiGetCache(BASE);
  return row;
}

export async function fetchTemplateUploads(ids: readonly string[]): Promise<AbutmentTemplateUploadRow[]> {
  const query = ids.length > 0 ? `?ids=${ids.map(encodeURIComponent).join(",")}` : "";
  const res = await apiFetch<{ data: AbutmentTemplateUploadRow[] }>({
    path: `${BASE}/templates/uploads${query}`,
    skipCache: true,
  });
  if (!res.ok) return fail(res, "템플릿 업로드 상태를 받지 못했습니다.");
  return res.data?.data ?? [];
}

/** 관리자: 검토 대기·진행 중·최근 결정한 템플릿 업로드. */
export async function fetchTemplateReviews(ids: readonly string[] = []): Promise<AbutmentTemplateReviewRow[]> {
  const query = ids.length > 0 ? `?ids=${ids.map(encodeURIComponent).join(",")}` : "";
  const res = await apiFetch<{ data: AbutmentTemplateReviewRow[] }>({
    path: `${BASE}/templates/reviews${query}`,
    skipCache: true,
  });
  if (!res.ok) return fail(res, "검토 목록을 받지 못했습니다.");
  return res.data?.data ?? [];
}

/** 관리자 「열어 보기」: 악성코드 검사 후 해석·등록한다. */
export async function approveTemplateUpload(id: string): Promise<AbutmentTemplateReviewRow> {
  const res = await apiFetch<{ data: AbutmentTemplateReviewRow }>({
    path: `${BASE}/templates/uploads/${id}/approve`,
    method: "POST",
  });
  if (!res.ok || !res.data?.data) return fail(res, "검사를 시작하지 못했습니다.");
  return res.data.data;
}

/** 관리자 「폐기」: 열지 않고 지운다. malicious면 올린 사용자를 차단한다. */
export async function rejectTemplateUpload(
  id: string,
  body: { reason: string; malicious: boolean },
): Promise<AbutmentTemplateReviewRow> {
  const res = await apiFetch<{ data: AbutmentTemplateReviewRow }>({
    path: `${BASE}/templates/uploads/${id}/reject`,
    method: "POST",
    jsonBody: body,
  });
  if (!res.ok || !res.data?.data) return fail(res, "폐기하지 못했습니다.");
  return res.data.data;
}

export async function fetchUploadBlocklist(): Promise<UploadBlockRow[]> {
  const res = await apiFetch<{ data: UploadBlockRow[] }>({ path: `${BASE}/blocklist`, skipCache: true });
  if (!res.ok) return fail(res, "차단 목록을 받지 못했습니다.");
  return res.data?.data ?? [];
}

export async function unblockUploader(id: string) {
  const res = await apiFetch({ path: `${BASE}/blocklist/${id}`, method: "DELETE" });
  if (!res.ok) return fail(res, "차단을 풀지 못했습니다.");
}

export async function deleteAbutmentTemplate(id: string) {
  const res = await apiFetch({ path: `${BASE}/templates/${id}`, method: "DELETE" });
  if (!res.ok) return fail(res, "템플릿을 지우지 못했습니다.");
  invalidateApiGetCache(BASE);
}

const geometryCache = new Map<string, Promise<ScanbodyMesh>>();

/** 서버가 만든 이진 STL → 같은 좌표 꼭짓점을 합친 인덱스 메시. */
export function meshFromBinaryStl(buffer: ArrayBuffer): ScanbodyMesh {
  const view = new DataView(buffer);
  const count = buffer.byteLength >= 84 ? view.getUint32(80, true) : 0;
  if (count === 0 || buffer.byteLength < 84 + count * 50) throw new Error("스캔바디 형상이 올바르지 않습니다.");
  const index = new Map<string, number>();
  const positions: number[] = [];
  const indices = new Uint32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      const base = 84 + i * 50 + 12 + k * 12;
      const x = view.getFloat32(base, true);
      const y = view.getFloat32(base + 4, true);
      const z = view.getFloat32(base + 8, true);
      const key = `${x},${y},${z}`;
      let id = index.get(key);
      if (id === undefined) {
        id = positions.length / 3;
        index.set(key, id);
        positions.push(x, y, z);
      }
      indices[i * 3 + k] = id;
    }
  }
  return { positions: Float32Array.from(positions), indices };
}

/** 부품 형상(mm). 해시 키라 한 번 받으면 탭이 살아 있는 동안 다시 받지 않는다. */
export function loadScanbodyGeometry(s3Key: string): Promise<ScanbodyMesh> {
  const cached = geometryCache.get(s3Key);
  if (cached) return cached;
  const task = (async () => {
    const res = await apiFetch({
      path: `${BASE}/file?key=${encodeURIComponent(s3Key)}`,
      skipCache: true,
    });
    if (!res.ok) throw new Error("스캔바디 형상을 받지 못했습니다.");
    const buffer = await res.raw.arrayBuffer();
    if (/\.stl$/i.test(s3Key)) return meshFromBinaryStl(buffer);
    const mesh = await parseHpsDcmMeshData(buffer);
    return { positions: mesh.positions, indices: mesh.indices };
  })();
  geometryCache.set(s3Key, task);
  task.catch(() => geometryCache.delete(s3Key));
  return task;
}

export async function loadTemplateModel(row: AbutmentTemplateRow): Promise<ScanbodyMesh> {
  return toTemplateModel(await loadScanbodyGeometry(row.s3Key), row.frame);
}

const scopeRank = (scope: LibraryScope) => (scope === "lab" ? 0 : 1);

export type ScanbodyCandidate = {
  s3Key: string;
  name: string;
  kitName: string;
  systemName: string;
  scope: LibraryScope;
};

/** 임플란트 카탈로그 id에 연결된 키트의 스캔바디(주 → 추가). 자체 등록이 앞. */
export function scanbodyCandidatesFor(
  libraries: readonly ScanbodyLibraryRow[],
  catalogId: string | null,
  hint?: { manufacturer: string; brand: string; family: string; type: string } | null,
): ScanbodyCandidate[] {
  const pushKit = (
    out: ScanbodyCandidate[],
    seen: Set<string>,
    lib: ScanbodyLibraryRow,
    kit: ScanbodyLibraryKit,
  ) => {
    const parts = new Map(lib.parts.map((part) => [part.partId, part]));
    for (const id of kit.scanAbutmentPartIds) {
      const part = parts.get(id);
      if (!part || seen.has(part.s3Key)) continue;
      seen.add(part.s3Key);
      out.push({
        s3Key: part.s3Key,
        name: part.name,
        kitName: kit.name,
        systemName: lib.systemName,
        scope: lib.scope,
      });
    }
  };

  const out: ScanbodyCandidate[] = [];
  const seen = new Set<string>();
  const sorted = [...libraries].sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope));
  if (catalogId) {
    for (const lib of sorted) {
      for (const kit of lib.kits) {
        if (!kit.catalogIds.includes(catalogId)) continue;
        pushKit(out, seen, lib, kit);
      }
    }
  }
  if (out.length > 0 || !hint) return out;

  const token = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const maker = token(hint.manufacturer);
  const brand = token(hint.brand);
  const family = token(hint.family);
  const type = token(hint.type);
  let best = 0;
  const ranked: Array<{ lib: ScanbodyLibraryRow; kit: ScanbodyLibraryKit; score: number }> = [];
  for (const lib of sorted) {
    for (const kit of lib.kits) {
      const blob = token(
        [
          lib.systemName,
          kit.name,
          kit.spec,
          kit.code,
          lib.implantManufacturer,
          lib.brand,
          lib.implantType,
          ...(lib.manufacturers ?? []),
        ]
          .filter(Boolean)
          .join(" "),
      );
      const makerHit = Boolean(maker && (blob.includes(maker) || libraryMatchesMaker(lib, hint.manufacturer)));
      const brandHit = Boolean(brand && (blob.includes(brand) || token(lib.brand || "") === brand));
      if (!makerHit && !brandHit) continue;
      let score = (makerHit ? 2 : 0) + (brandHit ? 2 : 0);
      if (family && blob.includes(family)) score += 1;
      if (type && blob.includes(type)) score += 1;
      if (score > best) best = score;
      ranked.push({ lib, kit, score });
    }
  }
  for (const row of ranked) {
    if (row.score !== best) continue;
    pushKit(out, seen, row.lib, row.kit);
  }
  return out;
}

const SCANBODY_DIAMETER_TOL_MM = 0.25;
const SCANBODY_HEIGHT_TOL_MM = 0.4;

export type OrderedScanbodyCandidates = {
  rows: ScanbodyCandidate[];
  /** 치수가 하나만 딱 맞으면 그 키. 애매하면 null(모두 대 본다). */
  orderedKey: string | null;
  /** 제조사 라이브러리나 치수가 맞는 부품이 서버에 없다. 기공소에 올려 달라고 한다. */
  missingLibrary: boolean;
};

/**
 * 치과가 의뢰에 지정한 스캔바디(제조사·직경/높이)의 라이브러리 형상.
 * 임플란트 코드 키트(예: 지오메디 ISR)는 같은 임플란트에 여러 스캔바디가 붙어 틀린 것을 고르기 쉬워, 치수로 고른다.
 */
export function orderedScanbodyCandidates(
  libraries: readonly ScanbodyLibraryRow[],
  spec: { manufacturer: string; diameter: string; height: string } | null,
): OrderedScanbodyCandidates | null {
  const maker = spec?.manufacturer.trim() ?? "";
  if (!spec || !maker) return null;
  // 심플어벗·심플밀링·심플힐링은 제조사 라이브러리가 아니라 템플릿(orderTemplateSpec)에서 찾는다.
  if (maker === "심플어벗" || maker === "심플밀링" || maker === SIMPLE_HEALING_KIND) return null;
  const diameter = Number(spec.diameter.trim().replace(",", "."));
  const height = Number(spec.height.trim().replace(",", "."));
  const libs = libraries.filter((lib) => libraryMatchesMaker(lib, maker));
  if (libs.length === 0) return { rows: [], orderedKey: null, missingLibrary: true };
  const hits: Array<ScanbodyCandidate & { error: number }> = [];
  const seen = new Set<string>();
  const sorted = [...libs].sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope));
  for (const lib of sorted) {
    const parts = new Map(lib.parts.map((part) => [part.partId, part]));
    for (const kit of lib.kits) {
      for (const id of kit.scanAbutmentPartIds) {
        const part = parts.get(id);
        if (!part || seen.has(part.s3Key)) continue;
        if (part.diameterMm == null || part.heightMm == null) continue;
        const dd = Number.isFinite(diameter) ? Math.abs(part.diameterMm - diameter) : 0;
        const dh = Number.isFinite(height) ? Math.abs(part.heightMm - height) : 0;
        if (dd > SCANBODY_DIAMETER_TOL_MM || dh > SCANBODY_HEIGHT_TOL_MM) continue;
        seen.add(part.s3Key);
        hits.push({
          s3Key: part.s3Key,
          name: part.name,
          kitName: kit.name,
          systemName: lib.systemName,
          scope: lib.scope,
          error: dd + dh,
        });
      }
    }
  }
  hits.sort((a, b) => a.error - b.error);
  const rows = hits.slice(0, 3).map(({ error: _error, ...row }) => row);
  const [first, second] = hits;
  const orderedKey = first && first.error < 0.05 && (!second || second.error > 0.1) ? first.s3Key : null;
  // 제조사 라이브러리는 있어도 치수가 맞는 부품이 없으면(치수 없이 올린 예전 라이브러리 포함) 다시 올려 받는다.
  return { rows, orderedKey, missingLibrary: hits.length === 0 };
}

/** 의뢰 스캔바디 이름·직경·높이가 한 형상에만 맞으면 그 키. 애매하면 고르지 않는다. */
export function matchOrderedScanbody(
  rows: readonly { key: string; label: string }[],
  spec: { manufacturer: string; diameter: string; height: string } | null,
): string | null {
  if (!spec) return null;
  const name = spec.manufacturer.trim().toLowerCase();
  const diameter = spec.diameter.trim().toLowerCase().replace(",", ".");
  const height = spec.height.trim().toLowerCase();
  if (!name && !diameter && !height) return null;
  if (name === "심플어벗" || name === "심플밀링" || name === "심플힐링") return null;
  const hits = rows.filter((row) => {
    const text = row.label.toLowerCase().replace(/,/g, ".");
    if (name && !text.includes(name)) return false;
    if (diameter && !text.includes(diameter)) return false;
    if (height && !text.includes(height)) return false;
    return true;
  });
  return hits.length === 1 ? hits[0].key : null;
}

/**
 * 치아 의뢰가 쓰는 템플릿 규격. 직접어벗의 심플어벗·심플밀링, 또는 스캔바디로 지정한 심플힐링.
 * 둘 다 제조사 라이브러리가 아니라 어벗츠 템플릿에서 찾는다.
 */
export function orderTemplateSpec(tooth: {
  simpleAbutment: LabSimpleAbutmentSpec | null;
  scanbodyOrder: { manufacturer: string; diameter: string; height: string } | null;
}): TemplateSpec | null {
  if (tooth.simpleAbutment) return tooth.simpleAbutment;
  const order = tooth.scanbodyOrder;
  if (order?.manufacturer.trim() !== SIMPLE_HEALING_KIND || !order.diameter.trim()) return null;
  return { kind: SIMPLE_HEALING_KIND, diameter: order.diameter.trim(), height: order.height.trim().toUpperCase() };
}

export const templateSpecLabel = (spec: TemplateSpec) => `${spec.kind} ${spec.diameter}${spec.height}`;

/**
 * 의뢰 규격(종류·직경)에 맞는 템플릿. 높이가 같으면 먼저, 자체 등록이 먼저.
 * 심플힐링은 스캔바디라 윗면 높이가 맞아야 해서 높이까지 같은 것만 쓴다.
 */
export function abutmentTemplateFor(
  templates: readonly AbutmentTemplateRow[],
  spec: TemplateSpec | null,
): AbutmentTemplateRow | null {
  if (!spec) return null;
  const rows = templates.filter(
    (row) =>
      row.kind === spec.kind &&
      Number(row.diameter) === Number(spec.diameter) &&
      (spec.kind !== SIMPLE_HEALING_KIND || !spec.height || row.height === spec.height),
  );
  rows.sort(
    (a, b) =>
      scopeRank(a.scope) - scopeRank(b.scope) ||
      Number(b.height === spec.height) - Number(a.height === spec.height),
  );
  return rows[0] ?? null;
}
