// related files:
// - web/backend/controllers/files/stlPreflight.controller.js
// - web/frontend/src/features/requests/components/StlMachiningPreflightNotice.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
//
// 커스텀어벗 STL을 올리면 접수 전에 JS 파이프라인 가공 검사를 바로 돌린다.
// 결과는 파일 키(name:size)별로 들고, 업로드(파일 등장) 직후 한 번만 검사한다.
// 3D 확인 다이얼로그에서 임플란트·옵션을 바꿔도 재검사하지 않는다.
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
  /** 이미 검사를 시작한 파일 키 */
  const startedFileKeysRef = useRef(new Set<string>());
  const inflightRef = useRef(new Set<string>());
  const caseInfosMapRef = useRef(caseInfosMap);
  const mountedRef = useRef(true);

  caseInfosMapRef.current = caseInfosMap;

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
      if (startedFileKeysRef.current.has(fileKey)) continue;
      if (inflightRef.current.has(fileKey)) continue;

      startedFileKeysRef.current.add(fileKey);
      inflightRef.current.add(fileKey);
      setByFileKey((prev) =>
        prev[fileKey]?.status === "checking"
          ? prev
          : { ...prev, [fileKey]: { status: "checking" } },
      );

      // 첫 검사 시점의 임플란트만 참고. 이후 옵션 변경은 반영하지 않는다.
      const info = caseInfosMapRef.current?.[fileKey];
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
          setByFileKey((prev) => ({
            ...prev,
            [fileKey]: { status: "unknown", reason: "request_failed" },
          }));
        })
        .finally(() => {
          inflightRef.current.delete(fileKey);
        });
    }
  }, [files, token]);

  // 사라진 파일의 결과·시작 기록 정리
  useEffect(() => {
    const alive = new Set(files.map((f) => toPreflightFileKey(f)));
    for (const key of [...startedFileKeysRef.current]) {
      if (!alive.has(key)) startedFileKeysRef.current.delete(key);
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
