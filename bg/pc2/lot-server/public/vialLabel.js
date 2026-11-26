// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/utils/vialStickerLabel.ts
// - bg/pc2/lot-server/public/station.js
// change-log:
// - 2026-11-26: 공병 라벨(50×20 TSPL) 브라우저 렌더 — FE vialStickerLabel 이식.
(function (global) {
  const WIDTH_MM = 50;
  const HEIGHT_MM = 20;
  const DOTS_PER_MM = 12;
  const DPI = DOTS_PER_MM * 25.4;
  const GAP_MM = 3;
  const LEFTOVER_MM = 3;
  const FONT_STACK =
    '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

  function mmToDots(mm, dpi) {
    if (!Number.isFinite(mm) || !Number.isFinite(dpi) || dpi <= 0) return 0;
    return Math.max(0, Math.round((mm / 25.4) * dpi));
  }

  function lineBox(ctx, text) {
    const metrics = ctx.measureText(text);
    return {
      ascent: metrics.actualBoundingBoxAscent || 0,
      descent: metrics.actualBoundingBoxDescent || 0,
    };
  }

  function drawAbutsHexMark(ctx, x, y, size) {
    const scale = size / 55;
    const ox = x + size / 2 - 32 * scale;
    const oy = y - 4.5 * scale;
    const trace = (points) => {
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
    ctx.lineWidth = Math.max(2.5, 3.6 * scale);
    ctx.stroke();
    trace([
      [32, 13],
      [48.5, 22.5],
      [48.5, 41.5],
      [32, 51],
      [15.5, 41.5],
      [15.5, 22.5],
    ]);
    ctx.lineWidth = Math.max(2, 2.4 * scale);
    ctx.stroke();
    ctx.restore();
  }

  function drawVialSticker(ctx, opts) {
    const dpi = opts.dpi || DPI;
    const d = (mm) => mmToDots(mm, dpi);
    const width = d(WIDTH_MM);
    const height = d(HEIGHT_MM);
    const type = String(opts.screwType || "").trim() || "A";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const sidePad = d((1.6 + LEFTOVER_MM + 1.0) / 2);
    const padL = sidePad;
    const right = width - sidePad;
    const topH = d((HEIGHT_MM * 4.5) / 10);
    const rule = Math.max(2, d(0.22));
    ctx.fillRect(padL, topH - Math.floor(rule / 2), Math.max(0, right - padL), rule);

    const url = "https://abuts.fit";
    const corp = "어벗츠 주식회사";
    const logoSize = d(3.9);
    const logoGap = d(0.7);
    const textMax = Math.max(0, right - padL);
    const pairGap = d(0.9);
    let pairSize = d(3.05);
    const pairMin = d(2.15);
    while (pairSize > pairMin) {
      ctx.font = `800 ${pairSize}px ${FONT_STACK}`;
      const urlW = ctx.measureText(url).width;
      const corpW = ctx.measureText(corp).width;
      if (urlW + pairGap + logoSize + logoGap + corpW <= textMax) break;
      pairSize -= 1;
    }

    ctx.font = `800 ${pairSize}px ${FONT_STACK}`;
    const urlBox = lineBox(ctx, url);
    const urlWidth = ctx.measureText(url).width;
    const brandH = urlBox.ascent + urlBox.descent;
    const baseline = Math.max(d(0.55), (topH - brandH) / 2) + urlBox.ascent;

    ctx.fillText(url, padL, baseline);
    const underline = Math.max(1, d(0.18));
    ctx.fillRect(padL, baseline + d(0.24), urlWidth, underline);

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

    const bottomTop = topH + Math.ceil(rule / 2);
    const bottomH = height - bottomTop;
    const box = Math.min(d(9.6), bottomH - d(1.2));
    const stroke = Math.max(3, d(0.48));
    const boxX = right - box;
    const boxY = bottomTop + (bottomH - box) / 2;
    const radius = d(1.8);
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

    const letterMax = box - stroke * 2 - d(0.8);
    let letterSize = d(6.2);
    while (letterSize > d(4.2)) {
      ctx.font = `800 ${letterSize}px ${FONT_STACK}`;
      const metrics = ctx.measureText(type);
      const letterH =
        (metrics.actualBoundingBoxAscent || 0) +
        (metrics.actualBoundingBoxDescent || 0);
      if (metrics.width <= letterMax && letterH <= letterMax) break;
      letterSize -= 1;
    }
    ctx.font = `800 ${letterSize}px ${FONT_STACK}`;
    const letter = lineBox(ctx, type);
    const letterW = ctx.measureText(type).width;
    ctx.fillText(
      type,
      boxX + (box - letterW) / 2,
      boxY + box / 2 + (letter.ascent - letter.descent) / 2,
    );

    const product = "커스텀 어벗 스크류";
    const productGap = d(2.2);
    const productMax = Math.max(0, boxX - productGap - padL);
    let productSize = d(3.2);
    const productMin = d(2.3);
    while (productSize > productMin) {
      ctx.font = `800 ${productSize}px ${FONT_STACK}`;
      if (ctx.measureText(product).width <= productMax) break;
      productSize -= 1;
    }
    ctx.font = `800 ${productSize}px ${FONT_STACK}`;
    const productBox = lineBox(ctx, product);
    const productH = productBox.ascent + productBox.descent;
    const productY = bottomTop + (bottomH - productH) / 2 + productBox.ascent;
    const productW = ctx.measureText(product).width;
    ctx.fillText(product, Math.max(padL, boxX - productGap - productW), productY);
  }

  function paintVialSticker(canvas, opts) {
    const dpi = opts.dpi && opts.dpi > 0 ? opts.dpi : DPI;
    canvas.width = mmToDots(WIDTH_MM, dpi);
    canvas.height = mmToDots(HEIGHT_MM, dpi);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context를 생성할 수 없습니다.");
    drawVialSticker(ctx, { screwType: opts.screwType, dpi });
    return canvas;
  }

  function canvasToMonoBytes(canvas) {
    const width = canvas.width;
    const height = canvas.height;
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
          const isInk = a > 0 && luminance < 200;
          if (!isInk) value |= 1 << (7 - bit);
        }
        bytes[y * bytesPerRow + byteIndex] = value;
      }
    }
    return { height, bytesPerRow, bytes };
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function buildVialStickerTspl(canvas, copies) {
    const graphic = canvasToMonoBytes(canvas);
    const qty = Math.max(1, Math.min(99, Math.floor(copies) || 1));
    const head = [
      `SIZE ${WIDTH_MM} mm, ${HEIGHT_MM} mm`,
      `GAP ${GAP_MM} mm, 0 mm`,
      "DIRECTION 1",
      "CLS",
      `BITMAP 0,0,${graphic.bytesPerRow},${graphic.height},0,`,
    ].join("\r\n");
    const foot = `\r\nPRINT ${qty},1\r\n`;
    const encoder = new TextEncoder();
    const headBytes = encoder.encode(head);
    const footBytes = encoder.encode(foot);
    const out = new Uint8Array(
      headBytes.length + graphic.bytes.length + footBytes.length,
    );
    out.set(headBytes, 0);
    out.set(graphic.bytes, headBytes.length);
    out.set(footBytes, headBytes.length + graphic.bytes.length);
    return bytesToBase64(out);
  }

  global.AbutsVialLabel = {
    WIDTH_MM,
    HEIGHT_MM,
    DPI,
    paintVialSticker,
    buildVialStickerTspl,
  };
})(window);
