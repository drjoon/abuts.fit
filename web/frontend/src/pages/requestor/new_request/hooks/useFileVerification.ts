import { useEffect, useMemo, useRef, useState } from "react";

type HighlightStep = "upload" | "details" | "shipping";

type Params = {
  files: File[];
};

const STORAGE_KEY = "new-request:file-verification";

const loadStoredStatus = (): Record<string, boolean> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, boolean>;
    }
    return {};
  } catch {
    return {};
  }
};

const persistStatus = (status: Record<string, boolean>) => {
  if (typeof window === "undefined") return;
  try {
    if (!Object.keys(status).length) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  } catch {
    // ignore
  }
};

export function useFileVerification({ files }: Params) {
  const [fileVerificationStatus, setFileVerificationStatus] = useState<
    Record<string, boolean>
  >(() => loadStoredStatus());
  const [highlightUnverifiedArrows, setHighlightUnverifiedArrows] =
    useState(false);
  // localStorage에 저장된 status가 있으면 이전에 파일이 로드된 적 있다고 간주
  const hasLoadedFilesRef = useRef(Object.keys(loadStoredStatus()).length > 0);

  useEffect(() => {
    if (files.length > 0) {
      hasLoadedFilesRef.current = true;
    }
    // 파일이 없고 한 번도 로드된 적 없으면 아무것도 안 함 (초기 상태)
    if (!files.length && !hasLoadedFilesRef.current) {
      return;
    }
    // 파일이 없지만 이전에 로드된 적 있으면 status 유지 (새로고침 후 복원 대기 중)
    if (!files.length && hasLoadedFilesRef.current) {
      return;
    }
    const allowedKeys = new Set(
      files.map((file) => {
        try {
          return `${String(file.name || "").normalize("NFC")}:${file.size}`;
        } catch {
          return `${file.name}:${file.size}`;
        }
      }),
    );
    setFileVerificationStatus((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (allowedKeys.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      });
      if (!changed) {
        return prev;
      }
      persistStatus(next);
      return next;
    });
  }, [files]);

  useEffect(() => {
    persistStatus(fileVerificationStatus);
  }, [fileVerificationStatus]);

  const unverifiedCount = useMemo(
    () =>
      files.filter((file) => {
        const key = (() => {
          try {
            return `${String(file.name || "").normalize("NFC")}:${file.size}`;
          } catch {
            return `${file.name}:${file.size}`;
          }
        })();
        return !fileVerificationStatus[key];
      }).length,
    [files, fileVerificationStatus],
  );

  const highlightStep = useMemo<HighlightStep>(() => {
    if (!files.length) return "upload";
    if (unverifiedCount > 0) return "details";
    return "shipping";
  }, [files.length, unverifiedCount]);

  return {
    fileVerificationStatus,
    setFileVerificationStatus,
    highlightUnverifiedArrows,
    setHighlightUnverifiedArrows,
    unverifiedCount,
    highlightStep,
  };
}
