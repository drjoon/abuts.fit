// change-log:
// - 2026-08-19: 의뢰 상세 모달 왼쪽 원본 STL 프리뷰 로더.
// related files:
// - web/frontend/src/features/requests/components/RequestDetailDialog.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorUnmachinableHost.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { getFileBlob, setFileBlob } from "@/shared/files/stlIndexedDb";
import {
  fileFromModelBlob,
  modelFileBasename,
} from "@/shared/files/modelPreviewFile";

const MONGO_ID_RE = /^[a-fA-F0-9]{24}$/;

type FileMeta = {
  filePath?: string | null;
  originalName?: string | null;
  fileName?: string | null;
} | null | undefined;

type Args = {
  open: boolean;
  requestMongoId?: string | null;
  requestIdLabel?: string | null;
  fileMeta?: FileMeta;
};

export function useRequestOriginalStlPreview({
  open,
  requestMongoId,
  requestIdLabel,
  fileMeta,
}: Args) {
  const { token } = useAuthStore();
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mongoId = String(requestMongoId || "").trim();
    if (!open || !token || !MONGO_ID_RE.test(mongoId)) {
      setPreviewFile(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    setPreviewFile(null);
    setPreviewLoading(true);
    setPreviewError(null);

    const fallbackName = `${String(requestIdLabel || mongoId).trim() || mongoId}-original.stl`;
    const resolveFileName = (apiFileName?: unknown) =>
      modelFileBasename(
        apiFileName ||
          fileMeta?.filePath ||
          fileMeta?.originalName ||
          fileMeta?.fileName ||
          fallbackName,
        fallbackName,
      );

    const load = async () => {
      try {
        const cacheKey = `stl:request-detail:${mongoId}:original-file-url`;
        const cached = await getFileBlob(cacheKey);
        if (cached && !cancelled) {
          setPreviewFile(fileFromModelBlob(cached, resolveFileName()));
          setPreviewLoading(false);
          return;
        }

        const originalFileRes = await fetch(
          `/api/requests/${encodeURIComponent(mongoId)}/original-file-url`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        const originalFileBody: any = await originalFileRes
          .json()
          .catch(() => ({}));
        const signedUrl = String(originalFileBody?.data?.url || "").trim();
        const fileName = resolveFileName(originalFileBody?.data?.fileName);

        if (!originalFileRes.ok || !signedUrl) {
          if (cancelled) return;
          setPreviewError("3D 모델 파일을 찾을 수 없습니다.");
          setPreviewLoading(false);
          return;
        }

        const fileRes = await fetch(signedUrl, { method: "GET" });
        if (!fileRes.ok) {
          if (cancelled) return;
          setPreviewError("3D 모델 파일을 불러오지 못했습니다.");
          setPreviewLoading(false);
          return;
        }

        const blob = await fileRes.blob();
        if (cancelled) return;
        try {
          await setFileBlob(cacheKey, blob);
        } catch {
          // ignore cache write errors
        }
        setPreviewFile(fileFromModelBlob(blob, fileName));
        setPreviewLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error("의뢰 상세 3D 모델 로드 실패", error);
        setPreviewError("3D 모델 파일을 불러오지 못했습니다.");
        setPreviewLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    token,
    requestMongoId,
    requestIdLabel,
    fileMeta?.filePath,
    fileMeta?.originalName,
    fileMeta?.fileName,
  ]);

  return { previewFile, previewLoading, previewError };
}
