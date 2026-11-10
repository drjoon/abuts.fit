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

/** AbutsLogo 육각형. 인쇄는 흑백이라 바깥·안쪽 테두리만 그린다. */
const drawAbutsHexMark = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) => {
  const scale = size / 55;
  const ox = x + size / 2 - 32 * scale;
  const oy = y - 4.5 * scale;
  const trace = (points: ReadonlyArray<readonly [number, number]>) => {
    ctx.beginPath();
    points.forEach(([px, py], index) => {
      const sx = ox + px * scale;
      const sy = oy + py * scale;
      if (index === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
  };
  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  trace([
    [32, 4.5],
    [56.5, 18],
    [56.5, 46],
    [32, 59.5],
    [7.5, 46],
    [7.5, 18],
  ]);
  ctx.lineWidth = Math.max(2, 2.5 * scale);
  ctx.stroke();
  trace([
    [32, 13],
    [48.5, 22.5],
    [48.5, 41.5],
    [32, 51],
    [15.5, 41.5],
    [15.5, 22.5],
  ]);
  ctx.lineWidth = Math.max(1.5, 1.4 * scale);
  ctx.stroke();
  ctx.restore();
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

  const padL = barW + d(2.6);
  const right = width - d(VIAL_STICKER_OVERLAP_MM + 1.4);
  const topH = d(7.7);
  const rule = Math.max(2, d(0.22));
  ctx.fillRect(padL, topH - Math.floor(rule / 2), Math.max(0, right - padL), rule);

  const url = "https://abuts.fit";
  const corp = "어벗츠 주식회사";
  const logoSize = d(4.6);
  const logoGap = d(1.05);
  const textMax = Math.max(0, right - padL);
  const pairGap = d(1.6);
  let pairSize = d(2.15);
  const pairMin = d(1.45);
  while (pairSize > pairMin) {
    ctx.font = `600 ${pairSize}px ${FONT_STACK}`;
    const urlW = ctx.measureText(url).width;
    ctx.font = `500 ${pairSize}px ${FONT_STACK}`;
    const corpW = ctx.measureText(corp).width;
    if (urlW + pairGap + logoSize + logoGap + corpW <= textMax) break;
    pairSize -= 1;
  }

  ctx.font = `600 ${pairSize}px ${FONT_STACK}`;
  const urlBox = lineBox(ctx, url);
  const urlWidth = ctx.measureText(url).width;
  const brandH = urlBox.ascent + urlBox.descent;
  const baseline = Math.max(d(0.8), (topH - brandH) / 2) + urlBox.ascent;

  ctx.fillText(url, padL, baseline);
  const underline = Math.max(1, d(0.12));
  ctx.fillRect(padL, baseline + d(0.28), urlWidth, underline);

  ctx.font = `500 ${pairSize}px ${FONT_STACK}`;
  const corpW = ctx.measureText(corp).width;
  drawAbutsHexMark(
    ctx,
    right - corpW - logoGap - logoSize,
    (topH - logoSize) / 2,
    logoSize,
  );
  ctx.textAlign = "right";
  ctx.fillText(corp, right, baseline);
  ctx.textAlign = "left";

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

  const product = "커스텀어벗 스크류";
  const productMax = Math.max(0, boxX - d(2.2) - padL);
  const productSize = fitSize(ctx, product, d(2.7), d(1.8), 700, productMax);
  ctx.font = `700 ${productSize}px ${FONT_STACK}`;
  const productBox = lineBox(ctx, product);
  const textY = bottomTop + (bottomH - (productBox.ascent + productBox.descent)) / 2;
  ctx.fillText(product, padL, textY + productBox.ascent);
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
