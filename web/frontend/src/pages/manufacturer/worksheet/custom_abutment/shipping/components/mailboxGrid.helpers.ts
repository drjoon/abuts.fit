import { request } from "@/shared/api/apiClient";

export const HANJIN_DEV_TEST_PAYLOAD = {
  mailboxes: ["DEVTESTA1"],
  shipments: [
    {
      requestId: "DEV-REQ-0001",
      mongoId: "000000000000000000000001",
      mailboxAddress: "DEVTESTA1",
      clinicName: "테스트치과",
      patientName: "홍길동",
      tooth: "#11",
      receiverName: "테스트 담당자",
      receiverPhone: "02-0000-0000",
      receiverAddress: "서울특별시 강남구 테스트로 123",
      receiverZipCode: "06236",
      shippingMode: "normal",
    },
  ],
};

export const HANJIN_DEV_TEST_WEBHOOK = {
  mock: true,
  trackingNumber: "DEVTEST123456",
  carrier: "hanjin",
  shippedAt: new Date().toISOString(),
  events: [
    {
      statusCode: "DLV",
      statusText: "배송완료",
      occurredAt: new Date().toISOString(),
      location: "서울강남",
      description: "테스트 배송 완료",
    },
  ],
};

export const callHanjinApi = async ({
  path,
  mailboxAddresses,
  payload,
}: {
  path: string;
  mailboxAddresses?: string[];
  payload?: Record<string, any>;
}) => {
  const body: Record<string, unknown> = {};
  if (Array.isArray(mailboxAddresses)) {
    body.mailboxAddresses = mailboxAddresses;
  }
  if (payload) {
    body.payload = payload;
  }
  const response = await request<any>({
    path,
    method: "POST",
    jsonBody: body,
  });
  const responseBody = response.data as any;
  const isPartialSuccess = response.status === 207 && response.ok;
  if ((!response.ok || !responseBody?.success) && !isPartialSuccess) {
    const message =
      responseBody?.error ||
      responseBody?.message ||
      `한진 API 호출 실패 (status=${response.status})`;
    const err: any = new Error(message);
    err.status = response.status;
    err.data = responseBody?.data || responseBody;
    throw err;
  }
  return {
    ...(responseBody?.data || {}),
    success: Boolean(responseBody?.success),
    partial: isPartialSuccess,
    message: responseBody?.message || null,
  };
};

export const callHanjinApiWithMeta = async ({
  path,
  mailboxAddresses,
  forceTodayMailboxAddresses,
  payload,
  wblPrintOptions,
}: {
  path: string;
  mailboxAddresses?: string[];
  forceTodayMailboxAddresses?: string[];
  payload?: Record<string, any>;
  wblPrintOptions?: {
    printer?: string;
    paperProfile?: string;
  };
}) => {
  const body: Record<string, unknown> = {};
  if (Array.isArray(mailboxAddresses)) {
    body.mailboxAddresses = mailboxAddresses;
  }
  if (Array.isArray(forceTodayMailboxAddresses)) {
    body.forceTodayMailboxAddresses = forceTodayMailboxAddresses;
  }
  if (payload) {
    body.payload = payload;
  }
  if (wblPrintOptions) {
    body.wblPrintOptions = wblPrintOptions;
  }
  const response = await request<any>({
    path,
    method: "POST",
    jsonBody: body,
  });
  const responseBody = response.data as any;
  if (!response.ok || !responseBody?.success) {
    const message =
      responseBody?.error ||
      responseBody?.message ||
      `한진 API 호출 실패 (status=${response.status})`;
    const err: any = new Error(message);
    err.status = response.status;
    err.data = responseBody?.data || responseBody;
    console.error("[HanjinApi] request failed", {
      path,
      status: response.status,
      body: err.data,
    });
    throw err;
  }
  return {
    data: responseBody?.data,
    wblPrint: responseBody?.wblPrint,
  };
};

export const resolvePrintPayload = (payload: any) => {
  if (!payload) return null;
  if (typeof payload === "string" && payload.startsWith("http")) {
    return { url: payload };
  }

  const candidate = [
    payload.url,
    payload.pdfUrl,
    payload.labelUrl,
    payload.printUrl,
    payload.downloadUrl,
    payload.fileUrl,
    payload?.data?.url,
    payload?.data?.pdfUrl,
    payload?.data?.labelUrl,
    payload?.data?.printUrl,
    payload?.data?.downloadUrl,
  ].find((value) => typeof value === "string" && value.startsWith("http"));

  if (candidate) return { url: candidate };

  const base64 =
    payload.pdfBase64 ||
    payload.labelBase64 ||
    payload?.data?.pdfBase64 ||
    payload?.data?.labelBase64;
  if (typeof base64 === "string" && base64.length > 0) {
    return { base64 };
  }

  return null;
};

export const downloadPdfFromBase64 = async (
  base64: string,
  fileName: string,
) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const downloadPdfFromUrl = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

export const handleDownloadWaybillPdf = async (payload: any) => {
  const printPayload = resolvePrintPayload(payload);
  if (!printPayload) {
    throw new Error("운송장 응답에서 PDF 데이터를 찾지 못했습니다.");
  }
  const fileName = `hanjin-waybill-${new Date().toISOString().slice(0, 10)}.pdf`;
  if (printPayload.url) {
    downloadPdfFromUrl(printPayload.url);
    return;
  }
  if (printPayload.base64) {
    await downloadPdfFromBase64(printPayload.base64, fileName);
    return;
  }
  throw new Error("운송장 PDF 출력 데이터가 없습니다.");
};

const parseZplField = (zpl: string, pattern: RegExp): string => {
  const match = String(zpl || "").match(pattern);
  return String(match?.[1] || "").trim();
};

const recoverRowFromZpl = (row: any, zpl: string): any => {
  if (!zpl) return row;

  const mainLabel = parseZplField(
    zpl,
    /\^FO24,78\^A0N,104,104\^FD([^\^]+)\^FS/,
  );
  const senderLabelRaw = parseZplField(
    zpl,
    /\^FO26,196\^A0N,24,24\^FD발지:([^\^]+)\^FS/,
  );
  const domMid = parseZplField(zpl, /\^FO428,74\^A0N,58,58\^FD([^\^]+)\^FS/);
  const grpRnk = parseZplField(zpl, /\^FO560,78\^A0N,28,28\^FD([^\^]+)\^FS/);
  const esNam = parseZplField(zpl, /\^FO428,126\^A0N,50,50\^FD([^\^]+)\^FS/);
  const esCod = parseZplField(zpl, /\^FO682,82\^A0N,64,64\^FD([^\^]+)\^FS/);
  const cenSummary = parseZplField(
    zpl,
    /\^FO638,142\^A0N,18,18\^FD([^\^]+)\^FS/,
  );
  const areaLabel = parseZplField(zpl, /\^FO860,92\^A0N,34,34\^FD([^\^]+)\^FS/);
  const receiverName = parseZplField(
    zpl,
    /\^FO74,226\^A0N,24,24\^FD([^\^]+)\^FS/,
  );
  const receiverPhone = parseZplField(
    zpl,
    /\^FO468,226\^A0N,20,20\^FD([^\^]+)\^FS/,
  );
  const receiverAddr = parseZplField(
    zpl,
    /\^FO74,258\^A0N,20,20\^FD([^\^]+)\^FS/,
  );
  const prtAdd = parseZplField(zpl, /\^FO74,306\^A0N,54,54\^FD([^\^]+)\^FS/);
  const senderSummary = parseZplField(
    zpl,
    /\^FO74,392\^A0N,18,18\^FD([^\^]+)\^FS/,
  );
  const senderAddr = parseZplField(
    zpl,
    /\^FO74,418\^A0N,16,16\^FD([^\^]+)\^FS/,
  );

  const [parsedHubCod = "", parsedTmlCod = ""] = mainLabel
    .split(/\s+/)
    .filter(Boolean);
  const senderParts = senderLabelRaw.split(/\s+/).filter(Boolean);
  const parsedSTmlCod = senderParts[0] || "";
  const parsedSTmlNam = senderParts.slice(1).join(" ");
  const cenParts = cenSummary.split(/\s+/).filter(Boolean);
  const parsedCenCod = cenParts[0] || "";
  const parsedCenNam = cenParts.slice(1).join(" ");
  const senderSummaryParts = senderSummary
    .split(/\s{2,}|\s\/\s|\//)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const parsedSenderName = senderSummaryParts[0] || "";
  const parsedSenderPhone = senderSummaryParts[1] || "";

  return {
    ...row,
    hub_cod: row?.hub_cod || parsedHubCod || undefined,
    tml_cod: row?.tml_cod || parsedTmlCod || undefined,
    dom_mid: row?.dom_mid || domMid || undefined,
    grp_rnk: row?.grp_rnk || grpRnk || undefined,
    es_nam: row?.es_nam || esNam || undefined,
    es_cod: row?.es_cod || esCod || undefined,
    cen_cod: row?.cen_cod || parsedCenCod || undefined,
    cen_nam: row?.cen_nam || parsedCenNam || undefined,
    s_tml_cod: row?.s_tml_cod || parsedSTmlCod || undefined,
    s_tml_nam: row?.s_tml_nam || parsedSTmlNam || undefined,
    dom_rgn:
      row?.dom_rgn ||
      (areaLabel === "수도권"
        ? "1"
        : areaLabel === "제주"
          ? "7"
          : areaLabel === "도서"
            ? "9"
            : areaLabel
              ? "2"
              : undefined),
    receiver_name:
      row?.receiver_name || row?.rcv_prn || receiverName || undefined,
    receiver_phone:
      row?.receiver_phone || row?.rcv_tel || receiverPhone || undefined,
    rcv_add: row?.rcv_add || row?.address || receiverAddr || undefined,
    address: row?.address || row?.rcv_add || receiverAddr || undefined,
    prt_add: row?.prt_add || prtAdd || undefined,
    snd_prn:
      row?.snd_prn ||
      row?.snd_nam ||
      parsedSenderName ||
      senderSummary ||
      undefined,
    snd_nam:
      row?.snd_nam ||
      row?.snd_prn ||
      parsedSenderName ||
      senderSummary ||
      undefined,
    snd_tel: row?.snd_tel || row?.snd_hphn || parsedSenderPhone || undefined,
    snd_hphn: row?.snd_hphn || row?.snd_tel || parsedSenderPhone || undefined,
    snd_add: row?.snd_add || row?.snd_addr || senderAddr || undefined,
    snd_addr: row?.snd_addr || row?.snd_add || senderAddr || undefined,
  };
};

const buildWaybillRows = (addressList: any[], zplLabels?: string[]): any[] => {
  const normalized = Array.isArray(addressList) ? addressList : [];
  return normalized
    .filter(
      (row) =>
        String(row?.result_code || row?.resultCode || "OK").trim() === "OK",
    )
    .map((row, index) =>
      recoverRowFromZpl(row, String(zplLabels?.[index] || "")),
    );
};

// ZPL PW984 × LL787 dots (203 dpi) 기준 × 4배 고해상도
const WAYBILL_S = 4;
const WAYBILL_CANVAS_W = 984 * WAYBILL_S;
const WAYBILL_CANVAS_H = 787 * WAYBILL_S;

const renderWaybillRowToPngBlob = async (row: any): Promise<Blob> => {
  const S = WAYBILL_S;
  const canvasW = WAYBILL_CANVAS_W;
  const canvasH = WAYBILL_CANVAS_H;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 렌더링에 실패했습니다.");

  const KR =
    '"Nanum Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const formatWaybillDisplay = (value: string) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 12) return String(value || "").trim();
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
  };
  const maskName = (value: string) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const chars = Array.from(text);
    if (chars.length === 1) return text;
    if (chars.length === 2) return `${chars[0]}*`;
    return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
  };
  const maskPhone = (value: string) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";

    if (digits.startsWith("02")) {
      if (digits.length === 9)
        return `${digits.slice(0, 2)}-${"*".repeat(3)}-${digits.slice(5)}`;
      if (digits.length === 10)
        return `${digits.slice(0, 2)}-${"*".repeat(4)}-${digits.slice(6)}`;
    }

    if (digits.length === 10)
      return `${digits.slice(0, 3)}-${"*".repeat(3)}-${digits.slice(6)}`;
    if (digits.length === 11)
      return `${digits.slice(0, 3)}-${"*".repeat(4)}-${digits.slice(7)}`;
    if (digits.length === 12)
      return `${digits.slice(0, 4)}-${"*".repeat(4)}-${digits.slice(8)}`;

    const head = digits.slice(0, Math.max(0, digits.length - 8));
    const middle = digits.slice(
      Math.max(0, digits.length - 8),
      Math.max(0, digits.length - 4),
    );
    const tail = digits.slice(-4);
    if (!head || !middle || !tail) return String(value || "").trim();
    return `${head}-${"*".repeat(middle.length)}-${tail}`;
  };

  // ── 필드 (ZPL buildHanjinWblZplLabels 동일, 첨4 명세표 기준) ──────────
  const wblNum = String(row.wbl_num || "").trim();
  const hubCod = String(row.hub_cod || "").trim();
  const tmlCod = String(row.tml_cod || "").trim();
  const tmlNam = String(row.tml_nam || "").trim();
  const domMid = String(row.dom_mid || "").trim();
  const cenCod = String(row.cen_cod || "").trim();
  const cenNam = String(row.cen_nam || "").trim();
  const sTmlCod = String(row.s_tml_cod || "").trim();
  const sTmlNam = String(row.s_tml_nam || "").trim();
  const grpRnk = String(row.grp_rnk || "").trim();
  const esNam = String(row.es_nam || "").trim();
  const prtAdd = String(row.prt_add || "").trim();
  const domRgn = String(row.dom_rgn || "").trim();
  const esCod = String(row.es_cod || "").trim();
  const receiverName = String(
    row.receiver_name || row.rcv_prn || row.rcv_nam || "",
  ).trim();
  const receiverPhone = String(
    row.receiver_phone || row.rcv_tel || row.rcv_hphn || "",
  ).trim();
  const receiverAddr = String(row.rcv_add || row.address || "").trim();
  const senderName = String(row.snd_prn || row.snd_nam || "").trim();
  const senderPhone = String(row.snd_tel || row.snd_hphn || "").trim();
  const senderAddr = String(row.snd_add || row.snd_addr || "").trim();
  const mailboxCode = String(row.mailbox_code || "").trim();
  const orgName = String(row.organization_name || "").trim();
  const reqCount = Number(row.request_count || 0);
  const remark = String(
    row.remark ||
      [mailboxCode, orgName, reqCount > 0 ? `${reqCount}건` : ""]
        .filter(Boolean)
        .join(" / ") ||
      row.msg_key ||
      "",
  ).trim();
  const today = new Date().toISOString().slice(0, 10);

  const domRgnNum = parseInt(domRgn, 10);
  const areaLabel =
    domRgnNum === 1
      ? "수도권"
      : domRgnNum === 7
        ? "제주"
        : domRgnNum === 9
          ? "도서"
          : domRgn
            ? "지방"
            : "";
  const senderLabel = [sTmlCod, sTmlNam].filter(Boolean).join(" ");
  const mainLabel = [hubCod, tmlCod].filter(Boolean).join(" ") || tmlNam;
  const terminalBarcodeValue = tmlCod || cenCod || esCod || wblNum;
  const todayLabel = `${today.replace(/-/g, ".")}.`;
  const formattedWblNum = formatWaybillDisplay(wblNum);
  const receiverNameMasked = maskName(receiverName);
  const receiverPhoneMasked = maskPhone(receiverPhone);
  const senderNameMasked = maskName(senderName);
  const senderPhoneMasked = maskPhone(senderPhone);
  const senderSummary = [senderNameMasked, senderPhoneMasked]
    .filter(Boolean)
    .join(" / ");
  const cenSummary = [cenCod, cenNam].filter(Boolean).join(" ");

  // ── 유틸: ZPL ^FO x,y ^A0N,h → canvas baseline = (y+h)*S ──────────
  const zt = (
    text: string,
    fx: number,
    fy: number,
    fh: number,
    bold = false,
    color = "#000000",
  ) => {
    ctx.font = `${bold ? "700" : "400"} ${fh * S}px ${KR}`;
    ctx.fillStyle = color;
    ctx.fillText(text, fx * S, (fy + fh) * S);
  };
  const zt2 = (
    text: string,
    fx: number,
    fy: number,
    fh: number,
    maxW: number,
    bold = false,
    color = "#000000",
  ) => {
    const font = `${bold ? "700" : "400"} ${fh * S}px ${KR}`;
    ctx.save();
    ctx.font = font;
    let o = String(text || "").trim();
    while (o.length > 1 && ctx.measureText(o).width > maxW * S)
      o = `${o.slice(0, -2).trimEnd()}…`;
    ctx.fillStyle = color;
    ctx.fillText(o, fx * S, (fy + fh) * S);
    ctx.restore();
  };
  const { default: JsBarcode } = await import("jsbarcode");
  const makeBC = ({
    value,
    height,
    format,
    moduleWidth,
  }: {
    value: string;
    height: number;
    format: string;
    moduleWidth: number;
  }): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    try {
      JsBarcode(c, value || "0", {
        format,
        displayValue: false,
        margin: 0,
        height: height * S,
        width: moduleWidth * S,
        background: "rgba(255,255,255,0)",
        lineColor: "#000000",
      });
    } catch {}
    return c;
  };

  // ── 흰 배경 ──────────────────────────────────────────────────────────
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.imageSmoothingEnabled = false;

  // ── 콘텐츠 전용 공식 라벨 배치 ───────────────────────────────────────
  // 운송장번호 헤더행은 고정, 나머지 바디 요소는 위로 이동
  const DY = -20;

  zt2(formattedWblNum, 122, 6, 40, 350, true);
  zt("P. 1", 498, 10, 22, true);
  zt("1 / 1", 654, 10, 22, true);

  zt2(mainLabel, 76, 70 + DY, 100, 390, true);
  zt2(domMid, 492, 62 + DY, 56, 90, true);
  zt2(grpRnk, 560, 68 + DY, 28, 110, true);
  zt2(esNam, 492, 116 + DY, 50, 210, true);
  zt2(esCod || cenCod, 748, 70 + DY, 72, 110, true);
  zt2(cenSummary, 692, 132 + DY, 18, 210);
  if (areaLabel) zt2(areaLabel, 886, 82 + DY, 34, 60, true);

  zt(`발지:${senderLabel}`, 74, 184 + DY, 24, true);

  zt2(receiverNameMasked, 74, 228 + DY, 28, 330, true);
  zt2(receiverPhoneMasked, 468, 230 + DY, 20, 180);
  zt2(receiverAddr, 74, 264 + DY, 18, 585);
  zt2(prtAdd, 74, 314 + DY, 54, 500, true);

  const bcTerminal = makeBC({
    value: terminalBarcodeValue,
    height: 90,
    format: "CODE128",
    moduleWidth: 2.0,
  });
  ctx.drawImage(bcTerminal, 748 * S, (236 + DY) * S, bcTerminal.width, 90 * S);

  zt2(senderSummary, 76, 394 + DY, 18, 610);
  zt2(senderAddr, 74, 418 + DY, 16, 640);
  zt(`${todayLabel} Type:S`, 734, 392 + DY, 18);

  zt("의료기기", 74, 486 + DY, 22);
  zt("1 / 0 (건수/수량)", 826, 486 + DY, 18);

  zt2(remark, 74, 712 + DY, 16, 420);

  const bcBot = makeBC({
    value: wblNum,
    height: 120,
    format: "ITF",
    moduleWidth: 2.0,
  });
  ctx.drawImage(bcBot, 604 * S, (552 + DY) * S, bcBot.width, 120 * S);
  zt2(`운임Type:S  ${formattedWblNum}`, 560, 684 + DY, 18, 380);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) resolve(value);
        else reject(new Error("PNG 생성에 실패했습니다."));
      },
      "image/png",
      1,
    );
  });
};

export const saveGeneratedWaybillPngs = async ({
  addressList,
  zplLabels,
}: {
  addressList: any[];
  zplLabels?: string[];
}) => {
  const rows = buildWaybillRows(addressList, zplLabels);
  if (!rows.length) {
    throw new Error("운송장 PDF 출력 데이터가 없습니다.");
  }

  const pad2 = (v: number) => String(v).padStart(2, "0");
  const now = new Date();
  const folderName = `waybills-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const dir = zip.folder(folderName);
  if (!dir) throw new Error("zip 폴더 생성에 실패했습니다.");

  for (const row of rows) {
    const wblNum = String(row.wbl_num || "").trim() || "unknown";
    const mailboxCode = String(row.mailbox_code || "").trim() || "BOX";
    const organizationName = String(row.organization_name || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 30);
    const blob = await renderWaybillRowToPngBlob(row);
    dir.file(
      `wbl_${mailboxCode}${organizationName ? `_${organizationName}` : ""}_${wblNum}.png`,
      blob,
    );
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const zipName = `${folderName}.zip`;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const printGeneratedWaybillPngs = async ({
  addressList,
  zplLabels,
  printer,
  paperProfile,
}: {
  addressList: any[];
  zplLabels?: string[];
  printer?: string;
  paperProfile?: string;
}) => {
  const rows = buildWaybillRows(addressList, zplLabels);
  if (!rows.length) {
    throw new Error("출력할 운송장 데이터가 없습니다.");
  }
  for (const row of rows) {
    const blob = await renderWaybillRowToPngBlob(row);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const resp = await request<any>({
      path: "/api/requests/shipping/wbl/print-png",
      method: "POST",
      jsonBody: {
        png: base64,
        printer: printer || undefined,
        paperProfile: paperProfile || undefined,
        title: "Hanjin Waybill Label",
      },
    });
    if (!resp.ok) {
      throw new Error(
        (resp.data as any)?.message || "PNG 출력에 실패했습니다.",
      );
    }
  }
};
