// change-log:
// - 2026-11-26: 각인(테두리만 진한 글자) 대응: 촘촘한 크롭 + 블러 + 적응 이진화. 90/270/180도 회전 후보. 지연 생성(ocrVariants).
// - 2026-11-26: 글자 영역(locate.js) 크롭 후보를 먼저 둔다. 잡티는 median, 이진화는 Otsu. 전체 화면 후보 추가.
// - 2026-11-26: 어두운 현미경 프레임용 밝기 부스트 후보 추가.
// - 2026-11-23: 금속 각인용 sharp 전처리. 중앙 ROI·정규화·이진화 후보.
// related files:
// - bg/pc2/lot-server2/src/ocr/index.js
// - bg/pc2/lot-server2/src/ocr/locate.js
// - bg/pc2/lot-server2/src/sharpness.js

import sharp from "sharp";
import { locateTextBoxes, otsuThreshold } from "./locate.js";

const BORDER = 20;

async function grayRaw(png) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  if (ch === 1) return { data, width: info.width, height: info.height };
  const out = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * ch];
  return { data: out, width: info.width, height: info.height };
}

function toPng(data, width, height) {
  return sharp(data, { raw: { width, height, channels: 1 } })
    .extend({ top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, background: "#ffffff" })
    .png()
    .toBuffer();
}

/** Otsu 이진화. 잉크는 검정(0), 바탕은 흰색(255). */
export function otsuBinarize(data, darkInk = true) {
  const t = otsuThreshold(data);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const ink = darkInk ? data[i] < t : data[i] >= t;
    out[i] = ink ? 0 : 255;
  }
  return out;
}

/**
 * 적응(국소 평균) 이진화. 조명이 고르지 않은 금속면에서 Otsu보다 낫다.
 * @param {number} win 창 크기(px, 홀수 권장)
 * @param {number} c 평균 대비 여유
 */
export function adaptiveBinarize(data, width, height, win, c = 6, darkInk = true) {
  const W1 = width + 1;
  const integral = new Float64Array(W1 * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += data[y * width + x];
      integral[(y + 1) * W1 + x + 1] = integral[y * W1 + x + 1] + row;
    }
  }
  const r = Math.max(1, win >> 1);
  const out = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const sum = integral[y1 * W1 + x1] - integral[y0 * W1 + x1] - integral[y1 * W1 + x0] + integral[y0 * W1 + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = data[y * width + x];
      const ink = darkInk ? v < mean - c : v > mean + c;
      out[y * width + x] = ink ? 0 : 255;
    }
  }
  return out;
}

/** 글자 영역 크롭 하나에서 후보들. 잘 맞던 조합을 앞에 둔다. */
export function cropVariantsFor(crop, darkInk) {
  return cropVariants(crop, darkInk);
}

async function* cropVariants(crop, darkInk) {
  const recipes = [
    { h: 96, blur: 2.5, mode: "adaptive" },
    { h: 140, blur: 2.5, mode: "adaptive" },
    { h: 64, blur: 1.5, mode: "adaptive" },
    { h: 140, blur: 0.6, mode: "otsu" },
    { h: 96, blur: 0.6, mode: "norm" },
  ];
  for (const r of recipes) {
    const png = await sharp(crop).greyscale().resize({ height: r.h }).normalize().blur(r.blur).png().toBuffer();
    const { data, width, height } = await grayRaw(png);
    if (r.mode === "adaptive") {
      yield toPng(adaptiveBinarize(data, width, height, Math.round(r.h / 3) | 1, 6, darkInk), width, height);
    } else if (r.mode === "otsu") {
      yield toPng(otsuBinarize(data, darkInk), width, height);
    } else {
      yield toPng(darkInk ? data : Buffer.from(data.map((v) => 255 - v)), width, height);
    }
  }
}

/**
 * 글자 영역 크롭을 방향별로 낸다: 0도(정/180도) → 90도(정/180도).
 * @param {Buffer} input
 * @returns {AsyncGenerator<{ crop: Buffer, darkInk: boolean, angle: number }>}
 */
export async function* textCrops(input) {
  for (const angle of [0, 90]) {
    const rotated = angle ? await sharp(input).rotate(angle).jpeg({ quality: 95 }).toBuffer() : input;
    const boxes = await locateTextBoxes(rotated, { maxBoxes: 2, padRatio: 0.12 }).catch(() => []);
    for (const box of boxes) {
      if (box.width < 8 || box.height < 8) continue;
      // 첫 글자가 잘리지 않게 좌우 여백을 조금 더 둔다.
      const extra = Math.round(box.height * 0.1);
      const meta = await sharp(rotated).metadata();
      const left = Math.max(0, box.left - extra);
      const right = Math.min(meta.width, box.left + box.width + extra);
      const region = { left, top: box.top, width: right - left, height: box.height };
      const crop = await sharp(rotated).extract(region).png().toBuffer();
      yield { crop, darkInk: box.darkInk, angle };
      yield { crop: await sharp(crop).rotate(180).png().toBuffer(), darkInk: box.darkInk, angle: angle + 180 };
    }
  }
}

/**
 * OCR 후보 이미지를 차례로 만든다(조기 종료 시 나머지는 만들지 않는다).
 * 순서: 0도 글자 영역(정/180도) → 90도 글자 영역(정/180도) → 중앙 ROI → 전체 화면.
 * @param {Buffer} input
 */
export async function* ocrVariants(input) {
  const meta = await sharp(input).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  for await (const { crop, darkInk } of textCrops(input)) {
    yield* cropVariants(crop, darkInk);
  }

  if (!width || !height) return;
  const left = Math.floor(width * 0.15);
  const top = Math.floor(height * 0.25);
  const cropW = Math.max(32, Math.floor(width * 0.7));
  const cropH = Math.max(32, Math.floor(height * 0.5));
  const center = sharp(input)
    .greyscale()
    .extract({
      left: Math.min(left, Math.max(0, width - cropW)),
      top: Math.min(top, Math.max(0, height - cropH)),
      width: Math.min(cropW, width),
      height: Math.min(cropH, height),
    });
  const normalized = await center
    .clone()
    .median(3)
    .normalize()
    .sharpen()
    .resize({ width: 640, height: 320, fit: "inside" })
    .png()
    .toBuffer();
  yield normalized;
  const n = await grayRaw(normalized);
  yield toPng(otsuBinarize(n.data, true), n.width, n.height);
  yield toPng(otsuBinarize(n.data, false), n.width, n.height);

  const full = await sharp(input).greyscale().median(3).normalize().resize({ width: 960, fit: "inside" }).png().toBuffer();
  yield full;
}

/** 전체 후보 목록(테스트·디버그용). */
export async function buildOcrVariants(input) {
  const out = [];
  for await (const v of ocrVariants(input)) out.push(v);
  return out;
}
