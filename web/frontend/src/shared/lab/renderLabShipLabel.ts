// change-log:
// - 2026-10-24: 한진 운송장과 같은 가로 123×98.5mm. 칸 위치는 wbls 운송장 캔버스와 같다.
// - 2026-10-24: 100×150mm 납품 라벨. 받는 치과·보철 목록·보내는 기공소.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/mailboxGrid.helpers.ts
// - web/frontend/src/shared/lab/LabShipLabelDialog.tsx
// - web/frontend/src/shared/lab/labWblsClient.ts
import JsBarcode from "jsbarcode";

/** ZPL PW984 × LL787 @ 203dpi. wbls printPngWindows와 같은 용지. */
export const LAB_SHIP_LABEL_WIDTH_MM = 123;
export const LAB_SHIP_LABEL_HEIGHT_MM = 98.5;

const WAYBILL_S = 4;
const WAYBILL_W = 984 * WAYBILL_S;
const WAYBILL_H = 787 * WAYBILL_S;

export type LabShipLabelMode = "parcel" | "delivery";

export type LabShipLabelItem = {
  patient: string;
  teeth: string;
  arrival: string;
};

export type LabShipLabelInput = {
  mode: LabShipLabelMode;
  recipientName: string;
  recipientZip: string;
  recipientAddress: string;
  recipientPhone: string;
  senderName: string;
  senderZip: string;
  senderAddress: string;
  senderPhone: string;
  items: LabShipLabelItem[];
  /** 한진 운송장번호 12자리. 없으면 번호·바코드 칸은 비운다. */
  waybillNumber?: string;
};

const KR = '"Nanum Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function formatWaybillDisplay(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 12) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

function maskName(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  const chars = Array.from(text);
  if (chars.length === 1) return text;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

function maskPhone(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("02")) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${"*".repeat(3)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${"*".repeat(4)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${"*".repeat(3)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${"*".repeat(4)}-${digits.slice(7)}`;
  if (digits.length === 12) return `${digits.slice(0, 4)}-${"*".repeat(4)}-${digits.slice(8)}`;
  const head = digits.slice(0, Math.max(0, digits.length - 8));
  const middle = digits.slice(Math.max(0, digits.length - 8), Math.max(0, digits.length - 4));
  const tail = digits.slice(-4);
  if (!head || !middle || !tail) return String(value || "").trim();
  return `${head}-${"*".repeat(middle.length)}-${tail}`;
}

function kstYmd(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function joinAddress(zip: string, address: string) {
  return [zip, address].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

export function renderLabShipLabel(input: LabShipLabelInput): {
  dataUrl: string;
  pngBase64: string;
} {
  const canvas = document.createElement("canvas");
  canvas.width = WAYBILL_W;
  canvas.height = WAYBILL_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("라벨을 그리지 못했습니다.");

  const S = WAYBILL_S;
  const zt = (
    text: string,
    fx: number,
    fy: number,
    fh: number,
    bold = false,
  ) => {
    const value = String(text || "").trim();
    if (!value) return;
    ctx.font = `${bold ? "700" : "400"} ${fh * S}px ${KR}`;
    ctx.fillStyle = "#000000";
    ctx.fillText(value, fx * S, (fy + fh) * S);
  };
  const zt2 = (
    text: string,
    fx: number,
    fy: number,
    fh: number,
    maxW: number,
    bold = false,
  ) => {
    const font = `${bold ? "700" : "400"} ${fh * S}px ${KR}`;
    ctx.save();
    ctx.font = font;
    let o = String(text || "").trim();
    if (!o) {
      ctx.restore();
      return;
    }
    while (o.length > 1 && ctx.measureText(o).width > maxW * S) {
      o = `${o.slice(0, -2).trimEnd()}…`;
    }
    ctx.fillStyle = "#000000";
    ctx.fillText(o, fx * S, (fy + fh) * S);
    ctx.restore();
  };
  const drawBarcode = (
    value: string,
    x: number,
    y: number,
    height: number,
    format: "CODE128" | "ITF",
  ) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return;
    const c = document.createElement("canvas");
    try {
      JsBarcode(c, digits, {
        format,
        displayValue: false,
        margin: 0,
        height: height * S,
        width: 2 * S,
        background: "rgba(255,255,255,0)",
        lineColor: "#000000",
      });
    } catch {
      return;
    }
    ctx.drawImage(c, x * S, y * S, c.width, height * S);
  };

  const wblNum = String(input.waybillNumber || "").replace(/\D/g, "");
  const formattedWbl = formatWaybillDisplay(wblNum);
  const receiverAddr = joinAddress(input.recipientZip, input.recipientAddress);
  const senderAddr = joinAddress(input.senderZip, input.senderAddress);
  const receiverName = maskName(input.recipientName);
  const receiverPhone = maskPhone(input.recipientPhone);
  const senderName = maskName(input.senderName);
  const senderPhone = maskPhone(input.senderPhone);
  const senderSummary = [senderName, senderPhone].filter(Boolean).join(" / ");
  const screwLine = input.items
    .map((item) => [item.patient, item.teeth].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
  const remark = input.mode === "delivery" ? "딜리버리" : "택배";
  const todayLabel = `${kstYmd().replace(/-/g, ".")}.`;
  const DY = -20;

  ctx.clearRect(0, 0, WAYBILL_W, WAYBILL_H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WAYBILL_W, WAYBILL_H);
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = "alphabetic";

  zt2(formattedWbl, 122, 6, 40, 350, true);
  zt("P. 1", 498, 10, 22, true);
  zt("1 / 1", 654, 10, 22, true);

  zt(`발지:`, 74, 184 + DY, 24, true);
  zt2(receiverName, 74, 228 + DY, 28, 330, true);
  zt2(receiverPhone, 468, 230 + DY, 20, 180);
  zt2(receiverAddr, 74, 264 + DY, 18, 585);
  zt2(receiverAddr, 74, 314 + DY, 54, 500, true);

  if (wblNum) {
    drawBarcode(wblNum, 748, 236 + DY, 90, "CODE128");
  }

  zt2(senderSummary, 76, 394 + DY, 18, 610);
  zt2(senderAddr, 74, 418 + DY, 16, 640);
  zt(`${todayLabel} Type:S`, 734, 392 + DY, 18);

  zt("의료기기", 74, 486 + DY, 22);
  zt2(screwLine, 74, 514 + DY, 20, 500);
  zt2(remark, 74, 712 + DY, 16, 420);

  if (wblNum) {
    drawBarcode(wblNum, 604, 552 + DY, 120, "ITF");
    zt2(`운임Type:S  ${formattedWbl}`, 560, 684 + DY, 18, 380);
  }

  const dataUrl = canvas.toDataURL("image/png");
  const pngBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return { dataUrl, pngBase64 };
}

export function downloadLabShipLabel(dataUrl: string, fileName: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function printLabShipLabelInBrowser(dataUrl: string): boolean {
  const win = window.open("", "_blank", "noopener,noreferrer,width=720,height=560");
  if (!win) return false;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>택배 라벨</title>
<style>
  @page { size: ${LAB_SHIP_LABEL_WIDTH_MM}mm ${LAB_SHIP_LABEL_HEIGHT_MM}mm; margin: 0; }
  html, body { margin: 0; background: #fff; }
  img { width: ${LAB_SHIP_LABEL_WIDTH_MM}mm; height: ${LAB_SHIP_LABEL_HEIGHT_MM}mm; display: block; }
</style></head><body>
<img src="${dataUrl}" alt="택배 라벨" />
<script>window.onload=function(){window.focus();window.print();}<\/script>
</body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
