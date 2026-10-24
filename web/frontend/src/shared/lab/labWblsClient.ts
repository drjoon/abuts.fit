// change-log:
// - 2026-10-24: 출력은 연결 프로그램(127.0.0.1:8010, Windows v17)이 한다.
// - 2026-10-24: 프린터는 Xprinter XP-D4602B(ZPL). ZM400은 여기 기종이 아님.
// related files:
// - bg/lab-cad-helper/win/HttpServer.cs
// - web/frontend/src/shared/files/labHelperClient.ts
// - web/frontend/src/shared/lab/LabShipLabelDialog.tsx

import { LAB_HELPER_PRINT_MIN_VERSION } from "@/shared/files/labHelperClient";

const HELPER_ORIGIN = "http://127.0.0.1:8010";

const PRINTER_KEY = "abuts.labWblsPrinter";

/** PC3 운송장(wbls)과 같은 기종. ZM400은 lot/pack 쪽이라 여기 기본이 아니다. */
export const LAB_WBLS_PRINTER_MODEL = "Xprinter XP-D4602B";

export function isPc3ZplPrinterName(name: string): boolean {
  const text = String(name || "").toLowerCase().replace(/\s+/g, "");
  return text.includes("d4602") || text.includes("xp-d4602b");
}

export function pickPc3ZplPrinter(
  printers: readonly string[],
  fallback = "",
): string {
  const named = printers.find((name) => isPc3ZplPrinterName(name));
  if (named) return named;
  return String(fallback || "").trim();
}

export function labWblsIsWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = `${navigator.userAgent || ""} ${navigator.platform || ""}`;
  return /Windows/i.test(ua);
}

export type LabWblsHealth = {
  ok: boolean;
  version: number;
  /** v17 미만이면 연결 프로그램은 있어도 택배 라벨 API가 없다. */
  print: boolean;
};

export async function probeLabWbls(): Promise<LabWblsHealth | null> {
  try {
    const res = await fetch(`${HELPER_ORIGIN}/health`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      version?: number;
      service?: string;
    };
    if (!data?.ok || data.service !== "abuts-lab-helper") return null;
    const version = Number(data.version || 0);
    return {
      ok: true,
      version,
      print: version >= LAB_HELPER_PRINT_MIN_VERSION,
    };
  } catch {
    return null;
  }
}

export async function listLabWblsPrinters(): Promise<{
  printers: string[];
  defaultPrinter: string;
}> {
  const res = await fetch(`${HELPER_ORIGIN}/printers`, { cache: "no-store" });
  if (!res.ok) return { printers: [], defaultPrinter: "" };
  const data = (await res.json()) as {
    printers?: unknown;
    defaultPrinter?: unknown;
  };
  const printers = Array.isArray(data.printers)
    ? data.printers.map((name) => String(name || "").trim()).filter(Boolean)
    : [];
  return {
    printers,
    defaultPrinter: String(data.defaultPrinter || "").trim(),
  };
}

export function readLabWblsPrinter(): string {
  try {
    return String(localStorage.getItem(PRINTER_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeLabWblsPrinter(name: string) {
  try {
    const next = String(name || "").trim();
    if (!next) localStorage.removeItem(PRINTER_KEY);
    else localStorage.setItem(PRINTER_KEY, next);
  } catch {
    // 저장 실패는 이번 출력만 프린터 이름을 보낸다.
  }
}

export async function printLabWblsPng(input: {
  pngBase64: string;
  printer?: string;
  title?: string;
  widthMm: number;
  heightMm: number;
}): Promise<void> {
  const res = await fetch(`${HELPER_ORIGIN}/print-png`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      png: input.pngBase64,
      printer: input.printer || "",
      title: input.title || "어벗츠 택배 라벨",
      widthMm: input.widthMm,
      heightMm: input.heightMm,
    }),
  });
  let message = "라벨 출력에 실패했습니다.";
  try {
    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (res.ok && data?.ok) return;
    if (data?.message) message = String(data.message);
  } catch {
    // 본문 없음
  }
  throw new Error(message);
}
