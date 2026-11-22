// change-log:
// - 2026-11-23: 금속 각인용 sharp 전처리. 중앙 ROI·정규화·이진화 후보.
// related files:
// - bg/pc2/lot-server2/src/ocr/index.js
// - bg/pc2/lot-server2/src/sharpness.js

import sharp from "sharp";

/**
 * OCR 후보 이미지를 여러 장 만든다. 호출측이 가장 잘 읽힌 것을 고른다.
 * @param {Buffer} input
 * @returns {Promise<Buffer[]>}
 */
export async function buildOcrVariants(input) {
  const meta = await sharp(input).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const left = Math.floor(width * 0.15);
  const top = Math.floor(height * 0.25);
  const cropW = Math.max(32, Math.floor(width * 0.7));
  const cropH = Math.max(32, Math.floor(height * 0.5));

  let base = sharp(input).greyscale();
  if (width > 0 && height > 0) {
    base = base.extract({
      left: Math.min(left, Math.max(0, width - cropW)),
      top: Math.min(top, Math.max(0, height - cropH)),
      width: Math.min(cropW, width),
      height: Math.min(cropH, height),
    });
  }

  const normalized = await base
    .clone()
    .normalize()
    .sharpen()
    .resize({ width: 640, height: 320, fit: "inside" })
    .png()
    .toBuffer();

  const inverted = await sharp(normalized).negate().png().toBuffer();

  const threshold = await sharp(normalized)
    .threshold(140)
    .png()
    .toBuffer();

  const thresholdInv = await sharp(inverted)
    .threshold(140)
    .png()
    .toBuffer();

  return [normalized, inverted, threshold, thresholdInv];
}
