// related files:
// - web/frontend/.../packing/utils/packLabelRenderer.ts
// - web/backend/utils/packLabelRenderer.js
// - bg/pc2/lot-server/public/station.js
// change-log:
// - 2026-11-26: 패킹 라벨(80×65) 브라우저 렌더 — FE/BE packLabelRenderer 이식.
(function (global) {
  const DESIGN_DOTS = { pw: 640, ll: 520, dpi: 203 };
  const PRINT_DOTS = { pw: 1890, ll: 1535 };
  const PRINT_DPI = 600;
  const PREVIEW_DPI = 203;
  const PREVIEW_DOTS = { pw: 640, ll: 520 };
  const DEFAULT_BRANDING = {
  "productName": "치과용임플란트 상부구조물",
  "licenseNo": "제3583호",
  "manufacturerName": "(주)애크로덴트",
  "manufacturerAddr": "경남 김해시 전하로85번길 5, 나동(흥동)",
  "manufacturerTelFax": "T 055-314-4607  F 055-901-0241",
  "manufacturerPermitNo": "제3583호",
  "sellerName": "어벗츠 주식회사",
  "sellerPermit": "제 2026-5370025-00020 호",
  "sellerAddr": "경남 거제시 거제중앙로29길 6, 3층",
  "sellerTel": "1588-3948",
  "udiGtin": "08800123600154",
  "certInfo": "품목인증번호: 제인 26-0000호, 포장단위:1set, 보관방법: 실온보관",
  "homepageUrl": "www.acrodent.com",
  "manualQrLabel": "사용자매뉴얼"
};

  function mergeBranding(branding) {
    const next = { ...DEFAULT_BRANDING };
    Object.entries(branding || {}).forEach(([key, value]) => {
      const text = String(value ?? "").trim();
      if (text) next[key] = text;
    });
    return next;
  }

  function generateModelName(item) {
    const formatPart = (val) => {
      const n = Number(val);
      if (!Number.isFinite(n) || Number.isNaN(n)) return "000";
      return Math.round(n * 10).toString().padStart(3, "0");
    };
    const aaa = formatPart(item?.taperAngle);
    const ddd = formatPart(item?.maxDiameter);
    const lll = formatPart(item?.totalLength);
    if (aaa === "000" && ddd === "000" && lll === "000") return "";
    return `CA${aaa}${ddd}${lll}`;
  }

  function toKstYmd(input) {
    if (input == null || input === "") return "";
    if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
      return input.trim();
    }
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function buildOptsFromItem(item, branding, geometry) {
    const b = mergeBranding(branding);
    const modelName = String(item?.modelName || "").trim() || generateModelName(item);
    const manufacturingDate =
      toKstYmd(item?.manufacturingDate) ||
      toKstYmd(new Date());
    return {
      mailboxCode: String(item?.mailboxCode || "-").trim() || "-",
      labName: String(item?.labName || item?.clinicName || "-").trim() || "-",
      screwType: String(item?.screwType || "-").trim() || "-",
      lotNumber: String(item?.lotNumber || item?.lotSuffix || "-").trim() || "-",
      requestId: String(item?.requestId || "").trim(),
      clinicName: String(item?.clinicName || "").trim(),
      requestDate: String(item?.createdAt || item?.requestDate || "").trim(),
      patientName: String(item?.patientName || "").trim(),
      toothNumber: String(item?.tooth || item?.toothNumber || "").trim(),
      material: String(item?.material || "").trim(),
      implantManufacturer: String(item?.implantManufacturer || "").trim() || "-",
      implantBrand: String(item?.implantBrand || "").trim() || "-",
      implantFamily: String(item?.implantFamily || "").trim() || "-",
      implantType: String(item?.implantType || "").trim() || "-",
      connectionDiameter: item?.connectionDiameter ?? null,
      manufacturingDate,
      caseType: "Custom Abutment",
      printedAt: new Date().toISOString(),
      modelName,
      topBannerText: item?.topBannerText || (item?.hexVerificationSample ? "헥스 확인용 무료 샘플" : null),
      dpi: geometry.dpi,
      designDots: DESIGN_DOTS,
      targetDots: geometry.dots,
      ...b,
      ...(modelName ? { modelName } : {}),
    };
  }

const dateOnly = (value) => {
  const s = String(value || "").trim();
  if (!s) return "-";
  return s.includes("T") ? s.split("T")[0] : s;
};

const formatConnectionDiameterText = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `Ø${n.toFixed(2)}`;
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
  // opts.modelName은 packPrint.utils.js에서 CA + 각도 + 최대직경 + 최대높이로 생성됨
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
  const mfgLines = 3;
  // 판매업신고가 있으면 주소 다음 줄. 80×65mm(디자인 520dot)에 맞추려 패딩을 줄인다.
  const sellerLines = SELLER_PERMIT ? 4 : 3;
  const botPadTop = sellerLines === 4 ? 4 : 7;
  const botPadBot = sellerLines === 4 ? 4 : 7;
  const _mfgBoxH = botPadTop + mfgLines * botLineH + botPadBot;
  const _sellerBoxH = botPadTop + sellerLines * botLineH + botPadBot;
  const _bottomH = _mfgBoxH + _sellerBoxH;

  const row1H = 62;
  const row2H = 54;
  const row3H = 34;
  const row4H = 34;
  const bannerText = String(opts.topBannerText || "").trim();
  const bannerH = bannerText ? 36 : 0;
  const lRow1H = 36;
  const lRow2H = 36;
  const lRow3H = 30;
  const lRow4H = 56;
  const legalBodyH = lRow1H + lRow2H + lRow3H + lRow4H;
  const totalContentH =
    bannerH + row1H + row2H + row3H + row4H + legalBodyH + 2 + _bottomH;
  const computedBaseHeight = M + totalContentH + M;

  // ── 캔버스 생성 (최종 높이로 한 번만) ────────────────────────
  const finalHeight = Math.round(computedBaseHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = finalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context를 생성할 수 없습니다.");
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
    const QR = globalThis.QRCode;
    if (!QR || typeof QR.toDataURL !== "function") {
      throw new Error("QRCode 모듈을 불러오지 못했습니다.");
    }
    const dataUrl = await QR.toDataURL(url, {
      errorCorrectionLevel: "L",
      margin: 0,
      width: qrSize,
    });
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("QR 이미지 로드 실패"));
      img.src = dataUrl;
    });
    return img;
  };

  const [qrManualImg, , qrSellerImg] = await Promise.all([
    loadQr("https://abuts.fit/manual"),
    loadQr("https://acrodent.com"),
    loadQr("https://abuts.fit"),
  ]);

  // ── 폰트 상수 ──────────────────────────────────────────────────
  const FONT_6PT = "18px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";
  const FONT_6PT_BOLD = "bold 18px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";
  const FONT_LAB = "bold 38px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";
  const FONT_INFO = "bold 22px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";
  const FONT_LEGAL_TITLE = "bold 22px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";
  const FONT_LEGAL_BODY = "17px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";
  const FONT_LEGAL_NOTICE = "bold 19px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";

  let curY = M;

  // ── 0행(옵션): 첫의뢰 헥스 확인용 등 안내 배너 ──────────────
  if (bannerText) {
    ctx.font = "bold 28px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";
    fillTextLeft(bannerText, M, curY + 4, W);
    curY += bannerH;
  }

  // ── 1행: 메일함코드 | 스크루타입 | 로트번호(끝3자리) + 우상단 QR ──
  const qrTopSize = 70;
  const lotSuffix = (() => {
    const lot = String(opts.lotNumber || "-");
    return lot.length >= 3 ? lot.slice(-3) : lot;
  })();
  const qrTopX = M + W - qrTopSize;
  const contentW = W - qrTopSize - 8;

  drawBox(M, curY, contentW, row1H);
  const screwLabel = String(opts.screwType || "-");
  const longScrew = screwLabel.length > 2;
  const col1W = Math.round(contentW * (longScrew ? 0.28 : 0.36));
  const col2W = Math.round(contentW * (longScrew ? 0.46 : 0.29));
  const col3W = contentW - col1W - col2W;
  drawVLine(M + col1W, curY, row1H);
  drawVLine(M + col1W + col2W, curY, row1H);
  const fitHeader = (label, boxW) => {
    const maxW = Math.max(0, boxW - 16);
    let size = 50;
    while (size > 16) {
      ctx.font = `bold ${size}px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif`;
      if (ctx.measureText(label).width <= maxW) break;
      size -= 2;
    }
  };
  fitHeader(String(opts.mailboxCode || "-"), col1W);
  fillTextCenteredInBox(opts.mailboxCode || "-", M, curY, col1W, row1H, 8);
  fitHeader(screwLabel, col2W);
  fillTextCenteredInBox(screwLabel, M + col1W, curY, col2W, row1H, 8);
  fitHeader(lotSuffix, col3W);
  fillTextCenteredInBox(lotSuffix, M + col1W + col2W, curY, col3W, row1H, 8);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrManualImg, qrTopX, curY, qrTopSize, qrTopSize);
  ctx.imageSmoothingEnabled = true;
  ctx.font = "bold 10px \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", Arial, sans-serif";
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
  const connectionDiameterLabel = formatConnectionDiameterText(
    opts.connectionDiameter,
  );
  fillTextCenteredInBox(
    `${opts.implantManufacturer || "-"} / ${opts.implantBrand || "-"} / ${opts.implantFamily || "-"} / ${opts.implantType || "-"} / ${connectionDiameterLabel}`,
    M,
    curY,
    W,
    row4H,
    8,
  );
  curY += row4H;

  // ── 5구역: 법정 기재사항 박스 ────────────────────────────────
  const legalTopY = curY;
  // 모델명/제조일자를 오른쪽으로 이동 (로트번호 제거로 모델명이 짧아진 만큼 분할 비율 증가)
  const splitColW = Math.round(W * 0.6);
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
    `제조번호:${String(opts.lotNumber || "-").replace(/['"]/g, "")}`,
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
    `모델명:${MODEL_NAME.replace(/['"]/g, "")}`,
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
  const mfgBoxH = _mfgBoxH;
  const sellerBoxH = _sellerBoxH;
  const bottomH = mfgBoxH + sellerBoxH;
  const bottomY = curY + 2;
  const leftColW = Math.round(W * 0.56);
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
  const sellerTextMaxW = leftColW - 12;
  fillTextLeft(
    "판매원: " + SELLER_NAME,
    M + 6,
    sellerBoxY + botPadTop,
    sellerTextMaxW,
  );
  ctx.font = FONT_6PT;
  fillTextLeft(
    SELLER_ADDR,
    M + 6,
    sellerBoxY + botPadTop + botLineH,
    sellerTextMaxW,
  );
  let sellerNextLine = 2;
  if (SELLER_PERMIT) {
    fillTextLeft(
      "판매업신고 " + SELLER_PERMIT,
      M + 6,
      sellerBoxY + botPadTop + botLineH * sellerNextLine,
      sellerTextMaxW,
    );
    sellerNextLine += 1;
  }
  fillTextLeft(
    SELLER_TEL,
    M + 6,
    sellerBoxY + botPadTop + botLineH * sellerNextLine,
    sellerTextMaxW,
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



  async function renderPreview(item, branding) {
    return renderPackLabelToCanvas(
      buildOptsFromItem(item, branding, { dpi: PREVIEW_DPI, dots: PREVIEW_DOTS }),
    );
  }

  async function renderPrint(item, branding) {
    return renderPackLabelToCanvas(
      buildOptsFromItem(item, branding, { dpi: PRINT_DPI, dots: PRINT_DOTS }),
    );
  }

  async function buildZpl(item, branding) {
    const canvas = await renderPrint(item, branding);
    return buildPackLabelBitmapZpl({
      canvas,
      labelWidth: PRINT_DOTS.pw,
      labelHeight: PRINT_DOTS.ll,
    });
  }

  global.AbutsPackLabel = {
    DESIGN_DOTS,
    PRINT_DOTS,
    PRINT_DPI,
    PREVIEW_DPI,
    PREVIEW_DOTS,
    DEFAULT_BRANDING,
    mergeBranding,
    generateModelName,
    toKstYmd,
    buildOptsFromItem,
    renderPackLabelToCanvas,
    buildPackLabelBitmapZpl,
    canvasToZplGraphic,
    renderPreview,
    renderPrint,
    buildZpl,
  };
})(typeof window !== "undefined" ? window : globalThis);
