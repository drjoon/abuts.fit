// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/VialStickerPrintDialog.tsx
// - bg/pc2/pack-server/app.js
export const VIAL_STICKER_WIDTH_MM = 50;
export const VIAL_STICKER_HEIGHT_MM = 20;
/** TSC TTP-345. 300dpi를 1mm = 12dot 으로 센다. */
export const VIAL_STICKER_DOTS_PER_MM = 12;
export const VIAL_STICKER_DPI = VIAL_STICKER_DOTS_PER_MM * 25.4;
/** 갭 라벨. 연속 용지면 0으로 둔다. */
const VIAL_STICKER_GAP_MM = 3;
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
  const dpi = opts.dpi && opts.dpi > 0 ? opts.dpi : VIAL_STICKER_DPI;
  canvas.width = mmToDots(VIAL_STICKER_WIDTH_MM, dpi);
  canvas.height = mmToDots(VIAL_STICKER_HEIGHT_MM, dpi);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context를 생성할 수 없습니다.");
  drawVialSticker(ctx, { screwType: opts.screwType, dpi });
  return canvas;
}

const canvasToMonoBytes = (canvas: HTMLCanvasElement) => {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) {
    throw new Error("캔버스 크기가 올바르지 않습니다.");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context를 생성할 수 없습니다.");
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y += 1) {
    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byteIndex * 8 + bit;
        if (x >= width) continue;
        const idx = (y * width + x) * 4;
        const r = data[idx] ?? 255;
        const g = data[idx + 1] ?? 255;
        const b = data[idx + 2] ?? 255;
        const a = data[idx + 3] ?? 255;
        const luminance = (r * 299 + g * 587 + b * 114) / 1000;
        if (a > 0 && luminance < 200) value |= 1 << (7 - bit);
      }
      bytes[y * bytesPerRow + byteIndex] = value;
    }
  }
  return { height, bytesPerRow, bytes };
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

/** TTP-345 TSPL. 장수는 PRINT에 넣고, 비트맵은 1mm=12dot. */
export function buildVialStickerTspl(canvas: HTMLCanvasElement, copies: number) {
  const graphic = canvasToMonoBytes(canvas);
  const qty = Math.max(1, Math.min(99, Math.floor(copies) || 1));
  const head = [
    `SIZE ${VIAL_STICKER_WIDTH_MM} mm, ${VIAL_STICKER_HEIGHT_MM} mm`,
    `GAP ${VIAL_STICKER_GAP_MM} mm, 0 mm`,
    "DIRECTION 1",
    "CLS",
    `BITMAP 0,0,${graphic.bytesPerRow},${graphic.height},0,`,
  ].join("\r\n");
  const foot = `\r\nPRINT ${qty},1\r\n`;
  const encoder = new TextEncoder();
  const headBytes = encoder.encode(head);
  const footBytes = encoder.encode(foot);
  const out = new Uint8Array(headBytes.length + graphic.bytes.length + footBytes.length);
  out.set(headBytes, 0);
  out.set(graphic.bytes, headBytes.length);
  out.set(footBytes, headBytes.length + graphic.bytes.length);
  return bytesToBase64(out);
}
