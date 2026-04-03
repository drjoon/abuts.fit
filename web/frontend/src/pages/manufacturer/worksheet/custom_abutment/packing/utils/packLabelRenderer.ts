import QRCode from "qrcode";
import { toKstYmd } from "@/shared/date/kst";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export type PackLabelRenderOptions = {
  mailboxCode: string;
  labName: string;
  screwType: string;
  lotNumber: string;
  requestId: string;
  clinicName: string;
  requestDate: string;
  patientName: string;
  toothNumber: string;
  material: string;
  implantManufacturer: string;
  implantBrand: string;
  implantFamily: string;
  implantType: string;
  manufacturingDate: string;
  caseType: string;
  printedAt: string;
  dpi?: number;
  targetDots?: { pw: number; ll: number };
  designDots?: { pw: number; ll: number; dpi: number };
};

export const downloadPngFromCanvas = async (
  canvas: HTMLCanvasElement,
  name: string,
) => {
  const blob = await canvasToPngBlob(canvas);
  if (!blob) throw new Error("PNG 생성에 실패했습니다.");
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const canvasToPngBlob = async (canvas: HTMLCanvasElement) => {
  console.log("[canvasToPngBlob] Canvas 크기:", {
    width: canvas.width,
    height: canvas.height,
    expectedDpi: 600,
    "80mm@600dpi": "1890x1535 픽셀이어야 함",
  });

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );

  if (blob) {
    console.log("[canvasToPngBlob] PNG 생성 완료:", {
      size: `${(blob.size / 1024).toFixed(2)} KB`,
      type: blob.type,
    });
  }

  return blob;
};

export const canvasToZplGraphic = (canvas: HTMLCanvasElement) => {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) {
    throw new Error("캔버스 크기가 올바르지 않습니다.");
  }

  const bytesPerRow = Math.ceil(width / 8);
  const normalizedCanvas = document.createElement("canvas");
  normalizedCanvas.width = width;
  normalizedCanvas.height = height;
  const normalizedCtx = normalizedCanvas.getContext("2d");
  if (!normalizedCtx) {
    throw new Error("canvas context를 생성할 수 없습니다.");
  }

  normalizedCtx.fillStyle = "white";
  normalizedCtx.fillRect(0, 0, width, height);
  normalizedCtx.drawImage(canvas, 0, 0, width, height);

  const image = normalizedCtx.getImageData(0, 0, width, height);
  const data = image.data;
  const rows: string[] = [];

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

export const buildPackLabelBitmapZpl = ({
  canvas,
  labelWidth,
  labelHeight,
}: {
  canvas: HTMLCanvasElement;
  labelWidth?: number;
  labelHeight?: number;
}) => {
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

export const resolveManufacturingDate = (req: ManufacturerRequest) => {
  const productionCompletedAt =
    (req.productionSchedule?.actualMachiningComplete as string | Date | null) ||
    null;
  const machiningReviewedAt =
    (req.caseInfos?.reviewByStage?.machining?.updatedAt as
      | string
      | undefined) || "";
  const timelineCompletedAt =
    (req.timeline?.actualCompletion as string | Date | null) || null;

  return {
    manufacturingDate:
      toKstYmd(productionCompletedAt) ||
      toKstYmd(machiningReviewedAt) ||
      toKstYmd(timelineCompletedAt) ||
      "",
    rawSources: {
      productionCompletedAt,
      machiningReviewedAt,
      timelineCompletedAt,
    },
  };
};

export const getLotLabel = (req: ManufacturerRequest) => {
  const lot = req.lotNumber as any;
  if (!lot) return "";
  return typeof lot.value === "string" ? lot.value.trim() : "";
};

const dateOnly = (value: string) => {
  const s = String(value || "").trim();
  if (!s) return "-";
  return s.includes("T") ? s.split("T")[0] : s;
};

const truncateToFit = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) => {
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

export const renderPackLabelToCanvas = async (opts: PackLabelRenderOptions) => {
  const dpi = Number(opts.dpi) || 600;
  const baseDpi = Number(opts.designDots?.dpi) || 600;
  const baseWidth = Number(opts.designDots?.pw) || 1890;
  const baseHeight = Number(opts.designDots?.ll) || 1535;
  const targetWidth =
    Number(opts.targetDots?.pw) || Math.round((baseWidth * dpi) / baseDpi);
  const targetHeight =
    Number(opts.targetDots?.ll) || Math.round((baseHeight * dpi) / baseDpi);
  const scale = targetWidth / baseWidth;

  console.log("[renderPackLabelToCanvas] 입력값:", {
    "opts.dpi": opts.dpi,
    "opts.designDots": opts.designDots,
    "opts.targetDots": opts.targetDots,
  });
  console.log("[renderPackLabelToCanvas] 계산된 값:", {
    dpi,
    baseDpi,
    baseWidth,
    baseHeight,
    targetWidth,
    targetHeight,
    scale,
  });
  const width = Math.round(targetWidth);
  const height = Math.round(targetHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context를 생성할 수 없습니다.");

  ctx.scale(scale, scale);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, baseWidth, baseHeight);
  ctx.fillStyle = "black";
  ctx.textBaseline = "top";

  const env = import.meta.env;
  const PRODUCT_NAME = env.VITE_PACK_PRODUCT_NAME;
  const MODEL_NAME = env.VITE_PACK_MODEL_NAME;
  const LICENSE_NO = env.VITE_PACK_LICENSE_NO;
  const COMPANY_NAME = env.VITE_PACK_MANUFACTURER_NAME;
  const COMPANY_ADDR = env.VITE_PACK_MANUFACTURER_ADDR;
  const COMPANY_TEL_FAX = env.VITE_PACK_MANUFACTURER_TEL_FAX;
  const MANUFACTURER_LABEL = "제조업자";
  const SELLER_NAME = env.VITE_PACK_SELLER_NAME;
  const SELLER_PERMIT = env.VITE_PACK_SELLER_PERMIT;
  const SELLER_ADDR = env.VITE_PACK_SELLER_ADDR;
  const SELLER_TEL = env.VITE_PACK_SELLER_TEL;
  const MANUAL_QR_LABEL = env.VITE_PACK_MANUAL_QR_LABEL;

  const drawBox = (x: number, y: number, w: number, h: number) => {
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  };

  const drawHLine = (x: number, y: number, w: number) => {
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, w, 2);
  };

  const drawVLine = (x: number, y: number, h: number) => {
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, 2, h);
  };

  const fillTextCentered = (
    text: string,
    x: number,
    y: number,
    w: number,
    padding = 0,
  ) => {
    const t = truncateToFit(
      ctx,
      String(text || "-"),
      Math.max(0, w - padding * 2),
    );
    const metrics = ctx.measureText(t);
    const tx = x + Math.max(0, (w - metrics.width) / 2);
    ctx.fillText(t, tx, y);
  };

  const fillTextCenteredInBox = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    padding = 0,
  ) => {
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

  const fillTextLeft = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
  ) => {
    const t = truncateToFit(ctx, String(text || "-"), maxWidth);
    ctx.fillText(t, x, y);
  };

  const fillWrappedTextLeft = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
  ) => {
    const source = String(text || "-").trim();
    if (!source) return;
    const words = source.split(/\s+/);
    const lines: string[] = [];
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

  const qr1DataUrl = await QRCode.toDataURL("https://abuts.fit/manual", {
    errorCorrectionLevel: "L",
    margin: 0,
    width: Math.max(1, Math.round(144 * scale)),
  });
  const qr1Img = new Image();
  await new Promise<void>((resolve, reject) => {
    qr1Img.onload = () => resolve();
    qr1Img.onerror = () => reject(new Error("QR 이미지 로드 실패"));
    qr1Img.src = qr1DataUrl;
  });

  const qr2DataUrl = await QRCode.toDataURL("https://acrodent.com", {
    errorCorrectionLevel: "L",
    margin: 0,
    width: Math.max(1, Math.round(144 * scale)),
  });
  const qr2Img = new Image();
  await new Promise<void>((resolve, reject) => {
    qr2Img.onload = () => resolve();
    qr2Img.onerror = () => reject(new Error("QR 이미지 로드 실패"));
    qr2Img.src = qr2DataUrl;
  });

  const qr3DataUrl = await QRCode.toDataURL("https://abuts.fit", {
    errorCorrectionLevel: "L",
    margin: 0,
    width: Math.max(1, Math.round(144 * scale)),
  });
  const qr3Img = new Image();
  await new Promise<void>((resolve, reject) => {
    qr3Img.onload = () => resolve();
    qr3Img.onerror = () => reject(new Error("QR 이미지 로드 실패"));
    qr3Img.src = qr3DataUrl;
  });

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

  drawBox(20, 74, 498, 46);
  ctx.font = "bold 36px Arial";
  fillTextCenteredInBox(opts.labName || "-", 20, 74, 498, 46, 16);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr1Img, 533, 24, 72, 72);
  ctx.imageSmoothingEnabled = true;
  ctx.font = "bold 10px Arial";
  fillTextCenteredInBox(MANUAL_QR_LABEL, 526, 98, 86, 14, 0);

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
  const detailRows: Array<Array<{ label: string; value: string }>> = [
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

  const drawDetailCell = (
    label: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    _isLastRow = false,
  ) => {
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
        false,
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
