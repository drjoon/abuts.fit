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
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
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
  return (
    (typeof lot.final === "string" && lot.final.trim()) ||
    (typeof lot.part === "string" && lot.part.trim()) ||
    (typeof lot.material === "string" && lot.material.trim()) ||
    ""
  );
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
  const dpi = Number(opts.dpi) || 203;
  const baseDpi = Number(opts.designDots?.dpi) || 203;
  const baseWidth = Number(opts.designDots?.pw) || 520;
  const baseHeight = Number(opts.designDots?.ll) || 640;
  const targetWidth =
    Number(opts.targetDots?.pw) || Math.round((baseWidth * dpi) / baseDpi);
  const targetHeight =
    Number(opts.targetDots?.ll) || Math.round((baseHeight * dpi) / baseDpi);
  const scale = targetWidth / baseWidth;
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

  const PRODUCT_NAME = "임플란트 상부구조물";
  const MODEL_NAME = "CA6512";
  const LICENSE_NO = "제3583호";
  const COMPANY_NAME = "(주)애크로덴트";
  const COMPANY_ADDR = "경남 김해시 전하로85번길 5(나동, 흥동)";
  const COMPANY_TEL_FAX = "T 055-314-4607  F 055-901-0241";
  const ABUTS_COMPANY_NAME = "어벗츠 주식회사";
  const ABUTS_SALES_PERMIT = "판매업허가 제####호";
  const ABUTS_ADDR = "경상남도 김해시 흥동 전하로 85번길 5";
  const ABUTS_TEL = "T 1588-3948";
  const ABUTS_WEB = "https://abuts.fit";

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

  const qr1DataUrl = await QRCode.toDataURL(
    JSON.stringify({
      lotNumber: opts.lotNumber || "-",
      manufacturingDate: dateOnly(opts.manufacturingDate),
    }),
    {
      errorCorrectionLevel: "M",
      margin: 0,
      width: Math.max(1, Math.round(80 * scale)),
    },
  );
  const qr1Img = new Image();
  await new Promise<void>((resolve, reject) => {
    qr1Img.onload = () => resolve();
    qr1Img.onerror = () => reject(new Error("QR 이미지 로드 실패"));
    qr1Img.src = qr1DataUrl;
  });

  const qr2DataUrl = await QRCode.toDataURL(
    JSON.stringify({
      lotNumber: opts.lotNumber || "-",
      manufacturingDate: dateOnly(opts.manufacturingDate),
    }),
    {
      errorCorrectionLevel: "M",
      margin: 0,
      width: Math.max(1, Math.round(70 * scale)),
    },
  );
  const qr2Img = new Image();
  await new Promise<void>((resolve, reject) => {
    qr2Img.onload = () => resolve();
    qr2Img.onerror = () => reject(new Error("QR 이미지 로드 실패"));
    qr2Img.src = qr2DataUrl;
  });

  const qr3DataUrl = await QRCode.toDataURL(
    JSON.stringify({ company: ABUTS_COMPANY_NAME, web: ABUTS_WEB }),
    {
      errorCorrectionLevel: "M",
      margin: 0,
      width: Math.max(1, Math.round(70 * scale)),
    },
  );
  const qr3Img = new Image();
  await new Promise<void>((resolve, reject) => {
    qr3Img.onload = () => resolve();
    qr3Img.onerror = () => reject(new Error("QR 이미지 로드 실패"));
    qr3Img.src = qr3DataUrl;
  });

  drawBox(42, 52, 436, 58);
  drawVLine(236, 52, 58);
  drawVLine(333, 52, 58);
  ctx.font = "bold 58px Arial";
  fillTextCentered(opts.mailboxCode || "-", 42, 56, 194, 8);
  fillTextCentered(opts.screwType || "-", 236, 56, 97, 8);
  {
    const lot = String(opts.lotNumber || "-");
    const suffix = lot.length >= 3 ? lot.slice(-3) : lot;
    fillTextCentered(suffix, 333, 56, 145, 8);
  }

  drawBox(42, 114, 436, 58);
  ctx.font = "bold 40px Arial";
  fillTextCenteredInBox(opts.labName || "-", 42, 114, 436, 58, 16);

  drawBox(42, 182, 436, 32);
  ctx.font = "22px Arial";
  fillTextCentered(
    `${opts.clinicName || "-"} / ${opts.patientName || "-"} / #${opts.toothNumber || "-"}`,
    42,
    191,
    436,
    12,
  );

  drawBox(42, 218, 436, 32);
  ctx.font = "22px Arial";
  fillTextCentered(
    `의뢰일: ${dateOnly(opts.requestDate)} / 제조일: ${dateOnly(opts.manufacturingDate)}`,
    42,
    227,
    436,
    12,
  );

  drawBox(42, 254, 436, 32);
  ctx.font = "22px Arial";
  fillTextCentered(
    `${opts.implantManufacturer || "-"} / ${opts.implantBrand || "-"} / ${opts.implantFamily || "-"} / ${opts.implantType || "-"}`,
    42,
    263,
    436,
    12,
  );

  drawBox(42, 290, 436, 32);
  ctx.font = "22px Arial";
  fillTextCentered(`제조번호: ${opts.lotNumber || "-"}`, 42, 299, 436, 12);

  const detailsY = 326;
  const detailsH = 88;
  const leftW = 320;
  const rightW = 116;
  const leftX = 42;
  const rightX = leftX + leftW;

  drawBox(leftX, detailsY, leftW, detailsH);
  drawBox(rightX, detailsY, rightW, detailsH);
  const midX = leftX + 160;
  drawVLine(midX, detailsY, detailsH);
  drawHLine(leftX, detailsY + 22, leftW);
  drawHLine(leftX, detailsY + 44, leftW);
  drawHLine(leftX, detailsY + 66, leftW);

  ctx.font = "13px Arial";
  ctx.fillText(`품명: ${PRODUCT_NAME}`, leftX + 8, detailsY + 6);
  ctx.fillText("비멸균 의료기기", midX + 8, detailsY + 6);
  ctx.fillText(`모델명: ${MODEL_NAME}`, leftX + 8, detailsY + 28);
  ctx.fillText(`품목허가: ${LICENSE_NO}`, midX + 8, detailsY + 28);
  ctx.fillText("사용기한: 해당없음", leftX + 8, detailsY + 50);
  ctx.fillText("사용방법: 사용자 매뉴얼", midX + 8, detailsY + 50);
  ctx.fillText("포장단위: 1 SET", leftX + 8, detailsY + 72);
  ctx.fillText("주의사항: 매뉴얼 참조", midX + 8, detailsY + 72);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr1Img, rightX + 18, detailsY + 4, 80, 80);
  ctx.imageSmoothingEnabled = true;

  drawBox(42, 424, 436, 76);
  ctx.font = "16px Arial";
  ctx.fillText(COMPANY_NAME, 50, 432);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr2Img, 370, 434, 56, 56);
  ctx.imageSmoothingEnabled = true;
  ctx.font = "12px Arial";
  ctx.fillText(`제조업허가: ${LICENSE_NO}`, 50, 452);
  ctx.fillText(COMPANY_ADDR, 50, 466);
  ctx.fillText(COMPANY_TEL_FAX, 50, 480);

  drawBox(42, 504, 436, 76);
  ctx.font = "16px Arial";
  ctx.fillText(ABUTS_COMPANY_NAME, 50, 512);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr3Img, 370, 514, 56, 56);
  ctx.imageSmoothingEnabled = true;
  ctx.font = "12px Arial";
  ctx.fillText(ABUTS_SALES_PERMIT, 50, 532);
  ctx.fillText(ABUTS_ADDR, 50, 546);
  ctx.fillText(`${ABUTS_TEL} / ${ABUTS_WEB}`, 50, 560);

  return canvas;
};
