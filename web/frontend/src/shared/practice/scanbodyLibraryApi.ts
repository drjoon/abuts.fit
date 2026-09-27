// 스캔바디 라이브러리(.dme)·심플어벗 템플릿 API와 AI 디자인용 선택 규칙.
// 같은 사양이 여러 곳에 있으면 기공소 자체 등록 → 어벗츠 공용 순으로 쓴다.
// related files:
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
// - web/frontend/src/shared/files/dmeLibrary.ts
// - web/frontend/src/shared/components/practice/ScanbodyLibraryManager.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

import { useCallback, useEffect, useState } from "react";
import { apiFetch, invalidateApiGetCache } from "@/shared/api/apiClient";
import { parseHpsDcmMeshData } from "@/shared/files/hpsDcmPreview";
import { dmeLibraryFormData, type DmeLibrary, type ScanbodyPartClass } from "@/shared/files/dmeLibrary";
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

export type ScanbodyLibraryPart = {
  partId: string;
  name: string;
  partClass: ScanbodyPartClass;
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

export async function importDmeLibrary(
  lib: DmeLibrary,
  catalogIdsByKit: Record<string, string[]> = {},
): Promise<ScanbodyLibraryRow> {
  const res = await apiFetch<{ data: ScanbodyLibraryRow }>({
    path: `${BASE}/dme`,
    method: "POST",
    body: dmeLibraryFormData(lib, catalogIdsByKit),
  });
  if (!res.ok || !res.data?.data) return fail(res, "라이브러리를 올리지 못했습니다.");
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

/** 부품 .dcm 메시(mm). 해시 키라 한 번 받으면 탭이 살아 있는 동안 다시 받지 않는다. */
export function loadScanbodyGeometry(s3Key: string): Promise<ScanbodyMesh> {
  const cached = geometryCache.get(s3Key);
  if (cached) return cached;
  const task = (async () => {
    const res = await apiFetch({
      path: `${BASE}/file?key=${encodeURIComponent(s3Key)}`,
      skipCache: true,
    });
    if (!res.ok) throw new Error("스캔바디 형상을 받지 못했습니다.");
    const mesh = await parseHpsDcmMeshData(await res.raw.arrayBuffer());
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
