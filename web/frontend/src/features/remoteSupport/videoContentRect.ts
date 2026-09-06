// related files:
// - web/frontend/src/features/remoteSupport/openRemoteSupportViewer.ts
// - web/frontend/src/pages/admin/support/AdminRemoteSupportPage.tsx

/** Content box of a <video> using object-fit: contain (letterboxed). */
export function getVideoContentRect(video: HTMLVideoElement): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null {
  const rect = video.getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (!vw || !vh) {
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }
  const scale = Math.min(rect.width / vw, rect.height / vh);
  const width = vw * scale;
  const height = vh * scale;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

/** Normalize pointer to 0..1 over the visible video content (not letterbox). */
export function normalizeVideoPointer(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const box = getVideoContentRect(video);
  if (!box || box.width <= 0 || box.height <= 0) return null;
  const x = (clientX - box.left) / box.width;
  const y = (clientY - box.top) / box.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}
