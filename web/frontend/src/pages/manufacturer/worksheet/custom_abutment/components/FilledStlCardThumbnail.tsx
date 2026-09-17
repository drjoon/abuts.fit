// change-log:
// - 2026-09-17: 준비/가공 의뢰카드 — filled STL + 피니시라인 썸네일(프리뷰 오른쪽과 동일 소스).
// related files:
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/frontend/src/shared/files/s3BlobCache.ts
import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import { StlPreviewThumbnail } from "@/features/requests/components/StlPreviewThumbnail";
import {
  fileFromModelBlob,
  modelFileBasename,
} from "@/shared/files/modelPreviewFile";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import {
  resolveFilledStlFile,
  type ManufacturerRequest,
} from "../utils/request";

type Props = {
  request: ManufacturerRequest;
  className?: string;
};

function ensureFilledFileName(name: string): string {
  const base = modelFileBasename(name, "model.filled.stl");
  if (base.toLowerCase().includes("filled")) return base;
  return base.replace(/\.stl$/i, ".filled.stl");
}

function resolveFinishLinePoints(
  request: ManufacturerRequest,
): number[][] | null {
  const points = request?.caseInfos?.finishLine?.points;
  if (!Array.isArray(points) || points.length < 2) return null;
  return points;
}

export function FilledStlCardThumbnail({ request, className }: Props) {
  const token = useAuthStore((s) => s.token);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);

  const filledMeta = resolveFilledStlFile(request?.caseInfos);
  const s3Key = String(filledMeta?.s3Key || "").trim();
  const fileName = ensureFilledFileName(
    String(
      filledMeta?.originalName ||
        filledMeta?.fileName ||
        filledMeta?.filePath ||
        "model.filled.stl",
    ),
  );
  const finishLinePoints = resolveFinishLinePoints(request);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px 0px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !token || !s3Key) {
      setFile(null);
      setFailed(!s3Key);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setFailed(false);

    void (async () => {
      try {
        const blob = await fetchS3BlobCached({
          s3Key,
          fileName,
          token,
          buildUrl: buildS3ProxyDownloadUrl,
          signal: ac.signal,
        });
        if (cancelled || ac.signal.aborted) return;
        setFile(fileFromModelBlob(blob, fileName));
      } catch {
        if (!cancelled && !ac.signal.aborted) {
          setFailed(true);
          setFile(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [visible, token, s3Key, fileName]);

  return (
    <div
      ref={rootRef}
      className={cn("h-full w-full", className)}
      aria-hidden
    >
      {file ? (
        <StlPreviewThumbnail
          file={file}
          finishLinePoints={finishLinePoints}
          className="pointer-events-none"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <Box
            className={cn("h-6 w-6 shrink-0", failed ? "opacity-40" : "opacity-60")}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}

export default FilledStlCardThumbnail;
