// 스캔바디 라이브러리(3Shape .dme · exocad)·심플어벗 템플릿 API와 AI 디자인용 선택 규칙.
// 같은 사양이 여러 곳에 있으면 기공소 자체 등록 → 어벗츠 공용(승격 포함) 순으로 쓴다.
// 라이브러리 업로드: 묶음 → presigned PUT(S3 격리) → complete → 서버가 악성코드 검사·해석 → 폴링.
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
import type { SimpleAbutmentKind } from "@/shared/practice/transferMemo";

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
};

export type ScanbodyLibraryRow = {
  id: string;
  scope: LibraryScope;
  canEdit: boolean;
  /** 기공소 라이브러리를 관리자가 공용으로 올렸다. */
  isPublic: boolean;
  /** 관리자 화면에서만 채워진다. */
  ownerName: string;
  source: "3shape" | "exocad";
  systemName: string;
  fileNames: string[];
  containerVersions: string[];
  parts: ScanbodyLibraryPart[];
  kits: ScanbodyLibraryKit[];
  updatedAt: string;
};

export type AbutmentTemplateRow = {
  id: string;
  scope: LibraryScope;
  canEdit: boolean;
  ownerName: string;
  kind: SimpleAbutmentKind;
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

export type ScanbodyCatalog = {
  libraries: ScanbodyLibraryRow[];
  templates: AbutmentTemplateRow[];
};

const EMPTY: ScanbodyCatalog = { libraries: [], templates: [] };

async function fail(res: { data: unknown }, fallback: string): Promise<never> {
  const message = (res.data as { message?: unknown } | null)?.message;
  throw new Error(String(message || fallback));
}

export function useScanbodyCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<ScanbodyCatalog>(EMPTY);
  const [loading, setLoading] = useState(false);
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
        setCatalog(res.data?.data ?? EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);
  return { catalog, setCatalog, loading, reload };
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

function putToS3(url: string, blob: Blob, contentType: string, onProgress: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("파일을 올리지 못했습니다."));
    xhr.onerror = () => reject(new Error("파일을 올리지 못했습니다."));
    xhr.send(blob);
  });
}

/** 묶음 하나를 S3 격리 경로에 올리고 검사를 시작시킨다. 끝나면 서버 상태를 돌려준다. */
export async function uploadScanbodyBundle(
  bundle: ScanbodyUploadBundle,
  onProgress: (ratio: number) => void,
): Promise<ScanbodyUploadRow> {
  const created = await apiFetch<{
    data: { upload: ScanbodyUploadRow; uploadUrl: string; contentType: string };
  }>({
    path: `${BASE}/uploads`,
    method: "POST",
    jsonBody: { fileName: bundle.fileName, size: bundle.blob.size },
  });
  if (!created.ok || !created.data?.data) return fail(created, "업로드를 시작하지 못했습니다.");
  const { upload, uploadUrl, contentType } = created.data.data;
  await putToS3(uploadUrl, bundle.blob, contentType, onProgress);
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

/** 관리자 검토: 기공소 라이브러리를 공용으로 올리거나 내린다. */
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

export async function deleteScanbodyLibrary(id: string) {
  const res = await apiFetch({ path: `${BASE}/${id}`, method: "DELETE" });
  if (!res.ok) return fail(res, "라이브러리를 지우지 못했습니다.");
  invalidateApiGetCache(BASE);
}

/** 파일 이름 `6M.DCM` → 직경 6, 높이 M. */
export function parseTemplateFileName(name: string): { diameter: string; height: string } | null {
  const m = /^(\d+(?:\.\d+)?)\s*([SMLX]{1,2})?\b/i.exec(name.replace(/\.[^.]+$/, "").trim());
  if (!m) return null;
  return { diameter: m[1]!, height: (m[2] ?? "").toUpperCase() };
}

export async function uploadAbutmentTemplate(
  file: File,
  spec: { kind: SimpleAbutmentKind; diameter: string; height: string },
): Promise<AbutmentTemplateRow> {
  const mesh = await parseHpsDcmMeshData(await file.arrayBuffer());
  const frame = computeAbutmentTemplateFrame(mesh);
  const form = new FormData();
  form.append(
    "meta",
    JSON.stringify({
      ...spec,
      frame: { origin: frame.origin, axis: frame.axis, ref: frame.ref },
      marginHeightMm: frame.marginHeightMm,
      maxDiameterMm: frame.maxDiameterMm,
      heightMm: frame.heightMm,
    }),
  );
  form.append("file", file, file.name);
  const res = await apiFetch<{ data: AbutmentTemplateRow }>({
    path: `${BASE}/templates`,
    method: "POST",
    body: form,
  });
  if (!res.ok || !res.data?.data) return fail(res, "템플릿을 올리지 못했습니다.");
  invalidateApiGetCache(BASE);
  return res.data.data;
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
): ScanbodyCandidate[] {
  if (!catalogId) return [];
  const out: ScanbodyCandidate[] = [];
  const seen = new Set<string>();
  const sorted = [...libraries].sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope));
  for (const lib of sorted) {
    const parts = new Map(lib.parts.map((part) => [part.partId, part]));
    for (const kit of lib.kits) {
      if (!kit.catalogIds.includes(catalogId)) continue;
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
    }
  }
  return out;
}

/** 의뢰 심플어벗 규격(종류·직경)에 맞는 템플릿. 높이가 같으면 먼저, 자체 등록이 먼저. */
export function abutmentTemplateFor(
  templates: readonly AbutmentTemplateRow[],
  spec: LabSimpleAbutmentSpec | null,
): AbutmentTemplateRow | null {
  if (!spec) return null;
  const rows = templates.filter(
    (row) => row.kind === spec.kind && Number(row.diameter) === Number(spec.diameter),
  );
  rows.sort(
    (a, b) =>
      scopeRank(a.scope) - scopeRank(b.scope) ||
      Number(b.height === spec.height) - Number(a.height === spec.height),
  );
  return rows[0] ?? null;
}
