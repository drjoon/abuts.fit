// change-log:
// - 2026-08-16: fetchBlobWithProgress — 저장 없이 blob만 반환(3D 프리뷰용).
// - 2026-08-16: saveBlobAsDownload 분리(IndexedDB 캐시 히트 후 저장 재사용).
// related files:
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/requests/components/UploadProgressToast.tsx

export type DownloadWithProgressOptions = {
  url: string;
  token: string;
  fileName: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

type FetchBlobWithProgressOptions = {
  url: string;
  token: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

function xhrGetBlob(options: {
  url: string;
  token: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const { url, token, onProgress, signal } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "blob";
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Cache-Control", "no-store");

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    xhr.onprogress = (evt) => {
      if (!onProgress) return;
      if (evt.lengthComputable && evt.total > 0) {
        onProgress(Math.max(0, Math.min(100, (evt.loaded / evt.total) * 100)));
      } else if (evt.loaded > 0) {
        // length unknown: soft ramp capped below 95 until done
        onProgress(Math.min(90, Math.round(Math.log10(evt.loaded + 1) * 15)));
      }
    };

    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`다운로드 실패 (${xhr.status})`));
        return;
      }
      onProgress?.(100);
      resolve(xhr.response as Blob);
    };

    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("다운로드 네트워크 오류"));
    };

    xhr.onabort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    onProgress?.(0);
    xhr.send();
  });
}

/**
 * 동일 오리진 프록시 다운로드 + XHR progress (0~100).
 * Content-Length가 없으면 indeterminate처럼 0으로 두고 완료 시 100.
 */
export function downloadWithProgress(
  options: DownloadWithProgressOptions,
): Promise<void> {
  const { url, token, fileName, onProgress, signal } = options;

  return xhrGetBlob({ url, token, onProgress, signal }).then((blob) => {
    saveBlobAsDownload(blob, fileName);
  });
}

/** Blob을 브라우저 다운로드로 저장한다. */
export function saveBlobAsDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = String(fileName || "download").trim() || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** S3 프록시에서 blob만 가져온다(파일 저장 다이얼로그 없음). */
export function fetchBlobWithProgress(
  options: FetchBlobWithProgressOptions,
): Promise<Blob> {
  return xhrGetBlob(options);
}
