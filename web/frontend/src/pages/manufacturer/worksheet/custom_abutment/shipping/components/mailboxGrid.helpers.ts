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

    const line = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      width = 2,
    ) => {
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

    // 외곽 테두리
    box(10, 10, 1198, 792, 3);

    // 최상단: 운송장번호 + P.1 1/1 + 한진택배
    line(10, 60, 1208, 60, 3);
    drawText(
      "운송장번호",
      30,
      45,
      '700 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    fitText(
      wbl,
      200,
      48,
      300,
      '700 32px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    drawText(
      "P. 1    1/1",
      550,
      45,
      '500 16px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    drawText(
      "한진택배 1588-0011",
      950,
      45,
      '700 16px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    // 왼쪽 대형 영역: 거제 (tmlNam) + domMid + sTemNam
    line(10, 370, 1208, 370, 3);
    fitText(
      tml || "거제",
      30,
      160,
      550,
      '900 110px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    // domMid (514 하산)
    const domMid = String(row.dom_mid || "").trim();
    if (domMid) {
      fitText(
        domMid,
        30,
        250,
        550,
        '700 70px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
    }

    // sTemNam (CB 650W)
    const sTemNam = String(row.s_tml_nam || "").trim();
    if (sTemNam) {
      fitText(
        sTemNam,
        30,
        330,
        550,
        '600 50px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
    }

    // 오른쪽 3단 박스
    line(590, 60, 590, 370, 3);
    line(720, 60, 720, 370, 3);
    line(860, 60, 860, 370, 3);

    // 도화정
    drawText(
      "도화정",
      610,
      100,
      '600 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    fitText(
      cen || "거...",
      610,
      140,
      100,
      '700 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    // 권역
    drawText(
      "권역",
      740,
      100,
      '600 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    fitText(
      receiverZip || "D1",
      740,
      150,
      110,
      '900 36px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    // 구분
    drawText(
      "구분",
      880,
      100,
      '600 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    fitText(
      mailboxCode || "A1A1 / 향기로운...",
      880,
      140,
      300,
      '700 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    // 중단: 패키지 주소 + 바코드
    line(10, 580, 1208, 580, 3);
    sideLabel("패키지", 30, 380, 180);
    fitText(
      receiverAddr || prtAdd || "고현동 38-4",
      120,
      430,
      600,
      '700 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    const { default: JsBarcode } = await import("jsbarcode");
    const barcodeCanvas = document.createElement("canvas");
    try {
      JsBarcode(barcodeCanvas, wbl || "-", {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 140,
        width: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
      ctx.drawImage(barcodeCanvas, 750, 380, 400, 140);
    } catch {}
    fitText(wbl, 880, 540, 200, "600 16px Arial, sans-serif");

    // 하단: 패키지 수령 정보
    line(10, 680, 1208, 680, 3);
    sideLabel("패키지 수령", 30, 590, 80);
    fitText(
      receiverName || "-",
      120,
      620,
      400,
      '700 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    fitText(
      receiverTel || "-",
      120,
      650,
      400,
      '600 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    fitText(printedYmd || "-", 950, 620, 150, "500 16px Arial, sans-serif");
    fitText(
      `Type:${fareType || "S"}`,
      950,
      650,
      150,
      "500 16px Arial, sans-serif",
    );

    fitText(
      `${goodsName}  ${boxCount}`,
      120,
      710,
      400,
      '600 16px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    // 최하단: 비고 + 바코드
    line(10, 730, 1208, 730, 3);
    drawText(
      "비고",
      30,
      765,
      '700 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );
    fitText(
      remark || "A1A1 / 향기로운치과 / 3건",
      130,
      765,
      600,
      '600 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    );

    const bottomBarcodeCanvas = document.createElement("canvas");
    try {
      JsBarcode(bottomBarcodeCanvas, wbl || "-", {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 40,
        width: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
      ctx.drawImage(bottomBarcodeCanvas, 750, 740, 400, 40);
    } catch {}
    fitText(
      `운임Type:${fareType || "S"}`,
      750,
      795,
      150,
      "500 14px Arial, sans-serif",
    );
    fitText(wbl, 920, 795, 200, "700 20px Arial, sans-serif");

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
