// change-log:
// - 2026-10-24: 100×150mm 납품 라벨. 받는 치과·보철 목록·보내는 기공소.
// related files:
// - web/frontend/src/shared/lab/LabShipLabelDialog.tsx
// - web/frontend/src/shared/lab/labWblsClient.ts

export const LAB_SHIP_LABEL_WIDTH_MM = 100;
export const LAB_SHIP_LABEL_HEIGHT_MM = 150;

const PX_PER_MM = 8;
const WIDTH = LAB_SHIP_LABEL_WIDTH_MM * PX_PER_MM;
const HEIGHT = LAB_SHIP_LABEL_HEIGHT_MM * PX_PER_MM;

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
};

const FONT =
  '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [];
  const lines: string[] = [];
  let line = "";
  for (const ch of source) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines.slice(0, maxLines);
}

function formatArrival(value: string): string {
  const ymd = String(value || "").trim();
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return ymd;
  return `${Number(match[2])}/${Number(match[3])} 도착`;
}

function kstNowLabel(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function renderLabShipLabel(input: LabShipLabelInput): {
  dataUrl: string;
  pngBase64: string;
} {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("라벨을 그리지 못했습니다.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, WIDTH - 16, HEIGHT - 16);

  const modeLabel = input.mode === "delivery" ? "딜리버리" : "택배";
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(16, 16, WIDTH - 32, 88);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 36px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(modeLabel, 36, 60);
  ctx.font = `500 20px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(kstNowLabel(), WIDTH - 36, 60);
  ctx.textAlign = "left";

  let y = 132;
  const inner = 36;
  const maxText = WIDTH - inner * 2;

  ctx.fillStyle = "#64748b";
  ctx.font = `600 18px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText("받는 곳", inner, y);
  y += 28;

  ctx.fillStyle = "#0f172a";
  ctx.font = `700 40px ${FONT}`;
  const nameLines = wrapLines(
    ctx,
    input.recipientName || "치과",
    maxText,
    2,
  );
  for (const line of nameLines) {
    ctx.fillText(line, inner, y);
    y += 48;
  }

  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = "#334155";
  const zip = String(input.recipientZip || "").trim();
  const address = [zip, input.recipientAddress].filter(Boolean).join(" ");
  const addressLines = wrapLines(ctx, address || "주소 없음", maxText, 3);
  for (const line of addressLines) {
    ctx.fillText(line, inner, y);
    y += 30;
  }
  const phone = String(input.recipientPhone || "").trim();
  if (phone) {
    y += 4;
    ctx.fillText(phone, inner, y);
    y += 30;
  }

  y += 16;
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(inner, y);
  ctx.lineTo(WIDTH - inner, y);
  ctx.stroke();
  y += 18;

  ctx.fillStyle = "#64748b";
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText("보철", inner, y);
  y += 28;

  const items = input.items.slice(0, 8);
  const rest = input.items.length - items.length;
  ctx.font = `600 22px ${FONT}`;
  for (const item of items) {
    const teeth = String(item.teeth || "").trim();
    const left = teeth ? `${item.patient}  ${teeth}` : item.patient;
    const arrival = formatArrival(item.arrival);
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "left";
    const leftMax = arrival ? maxText - 120 : maxText;
    const shown = wrapLines(ctx, left, leftMax, 1)[0] || item.patient;
    ctx.fillText(shown, inner, y);
    if (arrival) {
      ctx.fillStyle = "#64748b";
      ctx.font = `500 18px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(arrival, WIDTH - inner, y + 2);
      ctx.textAlign = "left";
      ctx.font = `600 22px ${FONT}`;
    }
    y += 34;
  }
  if (rest > 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(`외 ${rest}건`, inner, y);
    y += 30;
  }
  if (items.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText("선택된 보철 없음", inner, y);
    y += 32;
  }

  const senderTop = Math.max(y + 24, HEIGHT - 280);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(inner, senderTop);
  ctx.lineTo(WIDTH - inner, senderTop);
  ctx.stroke();

  let sy = senderTop + 18;
  ctx.fillStyle = "#64748b";
  ctx.font = `600 18px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("보내는 곳", inner, sy);
  sy += 28;
  ctx.fillStyle = "#0f172a";
  ctx.font = `700 26px ${FONT}`;
  const senderName = wrapLines(ctx, input.senderName || "기공소", maxText, 1)[0] || "기공소";
  ctx.fillText(senderName, inner, sy);
  sy += 36;
  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = "#334155";
  const senderZip = String(input.senderZip || "").trim();
  const senderAddress = [senderZip, input.senderAddress].filter(Boolean).join(" ");
  const senderLines = wrapLines(ctx, senderAddress || "주소 없음", maxText, 2);
  for (const line of senderLines) {
    ctx.fillText(line, inner, sy);
    sy += 28;
  }
  const senderPhone = String(input.senderPhone || "").trim();
  if (senderPhone) ctx.fillText(senderPhone, inner, sy);

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
  const win = window.open("", "_blank", "noopener,noreferrer,width=480,height=760");
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
