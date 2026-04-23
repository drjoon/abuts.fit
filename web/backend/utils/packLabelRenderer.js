/**
 * 프론트엔드 packLabelRenderer.ts와 동일한 로직으로 Canvas 기반 라벨 생성
 * 600 DPI 기준으로 80x65mm = 1890x1535 dots
 *
 * @napi-rs/canvas 사용 (사전 빌드된 바이너리로 빠른 설치)
 */

let canvasModuleCache = null;

// 서버 시작 시 폰트 미리 로드 (테스트용)
(async () => {
  try {
    await loadCanvasModule();
    console.log("[packLabelRenderer] Canvas module preloaded");
  } catch (err) {
    console.warn(
      "[packLabelRenderer] Canvas module preload failed:",
      err.message,
    );
  }
})();

async function loadCanvasModule() {
  if (canvasModuleCache) return canvasModuleCache;

  try {
    const canvasModule = await import("@napi-rs/canvas");
    const qrcodeModule = await import("qrcode");

    // 한글 폰트 등록 (Linux 시스템 폰트 경로)
    try {
      const { GlobalFonts } = canvasModule;
      const { existsSync } = await import("fs");

      // 시스템별 Noto Sans CJK 폰트 경로
      const fontPaths = [
        "/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc", // Amazon Linux
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", // Ubuntu/Debian
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansKR-Regular.otf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc", // macOS
      ];

      let fontRegistered = false;
      for (const fontPath of fontPaths) {
        try {
          if (existsSync(fontPath)) {
            GlobalFonts.registerFromPath(fontPath, "NotoSans");
            console.log(`[packLabelRenderer] 한글 폰트 등록 성공: ${fontPath}`);
            fontRegistered = true;
            break;
          }
        } catch (err) {
          // 다음 경로 시도
        }
      }

      if (!fontRegistered) {
        console.warn(
          "[packLabelRenderer] 한글 폰트를 찾을 수 없습니다. 한글이 깨질 수 있습니다.",
        );
      }
    } catch (fontError) {
      console.warn("[packLabelRenderer] 폰트 등록 실패:", fontError.message);
    }

    canvasModuleCache = {
      createCanvas: canvasModule.createCanvas,
      loadImage: canvasModule.loadImage,
      QRCode: qrcodeModule.default,
    };
    return canvasModuleCache;
  } catch (error) {
    console.error(
      "[packLabelRenderer] @napi-rs/canvas 패키지를 로드할 수 없습니다:",
      error.message,
    );
    throw new Error("@napi-rs/canvas 패키지가 설치되지 않았습니다.");
  }
}

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

// ⚠️ 이 렌더러와 동일한 로직이 프론트엔드에도 존재합니다.
// 디자인(레이아웃·폰트·텍스트) 수정 시 반드시 아래 파일도 함께 수정하세요:
//   web/frontend/.../packing/utils/packLabelRenderer.ts  (수동 출력 경로)
const renderPackLabelToCanvas = async (opts) => {
  const { createCanvas, loadImage, QRCode } = await loadCanvasModule();

  const dpi = Number(opts.dpi) || 600;
  const baseDpi = Number(opts.designDots?.dpi) || 600;
  const baseWidth = Number(opts.designDots?.pw) || 1890;
  const targetWidth =
    Number(opts.targetDots?.pw) || Math.round((baseWidth * dpi) / baseDpi);
  const scale = targetWidth / baseWidth;
  const width = Math.round(targetWidth);

  // 라벨 브랜딩 정보 (opts로 전달받음)
  const PRODUCT_NAME = (opts.productName || "임플란트 상부구조물").replace(
    /['"]/g,
    "",
  );
  const MODEL_NAME = (opts.modelName || "").replace(/['"]/g, "");
  const LICENSE_NO = opts.licenseNo || "";
  const COMPANY_NAME = (opts.manufacturerName || "").replace(/['"]/g, "");
  const COMPANY_ADDR = (opts.manufacturerAddr || "").replace(/['"]/g, "");
  const COMPANY_TEL_FAX = (
    opts.manufacturerTelFax ||
    opts.manufacturerTel ||
    ""
  ).replace(/['"]/g, "");
  const SELLER_NAME = (opts.sellerName || "").replace(/['"]/g, "");
  const SELLER_PERMIT = (opts.sellerPermit || "").replace(/['"]/g, "");
  const SELLER_ADDR = (opts.sellerAddr || "").replace(/['"]/g, "");
  const SELLER_TEL = (opts.sellerTel || "").replace(/['"]/g, "");
  const MANUAL_QR_LABEL = opts.manualQrLabel || "사용자매뉴얼";
  const UDI_GTIN = opts.udiGtin || "";
  const MANUFACTURER_PERMIT_NO = opts.manufacturerPermitNo || LICENSE_NO;
  const CERT_INFO = (opts.certInfo || "").replace(/['"]/g, "");
  const HOMEPAGE_URL = (opts.homepageUrl || "").replace(/['"]/g, "");

  // ── 레이아웃 상수 (캔버스 생성 전에 먼저 계산) ─────────────────
  const M = 16;
  const W = baseWidth - M * 2;

  const botLineH = 18;
  const botPadTop = 7;
  const botPadBot = 7;
  const _mfgBoxH = botPadTop + 3 * botLineH + botPadBot;
  const _sellerBoxH = botPadTop + 3 * botLineH + botPadBot;
  const _bottomH = _mfgBoxH + _sellerBoxH;

  const row1H = 62;
  const row2H = 54;
  const row3H = 34;
  const row4H = 34;
  const lRow1H = 36;
  const lRow2H = 36;
  const lRow3H = 30;
  const lRow4H = 56;
  const legalBodyH = lRow1H + lRow2H + lRow3H + lRow4H;
  const totalContentH =
    row1H + row2H + row3H + row4H + legalBodyH + 2 + _bottomH;
  const computedBaseHeight = M + totalContentH + M;

  // ── 캔버스 생성 (최종 높이로 한 번만) ────────────────────────
  const finalHeight = Math.round(computedBaseHeight * scale);
  const canvas = createCanvas(width, finalHeight);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, baseWidth, computedBaseHeight);
  ctx.fillStyle = "black";
  ctx.textBaseline = "top";

  // ── 유틸리티 함수 ─────────────────────────────────────────────

  const drawBox = (x, y, w, h) => {
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  };

  const drawHLine = (x, y, w, thickness = 2) => {
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, w, thickness);
  };

  const drawVLine = (x, y, h, thickness = 2) => {
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, thickness, h);
  };

  const fillTextCenteredInBox = (text, x, y, w, h, padding = 4) => {
    const raw = String(text || "-");
    const maxW = Math.max(0, w - padding * 2);
    let t = raw;
    if (ctx.measureText(raw).width > maxW) {
      const ellipsis = "...";
      let lo = 0,
        hi = raw.length,
        best = ellipsis;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const c = `${raw.slice(0, mid).trimEnd()}${ellipsis}`;
        if (ctx.measureText(c).width <= maxW) {
          best = c;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      t = best;
    }
    const metrics = ctx.measureText(t);
    const tx = x + Math.max(0, (w - metrics.width) / 2);
    const ascent = metrics.actualBoundingBoxAscent || 0;
    const descent = metrics.actualBoundingBoxDescent || 0;
    const ty = y + (h + ascent - descent) / 2;
    ctx.fillStyle = "black";
    ctx.fillText(t, tx, ty);
  };

  const fillTextLeft = (text, x, y, maxWidth) => {
    const t = truncateToFit(ctx, String(text || ""), maxWidth);
    ctx.fillStyle = "black";
    ctx.fillText(t, x, y);
  };

  const fillWrappedTextLeft = (text, x, y, maxWidth, lineHeight, maxLines) => {
    const source = String(text || "").trim();
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
    text,
    x,
    y,
    w,
    h,
    lineHeight,
    padding = 4,
  ) => {
    const source = String(text || "").trim();
    if (!source) return;
    const maxW = Math.max(0, w - padding * 2);
    const words = source.split(/\s+/);
    const lines = [];
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

  const loadQr = async (url) => {
    const buffer = await QRCode.toBuffer(url, {
      errorCorrectionLevel: "L",
      margin: 0,
      width: qrSize,
    });
    return loadImage(buffer);
  };

  const [qrManualImg, , qrSellerImg] = await Promise.all([
    loadQr("https://abuts.fit/manual"),
    loadQr("https://acrodent.com"),
    loadQr("https://abuts.fit"),
  ]);

  // ── 폰트 상수 ──────────────────────────────────────────────────
  const FONT_6PT = "18px NotoSans, Arial";
  const FONT_6PT_BOLD = "bold 18px NotoSans, Arial";
  const FONT_HEADER = "bold 50px NotoSans, Arial";
  const FONT_LAB = "bold 38px NotoSans, Arial";
  const FONT_INFO = "bold 22px NotoSans, Arial";
  const FONT_LEGAL_TITLE = "bold 22px NotoSans, Arial";
  const FONT_LEGAL_BODY = "17px NotoSans, Arial";
  const FONT_LEGAL_NOTICE = "bold 19px NotoSans, Arial";

  let curY = M;

  // ── 1행: 메일함코드 | 스크루타입 | 로트번호(끝3자리) + 우상단 QR ──
  const qrTopSize = 70;
  const lotSuffix = (() => {
    const lot = String(opts.lotNumber || "-");
    return lot.length >= 3 ? lot.slice(-3) : lot;
  })();
  const qrTopX = M + W - qrTopSize;
  const contentW = W - qrTopSize - 8;

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

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrManualImg, qrTopX, curY, qrTopSize, qrTopSize);
  ctx.imageSmoothingEnabled = true;
  ctx.font = "bold 10px NotoSans, Arial";
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
  const legalTopY = curY;
  const splitColW = Math.round(W * 0.58);
  const rColX = M + splitColW;
  const rColW = W - splitColW;

  drawBox(M, legalTopY, W, legalBodyH);
  // 5구역 내부 구분선
  drawHLine(M, legalTopY + lRow1H, W); // 1행/2행 경계
  drawHLine(M, legalTopY + lRow1H + lRow2H, W); // 2행/3행 경계
  drawHLine(M, legalTopY + lRow1H + lRow2H + lRow3H, W); // 3행/4행 경계

  ctx.font = FONT_LEGAL_TITLE;
  ctx.fillStyle = "black";
  ctx.fillText(
    `품목명:${PRODUCT_NAME.replace(/['"]/g, "")}`,
    M + 6,
    legalTopY + (lRow1H - 20) / 2,
  );
  ctx.fillText(
    `모델명:${MODEL_NAME.replace(/['"]/g, "")}`,
    M + 6,
    legalTopY + lRow1H + (lRow2H - 20) / 2,
  );

  ctx.font = FONT_LEGAL_BODY;
  ctx.fillText(
    CERT_INFO,
    M + 6,
    legalTopY + lRow1H + lRow2H + (lRow3H - 15) / 2,
  );

  const descY = legalTopY + lRow1H + lRow2H + lRow3H;
  const descText = HOMEPAGE_URL
    ? `자세한 설명은 인터넷 홈페이지(${HOMEPAGE_URL}) 또는 우측 상단 사용자 매뉴얼 바코드에 제공`
    : `자세한 설명은 인터넷 홈페이지 또는 우측 상단 사용자 매뉴얼 바코드에 제공`;
  const descColW = Math.round(W * 0.65);
  const udiInlineX = M + descColW;
  const udiInlineW = W - descColW;
  ctx.font = FONT_LEGAL_BODY;
  fillWrappedTextLeft(descText, M + 6, descY + 5, descColW - 14, 16, 3);
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

  ctx.font = FONT_LEGAL_TITLE;
  ctx.fillStyle = "black";
  ctx.fillText(
    `제조번호:${String(opts.lotNumber || "-").replace(/['"]/g, "")}`,
    rColX + 6,
    legalTopY + (lRow1H - 20) / 2,
  );
  ctx.fillText(
    `제조일자:${dateOnly(opts.manufacturingDate).replace(/['"]/g, "")}`,
    rColX + 6,
    legalTopY + lRow1H + (lRow2H - 20) / 2,
  );

  curY = legalTopY + legalBodyH;

  // ── 6구역: 제조자/판매원 세로 적층(좌) + UDI+QR 통합박스(우) ──
  const mfgBoxH = botPadTop + 3 * botLineH + botPadBot;
  const sellerBoxH = botPadTop + 3 * botLineH + botPadBot;
  const bottomH = mfgBoxH + sellerBoxH;
  const bottomY = curY + 2;
  const leftColW = Math.round(W * 0.52);
  const udiColW = W - leftColW;
  const udiColX = M + leftColW;

  // 제조자 소박스 (좌 상단)
  drawBox(M, bottomY, leftColW, mfgBoxH);
  ctx.font = FONT_6PT_BOLD;
  ctx.fillStyle = "black";
  ctx.fillText("제조자: " + COMPANY_NAME, M + 6, bottomY + botPadTop);
  ctx.font = FONT_6PT;
  ctx.fillText(COMPANY_ADDR, M + 6, bottomY + botPadTop + botLineH);
  ctx.fillText(COMPANY_TEL_FAX, M + 6, bottomY + botPadTop + botLineH * 2);

  // 판매원 소박스 (좌 하단)
  const sellerBoxY = bottomY + mfgBoxH;
  drawBox(M, sellerBoxY, leftColW, sellerBoxH);
  ctx.font = FONT_6PT_BOLD;
  ctx.fillText("판매원: " + SELLER_NAME, M + 6, sellerBoxY + botPadTop);
  ctx.font = FONT_6PT;
  ctx.fillText(SELLER_ADDR, M + 6, sellerBoxY + botPadTop + botLineH);
  ctx.fillText(
    `${SELLER_PERMIT} / ${SELLER_TEL}`,
    M + 6,
    sellerBoxY + botPadTop + botLineH * 2,
  );

  // UDI + QR 통합박스 (우측 전체 높이)
  drawBox(udiColX, bottomY, udiColW, bottomH);
  const mfgDateYmd = dateOnly(opts.manufacturingDate);
  const udiMfgDate = mfgDateYmd.replace(/-/g, "").slice(2);
  const udiLines = [
    `(01)${UDI_GTIN}`,
    `(10)${opts.lotNumber || "-"}`,
    `(11)${udiMfgDate}`,
  ];
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
  const udiTotalTextH = udiLines.length * botLineH;
  const udiTextStartY = bottomY + Math.round((bottomH - udiTotalTextH) / 2);
  ctx.fillStyle = "black";
  udiLines.forEach((line, i) => {
    fillTextLeft(line, udiTextX, udiTextStartY + i * botLineH, maxUdiLineW);
  });
  // 제조업허가번호: 박스 하단 중앙 정렬
  const permitText = `제조업허가 ${MANUFACTURER_PERMIT_NO}`;
  const permitMetrics = ctx.measureText(permitText);
  const permitX = udiColX + Math.max(0, (udiColW - permitMetrics.width) / 2);
  const permitY = bottomY + bottomH - botLineH - 2;
  ctx.fillText(permitText, permitX, permitY);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrSellerImg, qrUdiX, qrUdiY, qrBotSize, qrBotSize);
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
