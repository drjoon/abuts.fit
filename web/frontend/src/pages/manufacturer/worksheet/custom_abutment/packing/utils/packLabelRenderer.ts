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
  modelName?: string;
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

// ⚠️ 이 렌더러와 동일한 로직이 백엔드에도 존재합니다.
// 디자인(레이아웃·폰트·텍스트) 수정 시 반드시 아래 파일도 함께 수정하세요:
//   web/backend/utils/packLabelRenderer.js  (AI 로트 캡처 자동 출력 경로)
export const renderPackLabelToCanvas = async (opts: PackLabelRenderOptions) => {
  const dpi = Number(opts.dpi) || 600;
  const baseDpi = Number(opts.designDots?.dpi) || 600;
  // 기준 캔버스 크기: 가로 630도트 × 세로 530도트 (600dpi 기준 약 63mm×53mm = 표준 의료기기 라벨)
  const baseWidth = Number(opts.designDots?.pw) || 1890;
  const baseHeight = Number(opts.designDots?.ll) || 1535;
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

  const env = import.meta.env;
  // 법정 기재 항목 (환경변수)
  const PRODUCT_NAME = (
    env.VITE_PACK_PRODUCT_NAME || "임플란트 상부구조물"
  ).replace(/['"]/g, "");
  const MODEL_NAME = (opts.modelName || env.VITE_PACK_MODEL_NAME || "").replace(
    /['"]/g,
    "",
  );
  const LICENSE_NO = env.VITE_PACK_LICENSE_NO || "";
  const COMPANY_NAME = (env.VITE_PACK_MANUFACTURER_NAME || "").replace(
    /['"]/g,
    "",
  );
  const COMPANY_ADDR = (env.VITE_PACK_MANUFACTURER_ADDR || "").replace(
    /['"]/g,
    "",
  );
  const COMPANY_TEL_FAX = (env.VITE_PACK_MANUFACTURER_TEL_FAX || "").replace(
    /['"]/g,
    "",
  );
  const SELLER_NAME = (env.VITE_PACK_SELLER_NAME || "").replace(/['"]/g, "");
  const SELLER_PERMIT = (env.VITE_PACK_SELLER_PERMIT || "").replace(
    /['"]/g,
    "",
  );
  const SELLER_ADDR = (env.VITE_PACK_SELLER_ADDR || "").replace(/['"]/g, "");
  const SELLER_TEL = (env.VITE_PACK_SELLER_TEL || "").replace(/['"]/g, "");
  const MANUAL_QR_LABEL = env.VITE_PACK_MANUAL_QR_LABEL || "사용자매뉴얼";
  // UDI: (01) GTIN 모델별 고유번호
  const UDI_GTIN = env.VITE_PACK_UDI_GTIN || "";
  const MANUFACTURER_PERMIT_NO =
    env.VITE_PACK_MANUFACTURER_PERMIT_NO || LICENSE_NO;
  const CERT_INFO = (env.VITE_PACK_CERT_INFO || "").replace(/['"]/g, "");
  const HOMEPAGE_URL = (env.VITE_PACK_HOMEPAGE_URL || "").replace(/['"]/g, "");

  // ── 유틸리티 함수 ─────────────────────────────────────────────

  const drawBox = (x: number, y: number, w: number, h: number) => {
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  };

  const drawHLine = (x: number, y: number, w: number, thickness = 2) => {
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, w, thickness);
  };

  const drawVLine = (x: number, y: number, h: number, thickness = 2) => {
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, thickness, h);
  };

  const fillTextCenteredInBox = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    padding = 4,
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
    ctx.fillStyle = "black";
    ctx.fillText(t, tx, ty);
  };

  const fillTextLeft = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
  ) => {
    const t = truncateToFit(ctx, String(text || ""), maxWidth);
    ctx.fillStyle = "black";
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
    const source = String(text || "").trim();
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
    ctx.fillStyle = "black";
    lines.slice(0, maxLines).forEach((line, index) => {
      const rendered =
        index === maxLines - 1 && lines.length > maxLines
          ? truncateToFit(ctx, `${line}…`, maxWidth)
          : line;
      ctx.fillText(rendered, x, y + index * lineHeight);
    });
  };

  const fillWrappedTextCenteredInBox = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    lineHeight: number,
    padding = 4,
  ) => {
    const source = String(text || "").trim();
    if (!source) return;
    const maxW = Math.max(0, w - padding * 2);
    const words = source.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || ctx.measureText(candidate).width <= maxW) {
        current = candidate;
        return;
      }
      lines.push(current);
      current = word;
    });
    if (current) lines.push(current);
    const totalH = lines.length * lineHeight;
    const startY = y + (h - totalH) / 2;
    ctx.fillStyle = "black";
    lines.forEach((line, i) => {
      const mw = ctx.measureText(line).width;
      const tx = x + Math.max(0, (w - mw) / 2);
      ctx.fillText(line, tx, startY + i * lineHeight);
    });
  };

  // ── QR 이미지 사전 로드 ────────────────────────────────────────
  const qrSize = Math.max(1, Math.round(128 * scale));

  const loadQr = async (url: string) => {
    const { default: QRCode } = await import("qrcode");
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "L",
      margin: 0,
      width: qrSize,
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("QR 이미지 로드 실패"));
      img.src = dataUrl;
    });
    return img;
  };

  const [qrManualImg, qrMfgImg, qrSellerImg] = await Promise.all([
    loadQr("https://abuts.fit/manual"),
    loadQr("https://acrodent.com"),
    loadQr("https://abuts.fit"),
  ]);

  // ── 레이아웃 상수 ──────────────────────────────────────────────
  // 600dpi 기준 1pt ≈ 8.33도트. 법규 최소 폰트:
  //   7pt → 58도트 이상 → 렌더러에서 font-size ≥ 16px (scale=1 기준)
  //   6pt → 50도트 이상 → font-size ≥ 14px
  // 가독성을 위해 약간 여유를 두고 설정.
  const FONT_7PT = "bold 20px Arial"; // 법규 7pt 이상 필수 항목
  const FONT_6PT = "18px Arial"; // 법규 6.5pt 이상 기타 항목
  const FONT_6PT_BOLD = "bold 18px Arial";
  const FONT_HEADER = "bold 50px Arial"; // 상단 헤더 (메일함·스크루·로트)
  const FONT_LAB = "bold 38px Arial"; // 치과기공소(랩)명
  const FONT_INFO = "bold 22px Arial"; // 환자/치과/임플란트 정보 행
  const FONT_LEGAL_TITLE = "bold 22px Arial"; // 법규 7pt 이상 필수 항목
  const FONT_LEGAL_BODY = "17px Arial";
  const FONT_LEGAL_NOTICE = "bold 19px Arial";

  const M = 16; // 전체 여백
  const W = baseWidth - M * 2;

  // 하단 박스 높이를 먼저 계산해서 baseHeight를 콘텐츠에 맞게 역산
  const botLineH = 18;
  const botPadTop = 7;
  const botPadBot = 7;
  const _mfgBoxH = botPadTop + 3 * botLineH + botPadBot;
  const _sellerBoxH = botPadTop + 3 * botLineH + botPadBot;
  const _bottomH = _mfgBoxH + _sellerBoxH;

  // 각 행 높이
  const row1H = 62;
  const row2H = 54;
  const row3H = 34;
  const row4H = 34;
  const lRow1H = 36;
  const lRow2H = 36;
  const lRow3H = 30;
  const lRow4H = 56; // 설명문 3줄 + 일회용비멸균 인라인
  const legalBodyH = lRow1H + lRow2H + lRow3H + lRow4H;
  const totalContentH =
    row1H + row2H + row3H + row4H + legalBodyH + 2 + _bottomH;
  const computedBaseHeight = M + totalContentH + M;

  // 캔버스를 콘텐츠 기반 높이로 재설정
  canvas.height = Math.round(computedBaseHeight * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, baseWidth, computedBaseHeight);
  ctx.fillStyle = "black";
  ctx.textBaseline = "top";

  let curY = M;

  // ── 1행: 메일함코드 | 스크루타입 | 로트번호(끝3자리) + 우상단 QR ──
  const qrTopSize = 70;
  const lotSuffix = (() => {
    const lot = String(opts.lotNumber || "-");
    return lot.length >= 3 ? lot.slice(-3) : lot;
  })();
  // QR은 row1과 row2에 걸쳐 우측에 배치 (이미지 참조)
  const qrTopX = M + W - qrTopSize;
  const contentW = W - qrTopSize - 8; // QR 제외 유효폭

  drawBox(M, curY, contentW, row1H);
  const col1W = Math.round(contentW * 0.36);
  const col2W = Math.round(contentW * 0.29);
  const col3W = contentW - col1W - col2W;
  drawVLine(M + col1W, curY, row1H);
  drawVLine(M + col1W + col2W, curY, row1H);
  ctx.font = FONT_HEADER;
  fillTextCenteredInBox(opts.mailboxCode || "-", M, curY, col1W, row1H, 8);
  fillTextCenteredInBox(
    opts.screwType || "-",
    M + col1W,
    curY,
    col2W,
    row1H,
    8,
  );
  fillTextCenteredInBox(lotSuffix, M + col1W + col2W, curY, col3W, row1H, 8);

  // QR: 사용자매뉴얼 (우상단)
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrManualImg, qrTopX, curY, qrTopSize, qrTopSize);
  ctx.imageSmoothingEnabled = true;
  ctx.font = "bold 10px Arial";
  fillTextCenteredInBox(
    MANUAL_QR_LABEL,
    qrTopX - 4,
    curY + qrTopSize,
    qrTopSize + 8,
    14,
    0,
  );

  curY += row1H;

  // ── 2행: 치과기공소(랩)명 ──────────────────────
  // QR 콜럼 전까지만 박스 표시
  drawBox(M, curY, contentW, row2H);
  ctx.font = FONT_LAB;
  fillTextCenteredInBox(opts.labName || "-", M, curY, contentW, row2H, 16);
  curY += row2H;

  // ── 3행: 환자 / 치과 / 치아번호 ────────────────
  drawBox(M, curY, W, row3H);
  ctx.font = FONT_INFO;
  fillTextCenteredInBox(
    `${opts.clinicName || "-"} / ${opts.patientName || "-"} / #${opts.toothNumber || "-"}`,
    M,
    curY,
    W,
    row3H,
    8,
  );
  curY += row3H;

  // ── 4행: 임플란트 제조사/브랜드/패밀리/타입 ──────────────
  drawBox(M, curY, W, row4H);
  ctx.font = FONT_INFO;
  fillTextCenteredInBox(
    `${opts.implantManufacturer || "-"} / ${opts.implantBrand || "-"} / ${opts.implantFamily || "-"} / ${opts.implantType || "-"}`,
    M,
    curY,
    W,
    row4H,
    8,
  );
  curY += row4H;

  // ── 5구역: 법정 기재사항 박스 ────────────────────────────────
  // 첨2 레이아웃:
  //   1행 좌/우 분할: 품목명 / 모델명
  //   2행 좌/우 분할: 제조번호 / 제조일자
  //   3행 전체폭: 품목인증번호+포장단위+보관방법
  //   4행 전체폭: 설명문 + 일회용비멸균 문구
  const legalTopY = curY;
  // 모델명/제조일자를 오른쪽으로 이동 (로트번호 제거로 모델명이 짧아진 만큼 분할 비율 증가)
  const splitColW = Math.round(W * 0.6);
  const rColX = M + splitColW;
  const rColW = W - splitColW;
  const rRowH = Math.floor((lRow1H + lRow2H) / 2);

  // 법정 박스 전체 + 내부 구분선
  drawBox(M, legalTopY, W, legalBodyH);
  drawHLine(M, legalTopY + lRow1H, W); // 1행/2행 경계
  drawHLine(M, legalTopY + lRow1H + lRow2H, W); // 2행/3행 경계
  drawHLine(M, legalTopY + lRow1H + lRow2H + lRow3H, W); // 3행/4행 경계

  // 좌 1행: 품목명 (7pt↑)
  ctx.font = FONT_LEGAL_TITLE;
  fillTextLeft(
    `품목명:${PRODUCT_NAME.replace(/['"]/g, "")}`,
    M + 6,
    legalTopY + (lRow1H - 20) / 2,
    splitColW - 10,
  );

  // 좌 2행: 제조번호 (7pt↑)
  ctx.font = FONT_LEGAL_TITLE;
  fillTextLeft(
    `제조번호:${String(opts.lotNumber || "-").replace(/['"]/g, "")}`,
    M + 6,
    legalTopY + lRow1H + (lRow2H - 20) / 2,
    splitColW - 10,
  );

  // 좌 3행: 품목인증번호·포장단위·보관방법 (6pt)
  ctx.font = FONT_LEGAL_BODY;
  fillTextLeft(
    CERT_INFO,
    M + 6,
    legalTopY + lRow1H + lRow2H + (lRow3H - 15) / 2,
    W - 12,
  );

  // 좌 4행: 설명문 + 일회용비멸균 인라인 (6pt + 7pt↑)
  const descY = legalTopY + lRow1H + lRow2H + lRow3H;
  const descText = HOMEPAGE_URL
    ? `자세한 설명은 인터넷 홈페이지(${HOMEPAGE_URL}) 또는 우측 상단 사용자 매뉴얼 바코드에 제공`
    : `자세한 설명은 인터넷 홈페이지 또는 우측 상단 사용자 매뉴얼 바코드에 제공`;
  // 설명문 영역: 전체폭의 65% / 일회용비멸균: 나머지 35%
  const descColW = Math.round(W * 0.65);
  const udiInlineX = M + descColW;
  const udiInlineW = W - descColW;
  ctx.font = FONT_LEGAL_BODY;
  fillWrappedTextLeft(descText, M + 6, descY + 5, descColW - 14, 16, 3);
  // 일회용비멸균 의료기기, 재사용 금지 — 우측 인라인 (7pt↑, 줄바꿈 허용)
  ctx.font = FONT_LEGAL_NOTICE;
  fillWrappedTextCenteredInBox(
    "일회용 비멸균 의료기기, 재사용 금지",
    udiInlineX,
    descY,
    udiInlineW,
    lRow4H,
    19,
    6,
  );

  // 우 1행: 모델명 (7pt↑)
  ctx.font = FONT_LEGAL_TITLE;
  fillTextLeft(
    `모델명:${MODEL_NAME.replace(/['"]/g, "")}`,
    rColX + 6,
    legalTopY + (lRow1H - 20) / 2,
    rColW - 10,
  );

  // 우 2행: 제조일자 (7pt↑)
  ctx.font = FONT_LEGAL_TITLE;
  fillTextLeft(
    `제조일자:${dateOnly(opts.manufacturingDate).replace(/['"]/g, "")}`,
    rColX + 6,
    legalTopY + lRow1H + (lRow2H - 20) / 2,
    rColW - 10,
  );

  curY = legalTopY + legalBodyH;

  // ── 6구역: 제조자/판매원 세로 적층(좌) + UDI+QR 통합박스(우) ──
  // 상단에서 미리 계산한 botLineH/botPadTop/botPadBot 사용
  const mfgLines = 1 + 1 + 1; // 제목 + 주소1줄 + 전화
  const selLines = 1 + 1 + 1; // 제목 + 주소1줄 + 허가/전화 (여백 없음)
  const mfgBoxH = botPadTop + mfgLines * botLineH + botPadBot;
  const sellerBoxH = botPadTop + selLines * botLineH + botPadBot;
  const bottomH = mfgBoxH + sellerBoxH;
  const bottomY = curY + 2;
  const leftColW = Math.round(W * 0.56);
  const udiColW = W - leftColW;
  const udiColX = M + leftColW;

  // 제조자 소박스 (좌 상단)
  drawBox(M, bottomY, leftColW, mfgBoxH);
  ctx.font = FONT_6PT_BOLD;
  fillTextLeft(
    "제조자: " + COMPANY_NAME,
    M + 6,
    bottomY + botPadTop,
    leftColW - 12,
  );
  ctx.font = FONT_6PT;
  fillTextLeft(
    COMPANY_ADDR,
    M + 6,
    bottomY + botPadTop + botLineH,
    leftColW - 12,
  );
  fillTextLeft(
    COMPANY_TEL_FAX,
    M + 6,
    bottomY + botPadTop + botLineH * 2,
    leftColW - 12,
  );

  // 판매원 소박스 (좌 하단)
  const sellerBoxY = bottomY + mfgBoxH;
  drawBox(M, sellerBoxY, leftColW, sellerBoxH);
  ctx.font = FONT_6PT_BOLD;
  fillTextLeft(
    "판매원: " + SELLER_NAME,
    M + 6,
    sellerBoxY + botPadTop,
    leftColW - 12,
  );
  ctx.font = FONT_6PT;
  fillTextLeft(
    SELLER_ADDR,
    M + 6,
    sellerBoxY + botPadTop + botLineH,
    leftColW - 12,
  );
  fillTextLeft(
    SELLER_TEL,
    M + 6,
    sellerBoxY + botPadTop + botLineH * 2,
    leftColW - 12,
  );

  // UDI + QR 통합박스 (우측 전체 높이)
  // (01) GTIN  (10) 로트번호  (11) 제조일자(YYMMDD)
  drawBox(udiColX, bottomY, udiColW, bottomH);
  const mfgDateYmd = dateOnly(opts.manufacturingDate); // YYYY-MM-DD
  const udiMfgDate = mfgDateYmd.replace(/-/g, "").slice(2); // YYMMDD
  const udiLines = [
    `(01)${UDI_GTIN}`,
    `(10)${opts.lotNumber || "-"}`,
    `(11)${udiMfgDate}`,
  ];
  const udiLineH = botLineH;
  const qrBotSize = Math.min(bottomH - 12, 72);
  // 실제 텍스트 너비로 QR을 바로 옆에 붙임 (텍스트+QR 그룹 중앙 정렬)
  ctx.font = FONT_6PT;
  const maxUdiLineW = Math.max(
    ...udiLines.map((l) => ctx.measureText(l).width),
  );
  const udiQrGap = 8;
  const groupW = maxUdiLineW + udiQrGap + qrBotSize;
  const groupX = udiColX + Math.max(4, (udiColW - groupW) / 2);
  const udiTextX = groupX;
  const qrUdiX = groupX + maxUdiLineW + udiQrGap;
  const qrUdiY = bottomY + (bottomH - qrBotSize) / 2;
  // UDI 텍스트 수직 중앙 정렬 (3줄만, 제조업허가는 별도 하단 중앙)
  const udiTotalTextH = udiLines.length * udiLineH;
  const udiTextStartY = bottomY + Math.round((bottomH - udiTotalTextH) / 2);
  udiLines.forEach((line, i) => {
    fillTextLeft(line, udiTextX, udiTextStartY + i * udiLineH, maxUdiLineW);
  });
  // 제조업허가번호: 박스 하단 중앙 정렬
  const permitText = `제조업허가 ${MANUFACTURER_PERMIT_NO}`;
  const permitMetrics = ctx.measureText(permitText);
  const permitX = udiColX + Math.max(0, (udiColW - permitMetrics.width) / 2);
  const permitY = bottomY + bottomH - udiLineH - 2;
  ctx.fillStyle = "black";
  ctx.fillText(permitText, permitX, permitY);
  // UDI QR 코드 (텍스트 바로 우측)
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrSellerImg, qrUdiX, qrUdiY, qrBotSize, qrBotSize);
  ctx.imageSmoothingEnabled = true;

  return canvas;
};
