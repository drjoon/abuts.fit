import { createCanvas, loadImage } from "canvas";
import QRCode from "qrcode";

/**
 * 프론트엔드 packLabelRenderer.ts와 동일한 로직으로 Canvas 기반 라벨 생성
 * 600 DPI 기준으로 80x65mm = 1890x1535 dots
 */

const dateOnly = (value) => {
  const s = String(value || "").trim();
  if (!s) return "-";
  return s.includes("T") ? s.split("T")[0] : s;
};

const truncateToFit = (ctx, text, maxWidth) => {
  const raw = String(text || "-");
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  const ellipsis = "...";
  let left = 0;
  let right = raw.length;
  let best = ellipsis;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const candidate = `${raw.slice(0, mid).trimEnd()}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      best = candidate;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return best;
};

const renderPackLabelToCanvas = async (opts) => {
  const dpi = Number(opts.dpi) || 600;
  const baseDpi = Number(opts.designDots?.dpi) || 600;
  const baseWidth = Number(opts.designDots?.pw) || 1890;
  const baseHeight = Number(opts.designDots?.ll) || 1535;
  const targetWidth =
    Number(opts.targetDots?.pw) || Math.round((baseWidth * dpi) / baseDpi);
  const targetHeight =
    Number(opts.targetDots?.ll) || Math.round((baseHeight * dpi) / baseDpi);
  const scale = targetWidth / baseWidth;
  const width = Math.round(targetWidth);
  const height = Math.round(targetHeight);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.scale(scale, scale);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, baseWidth, baseHeight);
  ctx.fillStyle = "black";
  ctx.textBaseline = "top";

  const PRODUCT_NAME = process.env.PACK_PRODUCT_NAME;
  const MODEL_NAME = process.env.PACK_MODEL_NAME;
  const LICENSE_NO = process.env.PACK_LICENSE_NO;
  const COMPANY_NAME = process.env.PACK_MANUFACTURER_NAME;
  const COMPANY_ADDR = process.env.PACK_MANUFACTURER_ADDR;
  const MANUFACTURER_LABEL = "제조업자";
  const SELLER_NAME = process.env.PACK_SELLER_NAME;
  const SELLER_PERMIT = process.env.PACK_SELLER_PERMIT;
  const SELLER_ADDR = process.env.PACK_SELLER_ADDR;
  const SELLER_TEL = process.env.PACK_SELLER_TEL;
  const MANUAL_QR_LABEL = process.env.PACK_MANUAL_QR_LABEL;

  const drawBox = (x, y, w, h) => {
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  };

  const drawHLine = (x, y, w) => {
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, w, 2);
  };

  const drawVLine = (x, y, h) => {
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, 2, h);
  };

  const fillTextCentered = (text, x, y, w, padding = 0) => {
    const t = truncateToFit(
      ctx,
      String(text || "-"),
      Math.max(0, w - padding * 2),
    );
    const metrics = ctx.measureText(t);
    const tx = x + Math.max(0, (w - metrics.width) / 2);
    ctx.fillText(t, tx, y);
  };

  const fillTextCenteredInBox = (text, x, y, w, h, padding = 0) => {
    const t = truncateToFit(
      ctx,
      String(text || "-"),
      Math.max(0, w - padding * 2),
    );
    const metrics = ctx.measureText(t);
    const tx = x + Math.max(0, (w - metrics.width) / 2);
    const ascent = metrics.actualBoundingBoxAscent || 0;
    const descent = metrics.actualBoundingBoxDescent || 0;
    const ty = y + (h + ascent - descent) / 2;
    ctx.fillText(t, tx, ty);
  };

  const fillTextLeft = (text, x, y, maxWidth) => {
    const t = truncateToFit(ctx, String(text || "-"), maxWidth);
    ctx.fillText(t, x, y);
  };

  const fillWrappedTextLeft = (text, x, y, maxWidth, lineHeight, maxLines) => {
    const source = String(text || "-").trim();
    if (!source) return;
    const words = source.split(/\s+/);
    const lines = [];
    let current = "";

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        return;
      }
      lines.push(current);
      current = word;
    });

    if (current) lines.push(current);

    lines.slice(0, maxLines).forEach((line, index) => {
      const rendered =
        index === maxLines - 1 && lines.length > maxLines
          ? truncateToFit(ctx, `${line}…`, maxWidth)
          : line;
      ctx.fillText(rendered, x, y + index * lineHeight);
    });
  };

  // QR 코드 생성
  const qr1Buffer = await QRCode.toBuffer("https://abuts.fit/manual", {
    errorCorrectionLevel: "L",
    margin: 0,
    width: Math.max(1, Math.round(144 * scale)),
  });
  const qr1Img = await loadImage(qr1Buffer);

  const qr2Buffer = await QRCode.toBuffer("https://acrodent.com", {
    errorCorrectionLevel: "L",
    margin: 0,
    width: Math.max(1, Math.round(144 * scale)),
  });
  const qr2Img = await loadImage(qr2Buffer);

  const qr3Buffer = await QRCode.toBuffer("https://abuts.fit", {
    errorCorrectionLevel: "L",
    margin: 0,
    width: Math.max(1, Math.round(144 * scale)),
  });
  const qr3Img = await loadImage(qr3Buffer);

  // 상단 3칸 박스 (우편함, 나사, Lot)
  drawBox(20, 20, 498, 50);
  drawVLine(202, 20, 50);
  drawVLine(362, 20, 50);
  ctx.font = "bold 48px Arial";
  fillTextCentered(opts.mailboxCode || "-", 20, 24, 182, 8);
  fillTextCentered(opts.screwType || "-", 202, 24, 160, 8);
  {
    const lot = String(opts.lotNumber || "-");
    const suffix = lot.length >= 3 ? lot.slice(-3) : lot;
    fillTextCentered(suffix, 362, 24, 156, 8);
  }

  // 치과명
  drawBox(20, 74, 498, 46);
  ctx.font = "bold 36px Arial";
  fillTextCenteredInBox(opts.labName || "-", 20, 74, 498, 46, 16);

  // 매뉴얼 QR
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr1Img, 533, 24, 72, 72);
  ctx.imageSmoothingEnabled = true;
  ctx.font = "bold 10px Arial";
  fillTextCenteredInBox(MANUAL_QR_LABEL, 526, 98, 86, 14, 0);

  // 통합 정보 테이블
  const unifiedTopY = 124;
  const infoRowHeights = [28, 28, 28];
  const unifiedDetailsY =
    unifiedTopY + infoRowHeights.reduce((sum, h) => sum + h, 0);
  const detailsY = unifiedDetailsY;
  const detailRowHeights = [28, 28, 28, 28];
  const detailColWidth = 340;
  const infoH = infoRowHeights.reduce((sum, h) => sum + h, 0);
  const detailsH = detailRowHeights.reduce((sum, h) => sum + h, 0);
  const usageTextH = 30;
  const usageSectionH = usageTextH;
  const unifiedTableH = infoH + detailsH + usageSectionH;
  const detailRows = [
    [
      { label: "품    명", value: PRODUCT_NAME },
      { label: "기기 구분", value: "비멸균 의료기기" },
    ],
    [
      { label: "모 델 명", value: MODEL_NAME },
      { label: "품목허가", value: LICENSE_NO },
    ],
    [
      { label: "사용기한", value: "해당없음" },
      { label: "포장단위", value: "1SET" },
    ],
    [
      { label: "제조번호", value: opts.lotNumber || "-" },
      { label: "제조일자", value: dateOnly(opts.manufacturingDate) },
    ],
  ];

  drawBox(20, unifiedTopY, 600, unifiedTableH);
  ctx.font = "bold 14px Arial";
  fillTextCentered(
    `${opts.clinicName || "-"} / ${opts.patientName || "-"} / #${opts.toothNumber || "-"}`,
    20,
    unifiedTopY + 8,
    600,
    14,
  );
  drawHLine(20, unifiedTopY + infoRowHeights[0], 600);
  fillTextCentered(
    `의뢰일: ${dateOnly(opts.requestDate)} / 제조일: ${dateOnly(opts.manufacturingDate)}`,
    20,
    unifiedTopY + infoRowHeights[0] + 8,
    600,
    14,
  );
  drawHLine(20, unifiedTopY + infoRowHeights[0] + infoRowHeights[1], 600);
  fillTextCentered(
    `${opts.implantManufacturer || "-"} / ${opts.implantBrand || "-"} / ${opts.implantFamily || "-"} / ${opts.implantType || "-"}`,
    20,
    unifiedTopY + infoRowHeights[0] + infoRowHeights[1] + 8,
    600,
    14,
  );
  drawHLine(20, unifiedDetailsY, 600);
  drawVLine(20 + detailColWidth, detailsY, detailsH);

  const drawDetailCell = (label, value, x, y, w, h) => {
    ctx.font = "bold 13px Arial";
    fillTextCenteredInBox(`${label} : ${value}`, x, y + 3, w, h - 6, 0);
  };

  let rowStartY = detailsY;
  detailRows.forEach((row, rowIdx) => {
    const rowHeight = detailRowHeights[rowIdx];
    if (rowIdx > 0) {
      drawHLine(20, rowStartY, 600);
    }
    row.forEach((cell, colIdx) => {
      const cellX = 20 + colIdx * detailColWidth;
      drawDetailCell(
        cell.label,
        cell.value,
        cellX,
        rowStartY,
        detailColWidth,
        rowHeight,
      );
    });
    rowStartY += rowHeight;
  });

  const usageY = detailsY + detailsH;
  drawHLine(20, usageY, 600);
  drawVLine(20 + detailColWidth, usageY, usageTextH);
  ctx.font = "bold 13px Arial";
  fillTextCenteredInBox(
    "사용방법, 주의사항 : 사용자 매뉴얼 참조",
    20,
    usageY + 4,
    detailColWidth,
    usageTextH - 6,
    0,
  );
  fillTextCenteredInBox(
    "보관방법 : 건조한 실온에서 보관",
    20 + detailColWidth,
    usageY + 4,
    600 - detailColWidth,
    usageTextH - 6,
    0,
  );

  // 제조업자 / 판매업자
  const companyY = unifiedTopY + unifiedTableH + 16;
  const companyH = 144;
  const companyQrSize = 66;
  const companyQrPaddingX = 8;
  const companyQrPaddingTop = 8;
  const companyTopTextWidth = 186;
  const companyBottomTextWidth = 254;
  const companyLineYs = [18, 42, 66, 90, 114];
  drawBox(20, companyY, 290, companyH);
  ctx.font = "bold 14px Arial";
  ctx.fillText(MANUFACTURER_LABEL, 26, companyY + companyLineYs[0]);
  ctx.font = "12px Arial";
  fillTextLeft(
    COMPANY_NAME,
    26,
    companyY + companyLineYs[1],
    companyTopTextWidth,
  );
  fillTextLeft(
    `제조업허가 ${LICENSE_NO}`,
    26,
    companyY + companyLineYs[2],
    companyTopTextWidth,
  );
  fillWrappedTextLeft(
    COMPANY_ADDR,
    26,
    companyY + companyLineYs[3],
    companyBottomTextWidth,
    18,
    2,
  );
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    qr2Img,
    20 + 290 - companyQrPaddingX - companyQrSize,
    companyY + companyQrPaddingTop,
    companyQrSize,
    companyQrSize,
  );
  ctx.imageSmoothingEnabled = true;

  drawBox(330, companyY, 290, companyH);
  ctx.font = "bold 14px Arial";
  ctx.fillText("판매업자", 336, companyY + companyLineYs[0]);
  ctx.font = "12px Arial";
  fillTextLeft(
    SELLER_NAME,
    336,
    companyY + companyLineYs[1],
    companyTopTextWidth,
  );
  fillTextLeft(
    SELLER_PERMIT,
    336,
    companyY + companyLineYs[2],
    companyTopTextWidth,
  );
  fillTextLeft(
    SELLER_TEL,
    336,
    companyY + companyLineYs[3],
    companyBottomTextWidth,
  );
  fillWrappedTextLeft(
    SELLER_ADDR,
    336,
    companyY + companyLineYs[4],
    companyBottomTextWidth,
    18,
    2,
  );
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    qr3Img,
    330 + 290 - companyQrPaddingX - companyQrSize,
    companyY + companyQrPaddingTop,
    companyQrSize,
    companyQrSize,
  );
  ctx.imageSmoothingEnabled = true;

  return canvas;
};

const canvasToZplGraphic = (canvas) => {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) {
    throw new Error("캔버스 크기가 올바르지 않습니다.");
  }

  const bytesPerRow = Math.ceil(width / 8);
  const ctx = canvas.getContext("2d");
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const rows = [];

  for (let y = 0; y < height; y += 1) {
    let rowHex = "";
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
        const isBlack = a > 0 && luminance < 200;
        if (isBlack) {
          value |= 1 << (7 - bit);
        }
      }
      rowHex += value.toString(16).toUpperCase().padStart(2, "0");
    }
    rows.push(rowHex);
  }

  const totalBytes = bytesPerRow * height;
  return {
    width,
    height,
    bytesPerRow,
    totalBytes,
    data: rows.join("\n"),
  };
};

const buildPackLabelBitmapZpl = ({ canvas, labelWidth, labelHeight }) => {
  const graphic = canvasToZplGraphic(canvas);
  const pw = Number(labelWidth) || graphic.width;
  const ll = Number(labelHeight) || graphic.height;
  return [
    "^XA",
    `^PW${pw}`,
    `^LL${ll}`,
    "^LH0,0",
    "^CI28",
    `^FO0,0^GFA,${graphic.totalBytes},${graphic.totalBytes},${graphic.bytesPerRow},${graphic.data}`,
    "^XZ",
  ].join("\n");
};

export { renderPackLabelToCanvas, canvasToZplGraphic, buildPackLabelBitmapZpl };
