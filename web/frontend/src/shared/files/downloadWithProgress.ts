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

/**
 * 동일 오리진 프록시 다운로드 + XHR progress (0~100).
 * Content-Length가 없으면 indeterminate처럼 0으로 두고 완료 시 100.
 */
export function downloadWithProgress(
  options: DownloadWithProgressOptions,
): Promise<void> {
  const { url, token, fileName, onProgress, signal } = options;

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
      const blob = xhr.response as Blob;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = String(fileName || "download").trim() || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      resolve();
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
