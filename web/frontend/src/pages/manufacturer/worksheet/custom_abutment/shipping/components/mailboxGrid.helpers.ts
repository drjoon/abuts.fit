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
  if (!response.ok || !responseBody?.success) {
    const message =
      responseBody?.error ||
      responseBody?.message ||
      `한진 API 호출 실패 (status=${response.status})`;
    throw new Error(message);
  }
  return responseBody?.data;
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
    throw new Error(message);
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

export const downloadPdfFromBase64 = async (base64: string, fileName: string) => {
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
    (row) => row && row.result_code === "OK" && row.wbl_num,
  );
  if (!rows.length) {
    throw new Error("운송장 정보를 찾지 못했습니다.");
  }

  const canvasW = 1218;
  const canvasH = 812;

  const isMeaningfulHanjinText = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return false;
    return raw.replace(/[\/()\s]+/g, "").length > 0;
  };

  const renderRowToPngBlob = async (row: any) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지 렌더링에 실패했습니다.");

    const wbl = String(row.wbl_num || "").trim();
    const prtAdd = String(row.prt_add || "").trim();
    const senderName = String(row.snd_prn || row.snd_nam || "").trim();
    const senderTel = String(row.snd_tel || row.snd_hphn || "").trim();
    const senderAddr = String(row.snd_add || row.snd_addr || "").trim();
    const receiverName = String(row.rcv_prn || row.rcv_nam || "").trim();
    const receiverTel = String(row.rcv_tel || row.rcv_hphn || "").trim();
    const receiverZip = String(row.rcv_zip || "").trim();
    const receiverAddr = String(
      row.address || row.rcv_add || row.rcv_addr || prtAdd,
    ).trim();
    const goodsName = String(row.goods_nm || row.gds_nm || "의료기기").trim();
    const boxCount = String(
      row.qty || row.box_cnt || row.cts_num || "1/0",
    ).trim();
    const fareType = String(row.pay_typ || row.fare_typ || "S").trim();
    const tmlRaw = String(row.tml_nam || "").trim();
    const cenRaw = String(row.cen_nam || "").trim();
    const tml = isMeaningfulHanjinText(tmlRaw) ? tmlRaw : "";
    const cen = isMeaningfulHanjinText(cenRaw) ? cenRaw : "";
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
    const printedYmd = String(
      row.prt_ymd || row.wbl_dt || new Date().toISOString().slice(0, 10),
    )
      .trim()
      .replace(/[^0-9-]/g, "")
      .slice(0, 10);

    const drawText = (
      text: string,
      x: number,
      y: number,
      font: string,
      color = "#111827",
    ) => {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.fillText(text, x, y);
    };

    const fitText = (
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      font: string,
      color = "#111827",
    ) => {
      ctx.save();
      ctx.font = font;
      let output = String(text || "").trim();
      if (output) {
        while (output.length > 1 && ctx.measureText(output).width > maxWidth) {
          output = `${output.slice(0, -2).trimEnd()}…`;
        }
      }
      ctx.fillStyle = color;
      ctx.fillText(output || "-", x, y);
      ctx.restore();
    };

    const line = (x1: number, y1: number, x2: number, y2: number, width = 2) => {
      ctx.beginPath();
      ctx.lineWidth = width;
      ctx.strokeStyle = "#111827";
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const box = (x: number, y: number, w: number, h: number, width = 2) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = "#111827";
      ctx.strokeRect(x, y, w, h);
    };

    const sideLabel = (text: string, x: number, y: number, h: number) => {
      ctx.save();
      ctx.translate(x, y + h);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#111827";
      ctx.font = '700 22px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    box(18, 18, 1180, 768, 2);
    line(18, 58, 1198, 58, 2);
    drawText("운송장번호", 30, 48, '700 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    fitText(wbl, 150, 44, 320, '700 30px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    drawText("P. 1", 520, 44, '500 16px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    drawText("1 / 1", 590, 44, '500 16px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    drawText("한진택배", 945, 44, '800 26px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    drawText("1588-0011", 1045, 44, "500 12px Arial, sans-serif");

    const routeTop = 58;
    line(18, 150, 1198, 150, 2);
    line(700, routeTop, 700, 150, 2);
    line(860, routeTop, 860, 150, 2);
    line(980, routeTop, 980, 150, 2);
    drawText("발도", 34, 102, '600 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    drawText("도착점", 740, 102, '600 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    drawText("권역", 892, 102, '600 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    drawText("구분", 1012, 102, '600 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    fitText(tml || "CB", 34, 136, 620, "900 86px Arial, sans-serif");
    fitText(cen || "650", 730, 136, 120, "800 50px Arial, sans-serif");
    fitText(receiverName || "-", 730, 186, 120, '700 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    fitText(receiverZip || "D1", 880, 136, 90, "800 46px Arial, sans-serif");
    fitText(remark || "-", 1012, 136, 160, '700 22px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');

    const receiverTop = 150;
    line(110, receiverTop, 110, 290, 2);
    sideLabel("받는분", 52, receiverTop + 8, 98);
    fitText(receiverName || "-", 132, receiverTop + 36, 320, '700 34px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    fitText(receiverTel || "-", 470, receiverTop + 36, 240, "600 24px Arial, sans-serif");
    fitText(receiverAddr || prtAdd || "-", 132, receiverTop + 92, 960, '600 28px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');

    const { default: JsBarcode } = await import("jsbarcode");
    const barcodeCanvas = document.createElement("canvas");
    try {
      JsBarcode(barcodeCanvas, wbl || "-", {
        format: "CODE128",
        displayValue: false,
        font: "Apple SD Gothic Neo",
        fontSize: 28,
        textMargin: 6,
        margin: 0,
        height: 62,
        width: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
      ctx.drawImage(barcodeCanvas, 902, receiverTop + 70, 220, 52);
    } catch {}

    fitText(wbl, 930, receiverTop + 144, 180, "600 18px Arial, sans-serif");

    const senderTop = 428;
    line(18, senderTop, 1198, senderTop, 2);
    line(18, 562, 1198, 562, 2);
    line(110, senderTop, 110, 562, 2);
    sideLabel("보내는분", 52, senderTop + 8, 96);
    fitText(senderName || "-", 132, senderTop + 38, 300, '700 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    fitText(senderTel || "-", 480, senderTop + 38, 220, "600 20px Arial, sans-serif");
    fitText(senderAddr || "-", 132, senderTop + 86, 820, '500 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    fitText(printedYmd || "-", 882, senderTop + 38, 96, "500 18px Arial, sans-serif");
    fitText(`Type:${fareType || "S"}`, 1042, senderTop + 38, 120, "500 18px Arial, sans-serif");

    drawText("비고", 34, 596, '700 28px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    fitText(remark || "-", 130, 596, 820, '600 28px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    drawText(
      "※ 개인정보 보호를 위하여 인수하신 화물의 운송장증을 폐기하여 주시기 바랍니다.",
      34,
      728,
      '500 14px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    const bottomBarcodeCanvas = document.createElement("canvas");
    try {
      JsBarcode(bottomBarcodeCanvas, wbl || "-", {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 110,
        width: 2.2,
        background: "#ffffff",
        lineColor: "#000000",
      });
      ctx.drawImage(bottomBarcodeCanvas, 904, 620, 240, 76);
    } catch {}
    fitText(`운임Type:${fareType || "S"}`, 836, 736, 120, "500 16px Arial, sans-serif");
    fitText(wbl, 988, 736, 132, "700 24px Arial, sans-serif");
    fitText(goodsName, 132, senderTop + 122, 300, '600 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif');
    fitText(boxCount, 470, senderTop + 122, 120, "600 18px Arial, sans-serif");

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
