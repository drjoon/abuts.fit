// related files:
// - web/backend/controllers/files/stlPreflight.controller.js
// - web/frontend/src/features/requests/components/StlMachiningPreflightNotice.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
//
// 커스텀어벗 STL을 올리면 접수 전에 JS 파이프라인 가공 검사를 바로 돌린다.
// 결과는 파일 키(name:size)별로 들고, 임플란트 선택이 바뀌면 그 조합으로 다시 검사한다.
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import type { StlMachiningPreflight } from "@/features/requests/components/StlMachiningPreflightNotice";
import type { CaseInfos } from "./newRequestTypes";

type PreflightMap = Record<string, StlMachiningPreflight>;

const normalizeKeyPart = (s: string) => {
  try {
    return String(s || "").normalize("NFC");
  } catch {
    return String(s || "");
  }
};

export const toPreflightFileKey = (file: File) =>
  `${normalizeKeyPart(file.name)}:${file.size}`;

function implantSignature(info?: CaseInfos | null) {
  if (!info) return "";
  return [
    info.implantManufacturer || "",
    info.implantBrand || "",
    info.implantFamily || "",
    info.implantType || "",
  ]
    .map((v) => String(v).trim())
    .join("|");
}

export function useStlMachiningPreflight({
  files,
  caseInfosMap,
  token,
}: {
  files: File[];
  caseInfosMap?: Record<string, CaseInfos>;
  token?: string | null;
}) {
  const [byFileKey, setByFileKey] = useState<PreflightMap>({});
  /** fileKey -> 마지막으로 검사를 시작한 임플란트 조합 */
  const startedSigRef = useRef(new Map<string, string>());
  const inflightRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    for (const file of files) {
      if (!/\.stl$/i.test(file.name)) continue;
      const fileKey = toPreflightFileKey(file);
      const info = caseInfosMap?.[fileKey];
      const sig = implantSignature(info);
      if (startedSigRef.current.get(fileKey) === sig) continue;
      const runKey = `${fileKey}::${sig}`;
      if (inflightRef.current.has(runKey)) continue;

      startedSigRef.current.set(fileKey, sig);
      inflightRef.current.add(runKey);
      setByFileKey((prev) =>
        prev[fileKey]?.status === "checking"
          ? prev
          : { ...prev, [fileKey]: { status: "checking" } },
      );

      const form = new FormData();
      form.append("file", file, file.name);
      if (info?.implantManufacturer) form.append("implantManufacturer", info.implantManufacturer);
      if (info?.implantBrand) form.append("implantBrand", info.implantBrand);
      if (info?.implantFamily) form.append("implantFamily", info.implantFamily);
      if (info?.implantType) form.append("implantType", info.implantType);

      void apiFetch({
        path: "/api/files/temp/stl-preflight",
        method: "POST",
        token,
        body: form,
      })
        .then((res) => {
          if (!mountedRef.current) return;
          const data = (res.data as { data?: StlMachiningPreflight } | null)
            ?.data;
          // 임플란트 조합이 그새 또 바뀌었으면 이 결과는 버린다(새 검사가 덮는다).
          if (startedSigRef.current.get(fileKey) !== sig) return;
          setByFileKey((prev) => ({
            ...prev,
            [fileKey]:
              res.ok && data
                ? { ...data, status: data.status || "unknown" }
                : { status: "unknown", reason: "request_failed" },
          }));
        })
        .catch(() => {
          if (!mountedRef.current) return;
          if (startedSigRef.current.get(fileKey) !== sig) return;
          setByFileKey((prev) => ({
            ...prev,
            [fileKey]: { status: "unknown", reason: "request_failed" },
          }));
        })
        .finally(() => {
          inflightRef.current.delete(runKey);
        });
    }
  }, [files, caseInfosMap, token]);

  // 사라진 파일의 결과·시그니처 정리
  useEffect(() => {
    const alive = new Set(files.map((f) => toPreflightFileKey(f)));
    for (const key of [...startedSigRef.current.keys()]) {
      if (!alive.has(key)) startedSigRef.current.delete(key);
    }
    setByFileKey((prev) => {
      const next: PreflightMap = {};
      let changed = false;
      for (const [key, value] of Object.entries(prev)) {
        if (alive.has(key)) next[key] = value;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [files]);

  return byFileKey;
}
