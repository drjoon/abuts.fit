// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/VialStickerPrintDialog.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/utils/packLabelRenderer.ts
import { canvasToZplGraphic } from "./packLabelRenderer";

export const VIAL_STICKER_WIDTH_MM = 50;
export const VIAL_STICKER_HEIGHT_MM = 20;
/** 병 둘레보다 긴 끝. 글자를 넣지 않는다. */
export const VIAL_STICKER_OVERLAP_MM = 3;

const FONT_STACK =
  '"Malgun Gothic", "Apple SD Gothic Neo", "Apple SD 산돌고딕 Neo", "Noto Sans KR", sans-serif';

export const mmToDots = (mm: number, dpi: number) => {
  if (!Number.isFinite(mm) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return Math.max(0, Math.round((mm / 25.4) * dpi));
};

const fitSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  min: number,
  weight: number,
  maxWidth: number,
) => {
  let next = size;
  while (next > min) {
    ctx.font = `${weight} ${next}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth) return next;
    next -= 1;
  }
  ctx.font = `${weight} ${min}px ${FONT_STACK}`;
  return min;
};

const lineBox = (ctx: CanvasRenderingContext2D, text: string) => {
  const metrics = ctx.measureText(text);
  return {
    ascent: metrics.actualBoundingBoxAscent || 0,
    descent: metrics.actualBoundingBoxDescent || 0,
  };
};

export function drawVialSticker(
  ctx: CanvasRenderingContext2D,
  opts: { screwType: string; dpi: number },
) {
  const dpi = opts.dpi;
  const d = (mm: number) => mmToDots(mm, dpi);
  const width = d(VIAL_STICKER_WIDTH_MM);
  const height = d(VIAL_STICKER_HEIGHT_MM);
  const type = String(opts.screwType || "").trim() || "A";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const barW = Math.max(4, d(1.15));
  ctx.fillRect(0, 0, barW, height);

  const padL = barW + d(1.65);
  const right = width - d(VIAL_STICKER_OVERLAP_MM + 0.25);
  const topH = d(7.7);
  const rule = Math.max(2, d(0.22));
  ctx.fillRect(barW, topH - Math.floor(rule / 2), right - barW, rule);

  const url = "abuts.fit";
  const corp = "어벗츠 주식회사";
  const textMax = Math.max(0, right - padL);
  const urlSize = fitSize(ctx, url, d(2.45), d(1.7), 700, textMax);
  const corpSize = fitSize(ctx, corp, d(1.95), d(1.45), 500, textMax);
  const lineGap = d(0.42);

  ctx.font = `700 ${urlSize}px ${FONT_STACK}`;
  const urlBox = lineBox(ctx, url);
  ctx.font = `500 ${corpSize}px ${FONT_STACK}`;
  const corpBox = lineBox(ctx, corp);
  const brandH = urlBox.ascent + urlBox.descent + lineGap + corpBox.ascent + corpBox.descent;
  let y = Math.max(d(0.7), (topH - brandH) / 2);

  ctx.font = `700 ${urlSize}px ${FONT_STACK}`;
  ctx.fillText(url, padL, y + urlBox.ascent);
  y += urlBox.ascent + urlBox.descent + lineGap;
  ctx.font = `500 ${corpSize}px ${FONT_STACK}`;
  ctx.fillText(corp, padL, y + corpBox.ascent);

  const bottomTop = topH;
  const bottomH = height - bottomTop;
  const box = d(8.6);
  const stroke = Math.max(2, d(0.38));
  const boxX = right - box;
  const boxY = bottomTop + (bottomH - box) / 2;
  const radius = d(1.25);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(
      boxX + stroke / 2,
      boxY + stroke / 2,
      box - stroke,
      box - stroke,
      radius,
    );
  } else {
    ctx.rect(boxX + stroke / 2, boxY + stroke / 2, box - stroke, box - stroke);
  }
  ctx.lineWidth = stroke;
  ctx.strokeStyle = "#000000";
  ctx.stroke();

  const letterMax = box - stroke * 2 - d(1.3);
  let letterSize = d(5.1);
  while (letterSize > d(3)) {
    ctx.font = `700 ${letterSize}px ${FONT_STACK}`;
    const metrics = ctx.measureText(type);
    const letterH =
      (metrics.actualBoundingBoxAscent || 0) +
      (metrics.actualBoundingBoxDescent || 0);
    if (metrics.width <= letterMax && letterH <= letterMax) break;
    letterSize -= 1;
  }
  ctx.font = `700 ${letterSize}px ${FONT_STACK}`;
  const letter = lineBox(ctx, type);
  const letterW = ctx.measureText(type).width;
  ctx.fillText(
    type,
    boxX + (box - letterW) / 2,
    boxY + box / 2 + (letter.ascent - letter.descent) / 2,
  );

  const product = "커스텀어벗";
  const kind = "스크류";
  const productMax = Math.max(0, boxX - d(1.35) - padL);
  const productSize = fitSize(ctx, product, d(2.85), d(2), 700, productMax);
  const kindSize = fitSize(ctx, kind, d(2.05), d(1.5), 500, productMax);
  const productGap = d(0.35);

  ctx.font = `700 ${productSize}px ${FONT_STACK}`;
  const productBox = lineBox(ctx, product);
  ctx.font = `500 ${kindSize}px ${FONT_STACK}`;
  const kindBox = lineBox(ctx, kind);
  const stackH =
    productBox.ascent +
    productBox.descent +
    productGap +
    kindBox.ascent +
    kindBox.descent;
  let textY = bottomTop + Math.max(d(0.45), (bottomH - stackH) / 2);

  ctx.font = `700 ${productSize}px ${FONT_STACK}`;
  ctx.fillText(product, padL, textY + productBox.ascent);
  textY += productBox.ascent + productBox.descent + productGap;
  ctx.font = `500 ${kindSize}px ${FONT_STACK}`;
  ctx.fillText(kind, padL, textY + kindBox.ascent);
}

export function paintVialSticker(
  canvas: HTMLCanvasElement,
  opts: { screwType: string; dpi?: number },
) {
  const dpi = opts.dpi && opts.dpi > 0 ? opts.dpi : 600;
  canvas.width = mmToDots(VIAL_STICKER_WIDTH_MM, dpi);
  canvas.height = mmToDots(VIAL_STICKER_HEIGHT_MM, dpi);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context를 생성할 수 없습니다.");
  drawVialSticker(ctx, { screwType: opts.screwType, dpi });
  return canvas;
}

export function buildVialStickerZpl(canvas: HTMLCanvasElement, copies: number) {
  const graphic = canvasToZplGraphic(canvas);
  const qty = Math.max(1, Math.min(99, Math.floor(copies) || 1));
  return [
    "^XA",
    `^PW${graphic.width}`,
    `^LL${graphic.height}`,
    "^LH0,0",
    `^PQ${qty},0,1,Y`,
    `^FO0,0^GFA,${graphic.totalBytes},${graphic.totalBytes},${graphic.bytesPerRow},${graphic.data}`,
    "^XZ",
  ].join("\n");
}
