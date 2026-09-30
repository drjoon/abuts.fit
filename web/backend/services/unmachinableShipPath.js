// 세척.패킹 이후 불완전가공은 단계를 되돌리지 않고 출고를 이어 간다.
// R&D 불완전가공 기록(unmachinableAt)은 그대로 남긴다.

export const UNMACHINABLE_SHIP_CONTINUE_STAGES = [
  "세척.패킹",
  "포장.발송",
  "shipping",
  "delivery",
  "배송대기",
  "배송중",
  "발송",
  "추적관리",
  "tracking",
  "완료",
  "배송완료",
];

const SHIP_CONTINUE_STAGE_SET = new Set(UNMACHINABLE_SHIP_CONTINUE_STAGES);

export function keepsUnmachinableOnShipPath(stage) {
  const value = String(stage || "").trim();
  if (!value) return false;
  if (SHIP_CONTINUE_STAGE_SET.has(value)) return true;
  return SHIP_CONTINUE_STAGE_SET.has(value.toLowerCase());
}

export function normalizeUnmachinableLabMessage(raw) {
  return String(raw || "").slice(0, 1000).trim();
}

export function normalizeUnmachinableLabPhotos(raw) {
  if (!Array.isArray(raw)) return [];
  const photos = [];
  for (const item of raw) {
    if (photos.length >= 4) break;
    const s3Key = String(item?.s3Key || item?.key || "").trim();
    const s3Url = String(item?.s3Url || item?.location || "").trim();
    const fileName = String(item?.fileName || item?.originalName || "").trim();
    if (!s3Key || !s3Url || !fileName) continue;
    const kind = String(item?.kind || "").trim() === "painted" ? "painted" : "photo";
    const fileSize = Number(item?.fileSize ?? item?.size ?? 0);
    photos.push({
      kind,
      fileName: fileName.slice(0, 180),
      fileType: String(item?.fileType || item?.mimetype || "")
        .trim()
        .slice(0, 80),
      fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : 0,
      s3Key: s3Key.slice(0, 500),
      s3Url: s3Url.slice(0, 2000),
      uploadedAt: new Date(),
    });
  }
  return photos;
}
