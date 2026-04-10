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
  payload,
  wblPrintOptions,
}: {
  path: string;
  mailboxAddresses?: string[];
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

export const saveGeneratedWaybillPngs = async ({
  addressList,
  zplLabels,
}: {
  addressList: any[];
  zplLabels?: string[];
}) => {
  const normalized = Array.isArray(addressList) ? addressList : [];
  const rows = normalized.filter(
    (row) =>
      row &&
      String(row.result_code || row.resultCode || "OK").trim() === "OK" &&
      (row.wbl_num || row.wblNum),
  );
  if (!rows.length) {
    throw new Error("운송장 정보를 찾지 못했습니다.");
  }

  // ZPL PW984 x LL787 dots (203dpi) 기준 × 2배 고해상도
  const S = 2;
  const canvasW = 984 * S;
  const canvasH = 787 * S;

  const renderRowToPngBlob = async (row: any) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지 렌더링에 실패했습니다.");

    const KR = '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

    // ── 필드 추출 (ZPL buildHanjinWblZplLabels와 동일) ────────────────────
    const wbl = String(row.wbl_num || "").trim();
    const prtAdd = String(row.prt_add || "").trim();
    const receiverName = String(
      row.receiver_name || row.rcv_prn || row.rcv_nam || "",
    ).trim();
    const receiverPhone = String(
      row.receiver_phone || row.rcv_tel || row.rcv_hphn || "",
    ).trim();
    const tmlNam = String(row.tml_nam || "").trim();
    const domMid = String(row.dom_mid || "").trim();
    const sTemNam = String(row.s_tml_nam || "").trim();
    const domRgn = String(row.dom_rgn || "").trim();
    const grpRnk = String(row.grp_rnk || "").trim();
    const mailboxCode = String(row.mailbox_code || "").trim();
    const organizationName = String(row.organization_name || "").trim();
    const requestCount = Number(row.request_count || 0);
    const remark = String(
      row.remark ||
        [
          mailboxCode,
          organizationName,
          requestCount > 0 ? `${requestCount}건` : "",
        ]
          .filter(Boolean)
          .join(" / ") ||
        row.msg_key ||
        "",
    ).trim();
    const today = new Date().toISOString().slice(0, 10);

    // ── 유틸 (dot 단위 좌표 → pixel) ─────────────────────────────────────
    const p = (dots: number) => dots * S;

    const dt = (
      text: string,
      x: number,
      y: number,
      font: string,
      color = "#111827",
    ) => {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.fillText(text, p(x), p(y));
    };

    const ft = (
      text: string,
      x: number,
      y: number,
      maxDots: number,
      font: string,
      color = "#111827",
    ) => {
      ctx.save();
      ctx.font = font;
      let o = String(text || "").trim();
      while (o.length > 1 && ctx.measureText(o).width > p(maxDots))
        o = `${o.slice(0, -2).trimEnd()}…`;
      ctx.fillStyle = color;
      ctx.fillText(o || "-", p(x), p(y));
      ctx.restore();
    };

    const hl = (x1: number, y: number, x2: number, w = 3) => {
      ctx.beginPath();
      ctx.lineWidth = w * S;
      ctx.strokeStyle = "#111827";
      ctx.moveTo(p(x1), p(y));
      ctx.lineTo(p(x2), p(y));
      ctx.stroke();
    };
    const vl = (x: number, y1: number, y2: number, w = 3) => {
      ctx.beginPath();
      ctx.lineWidth = w * S;
      ctx.strokeStyle = "#111827";
      ctx.moveTo(p(x), p(y1));
      ctx.lineTo(p(x), p(y2));
      ctx.stroke();
    };

    const { default: JsBarcode } = await import("jsbarcode");
    const bc = (val: string, h: number, bw = 2): HTMLCanvasElement => {
      const c = document.createElement("canvas");
      try {
        JsBarcode(c, val || "0", {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          height: h * S,
          width: bw,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch {}
      return c;
    };

    // ── 배경 + 외곽 ──────────────────────────────────────────────────────
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.lineWidth = 3 * S;
    ctx.strokeStyle = "#111827";
    ctx.strokeRect(p(30), p(5), p(924), p(777));

    // ── 1. 헤더 (ZPL y:15~70) ─────────────────────────────────────────────
    // ^FO30,20 운송장번호 / ^FO200,15 wblNum / ^FO550,20 P.1 / ^FO850,20 한진택배
    hl(30, 70, 954);
    dt("운송장번호", 38, 44, `600 ${p(18)}px ${KR}`);
    ft(wbl, 190, 47, 350, `700 ${p(28)}px Arial, sans-serif`);
    dt("P.1  1/1", 545, 44, `500 ${p(18)}px ${KR}`);
    dt("한진택배 1588-0011", 760, 44, `700 ${p(18)}px ${KR}`, "#1a56db");

    // ── 2. 메인 분류 영역 (ZPL y:70~330) ─────────────────────────────────
    // 좌: tml_nam(크게) / dom_mid / s_tml_nam
    // 우3분할: x=500(도화정/dom_rgn) | x=630(권역/grp_rnk) | x=760(구분/mailboxCode)
    vl(500, 70, 330);
    vl(630, 70, 330);
    vl(760, 70, 330);
    hl(30, 330, 954);

    ft(tmlNam || "거제", 38, 195, 455, `900 ${p(120)}px ${KR}`);
    if (domMid) ft(domMid, 38, 275, 455, `700 ${p(72)}px ${KR}`);
    if (sTemNam) ft(sTemNam, 38, 323, 455, `600 ${p(48)}px ${KR}`);

    dt("도화정", 510, 100, `500 ${p(20)}px ${KR}`);
    ft(domRgn, 510, 140, 115, `700 ${p(22)}px ${KR}`);
    dt("권역", 640, 100, `500 ${p(20)}px ${KR}`);
    ft(grpRnk, 640, 155, 115, `900 ${p(40)}px ${KR}`);
    dt("구분", 770, 100, `500 ${p(20)}px ${KR}`);
    ft(mailboxCode, 770, 140, 175, `700 ${p(20)}px ${KR}`);

    // ── 3. 배달주소 (ZPL y:330~520) ─────────────────────────────────────
    hl(30, 520, 954);
    dt("배달주소", 38, 365, `500 ${p(20)}px ${KR}`, "#555");
    ft(prtAdd, 38, 400, 590, `600 ${p(22)}px ${KR}`);

    const bcMain = bc(wbl, 120, 3);
    ctx.drawImage(bcMain, p(650), p(348), p(300), p(120));
    ft(wbl, 650, 494, 300, `500 ${p(15)}px Arial, sans-serif`);

    // ── 4. 받는 분 (ZPL y:520~640) ──────────────────────────────────────
    hl(30, 640, 954);
    dt("받는분", 38, 548, `500 ${p(20)}px ${KR}`, "#555");
    ft(receiverName, 38, 578, 740, `700 ${p(24)}px ${KR}`);
    ft(receiverPhone, 38, 610, 740, `500 ${p(20)}px ${KR}`);
    dt(today, 795, 568, `500 ${p(18)}px ${KR}`, "#444");
    dt("Type:S", 795, 594, `500 ${p(18)}px ${KR}`, "#444");

    // ── 5. 품목 (ZPL y:640~670) ───────────────────────────────────────────
    hl(30, 670, 954);
    dt("의료기기  1/0", 38, 660, `500 ${p(18)}px ${KR}`);

    // ── 6. 비고 + 하단 바코드 (ZPL y:670~740) ────────────────────────────
    hl(30, 740, 954, 2);
    dt("비고", 38, 710, `600 ${p(18)}px ${KR}`);
    ft(remark, 110, 710, 640, `500 ${p(18)}px ${KR}`);

    const bcBot = bc(wbl, 40, 2);
    ctx.drawImage(bcBot, p(800), p(678), p(150), p(40));
    ft(`운임Type:S  ${wbl}`, 640, 758, 310, `500 ${p(14)}px Arial, sans-serif`);

    // ── 7. 개인정보 문구 (ZPL y:740~787) ─────────────────────────────────
    ft(
      "※ 개인정보 보호를 위하여 인수하신 화물의 운송장을 폐기하여 주시기 바랍니다. ⓗ",
      38,
      775,
      916,
      `400 ${p(15)}px ${KR}`,
      "#555",
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value);
          else reject(new Error("PNG 생성에 실패했습니다."));
        },
        "image/png",
        1,
      );
    });
    return blob;
  };

  const pad2 = (v: number) => String(v).padStart(2, "0");
  const now = new Date();
  const folderName = `waybills-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const dir = zip.folder(folderName);
  if (!dir) throw new Error("zip 폴더 생성에 실패했습니다.");

  void zplLabels;
  for (const row of rows) {
    const wblNum = String(row.wbl_num || "").trim() || "unknown";
    const mailboxCode = String(row.mailbox_code || "").trim() || "BOX";
    const organizationName = String(row.organization_name || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 30);
    const blob = await renderRowToPngBlob(row);
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
