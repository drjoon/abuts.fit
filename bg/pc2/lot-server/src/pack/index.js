// change-log:
// - 2026-11-28: pack-server(D:\bg\pack-server\pack-server\app.js) 기능을 lot-server에 내재화.
//   프린터 목록·브랜딩·ZPL/RAW 출력. LOT_PACK_EMBED=1(기본)이면 8012에서 같은 경로를 직접 처리(8004 프록시 없음).
//   LOT_PRINT_DRY_RUN=1이면 프린터로 보내지 않고 data/print-dry-run/에만 저장(시험용).
//   pack-server 서비스는 그대로 둔다. 이관 후 끄기만 하면 된다(README).
// related files:
// - bg/pc2/pack-server/app.js
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/README.md

import http from "http";
import os from "os";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function envFlag(name, fallback = "0") {
  return String(process.env[name] ?? fallback).trim() === "1";
}

export function packEmbedEnabled() {
  return String(process.env.LOT_PACK_EMBED ?? "1").trim() !== "0";
}

export function printDryRun() {
  return envFlag("LOT_PRINT_DRY_RUN", "0");
}

export function defaultPrinter() {
  return String(process.env.PACK_PRINT_SERVER_DEFAULT_PRINTER || "").trim();
}

export function packSecret() {
  return String(process.env.PACK_PRINT_SERVER_SHARED_SECRET || "").trim();
}

export function allowIps() {
  return String(process.env.ALLOW_IPS || process.env.PACK_ALLOW_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** pack-server local.env에서 아직 없는 PACK_*·ALLOW_IPS만 읽는다(비밀을 로그에 남기지 않음). */
export function loadPackFallbackEnv() {
  const candidates = [
    process.env.LOT_PACK_ENV,
    process.platform === "win32" ? "D:\\bg\\pack-server\\pack-server\\local.env" : "",
    path.join(ROOT, "..", "pack-server", "pack-server", "local.env"),
  ].filter(Boolean);
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    let n = 0;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!key) continue;
      if (!/^(PACK_|ALLOW_IPS$)/.test(key)) continue;
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
        n += 1;
      }
    }
    return { file: envPath, added: n };
  }
  return { file: null, added: 0 };
}

export function brandingFromEnv() {
  return {
    productName: process.env.PACK_PRODUCT_NAME || "",
    modelName: process.env.PACK_MODEL_NAME || "",
    licenseNo: process.env.PACK_LICENSE_NO || "",
    manufacturerName: process.env.PACK_MANUFACTURER_NAME || "",
    manufacturerAddr: process.env.PACK_MANUFACTURER_ADDR || "",
    manufacturerTelFax: process.env.PACK_MANUFACTURER_TEL_FAX || "",
    manufacturerPermitNo: process.env.PACK_MANUFACTURER_PERMIT_NO || process.env.PACK_LICENSE_NO || "",
    sellerName: process.env.PACK_SELLER_NAME || "",
    sellerPermit: process.env.PACK_SELLER_PERMIT || "",
    sellerAddr: process.env.PACK_SELLER_ADDR || "",
    sellerTel: process.env.PACK_SELLER_TEL || "",
    manualQrLabel: process.env.PACK_MANUAL_QR_LABEL || "",
    udiGtin: process.env.PACK_UDI_GTIN || "",
    certInfo: process.env.PACK_CERT_INFO || "",
    homepageUrl: process.env.PACK_HOMEPAGE_URL || "",
  };
}

export const PACK_PATHS = new Set(["/printers", "/branding", "/print-zpl", "/print-packing-label", "/pack/health"]);
export const PACK_API_PATHS = new Set(["/api/printers", "/api/branding", "/api/print-zpl", "/api/print-packing-label"]);

export function isPackPath(pathname) {
  return PACK_PATHS.has(pathname) || PACK_API_PATHS.has(pathname);
}

const isWindows = process.platform === "win32";

export function listPrinters() {
  return new Promise((resolve, reject) => {
    if (isWindows) {
      const psScript = [
        "if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {",
        "  Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name",
        "} elseif (Get-Command Get-WmiObject -ErrorAction SilentlyContinue) {",
        "  Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name",
        "} else { throw 'No printer query cmdlets available' }",
      ].join("; ");
      execFile("powershell.exe", ["-NoProfile", "-Command", psScript], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
        if (err) return reject(err);
        const printers = String(stdout || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        resolve(printers);
      });
      return;
    }
    execFile("lpstat", ["-p"], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve([]);
      const printers = String(stdout || "")
        .split(/\r?\n/)
        .map((line) => {
          const parts = line.split(/\s+/);
          if (parts[0] === "printer" && parts[1]) return parts[1];
          return "";
        })
        .filter(Boolean);
      resolve(printers);
    });
  });
}

export async function resolvePrinter({ requestedPrinter, printerQuery } = {}) {
  const direct = String(requestedPrinter || "").trim();
  if (direct) return direct;
  const query = String(printerQuery || "").trim().toUpperCase();
  if (query) {
    const printers = await listPrinters().catch(() => []);
    const found = printers.find((name) => String(name || "").toUpperCase().includes(query));
    return found || "";
  }
  const fallback = defaultPrinter();
  if (fallback) return fallback;
  const printers = await listPrinters().catch(() => []);
  return Array.isArray(printers) && printers.length ? printers[0] : "";
}

export function safeText(value, maxLen = 36) {
  const s = String(value || "")
    .replace(/[\^~\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

const mmToDots = (mm, dpi) => {
  const mmNum = Number(mm);
  const dpiNum = Number(dpi);
  if (!Number.isFinite(mmNum) || !Number.isFinite(dpiNum) || dpiNum <= 0) return 0;
  return Math.max(0, Math.round((mmNum / 25.4) * dpiNum));
};

export function resolvePackZplSize(payload) {
  const zplPW = Number(payload?.zplPW);
  const zplLL = Number(payload?.zplLL);
  if (Number.isFinite(zplPW) && zplPW > 0 && Number.isFinite(zplLL) && zplLL > 0) {
    return { pw: Math.floor(zplPW), ll: Math.floor(zplLL) };
  }
  const paperProfile = String(payload?.paperProfile || "").trim();
  const dpi = Number(payload?.dpi) || Number(process.env.PACK_LABEL_DPI || 600);
  if (paperProfile === "PACK_80x65") return { pw: mmToDots(80, dpi), ll: mmToDots(65, dpi) };
  const defaultDpi = Number(process.env.PACK_LABEL_DPI || 600);
  return { pw: mmToDots(80, defaultDpi), ll: mmToDots(65, defaultDpi) };
}

export function buildPackingLabelZpl(payload = {}) {
  if (payload.zpl) return String(payload.zpl);
  const mailboxCode = safeText(payload.mailboxCode || "-", 12).toUpperCase();
  const screwType = safeText(payload.screwType || "-", 20).toUpperCase();
  const screwFont = screwType.length <= 1 ? 50 : screwType.length <= 4 ? 36 : screwType.length <= 8 ? 26 : 18;
  const lotNumber = safeText(payload.lotNumber || "-", 26).toUpperCase();
  const lotSuffix = String(lotNumber || "").slice(-3) || "-";
  const labName = safeText(payload.labName || "-", 20);
  const { pw, ll } = resolvePackZplSize(payload);
  return [
    "^XA",
    `^PW${pw || 1890}`,
    `^LL${ll || 1535}`,
    "^LH0,0",
    "^CI28",
    `^FO100,100^A0N,50,50^FD${mailboxCode}^FS`,
    `^FO100,200^A0N,${screwFont},${screwFont}^FD${screwType}^FS`,
    `^FO100,300^A0N,50,50^FD${lotSuffix}^FS`,
    `^FO100,400^A0N,40,40^FD${labName}^FS`,
    `^FO100,500^A0N,30,30^FDLot: ${lotNumber}^FS`,
    "^XZ",
  ].join("\n");
}

function dryRunDir() {
  return process.env.LOT_PRINT_DRY_RUN_DIR || path.join(ROOT, "data", "print-dry-run");
}

async function writePayloadFile(ext, data) {
  const dir = printDryRun() ? dryRunDir() : os.tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `abuts-pack-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`);
  await fs.promises.writeFile(file, data);
  return file;
}

const toPsSingleQuoted = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;

function windowsRawPrintScript(printer, filePath, title) {
  return [
    `$printerName = ${toPsSingleQuoted(printer)}`,
    `$filePath = ${toPsSingleQuoted(filePath)}`,
    `$jobTitle = ${toPsSingleQuoted(String(title || "Pack Label"))}`,
    'Add-Type -TypeDefinition @"',
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class RawPrinterHelper {",
    "  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]",
    "  public class DOCINFOA {",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;",
    "  }",
    '  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]',
    "  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);",
    '  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]',
    "  public static extern bool ClosePrinter(IntPtr hPrinter);",
    '  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]',
    "  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);",
    '  [DllImport("winspool.drv", SetLastError=true)]',
    "  public static extern bool EndDocPrinter(IntPtr hPrinter);",
    '  [DllImport("winspool.drv", SetLastError=true)]',
    "  public static extern bool StartPagePrinter(IntPtr hPrinter);",
    '  [DllImport("winspool.drv", SetLastError=true)]',
    "  public static extern bool EndPagePrinter(IntPtr hPrinter);",
    '  [DllImport("winspool.drv", SetLastError=true)]',
    "  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);",
    "}",
    '"@',
    "$bytes = [System.IO.File]::ReadAllBytes($filePath)",
    "$docInfo = New-Object RawPrinterHelper+DOCINFOA",
    "$docInfo.pDocName = $jobTitle",
    '$docInfo.pDataType = "RAW"',
    "$handle = [IntPtr]::Zero",
    "$opened = [RawPrinterHelper]::OpenPrinter($printerName, [ref]$handle, [IntPtr]::Zero)",
    'if (-not $opened) { throw "OpenPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }',
    "$ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)",
    "try {",
    "  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)",
    '  if (-not [RawPrinterHelper]::StartDocPrinter($handle, 1, $docInfo)) { throw "StartDocPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }',
    "  try {",
    '    if (-not [RawPrinterHelper]::StartPagePrinter($handle)) { throw "StartPagePrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }',
    "    try {",
    "      $written = 0",
    '      if (-not [RawPrinterHelper]::WritePrinter($handle, $ptr, $bytes.Length, [ref]$written)) { throw "WritePrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }',
    '      if ($written -ne $bytes.Length) { throw "Incomplete RAW write: $written / $($bytes.Length)" }',
    "    } finally { [void][RawPrinterHelper]::EndPagePrinter($handle) }",
    "  } finally { [void][RawPrinterHelper]::EndDocPrinter($handle) }",
    "} finally {",
    "  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr) }",
    "  if ($handle -ne [IntPtr]::Zero) { [void][RawPrinterHelper]::ClosePrinter($handle) }",
    "}",
  ].join("\r\n");
}

function execPrint(filePath, printer, title, copies, paperProfile, log) {
  return new Promise((resolve, reject) => {
    if (isWindows) {
      const script = windowsRawPrintScript(printer, filePath, title);
      execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true, timeout: 30000 },
        (err, stdout, stderr) => {
          if (err) {
            log?.("printRawZpl:error", { printer, error: stderr || err.message });
            return reject(new Error(stderr || err.message || String(err)));
          }
          log?.("printRawZpl:success", { printer });
          resolve(stdout);
        },
      );
      return;
    }
    const args = ["-o", "raw"];
    if (printer) args.push("-d", printer);
    if (title) args.push("-t", title);
    const media = typeof paperProfile === "string" ? paperProfile.trim() : "";
    if (media) args.push("-o", `media=${media}`);
    if (Number.isFinite(copies) && copies > 1) args.push("-n", String(Math.floor(copies)));
    args.push(filePath);
    execFile("lp", args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        log?.("printRawZpl:error", { printer, error: stderr || err.message });
        return reject(new Error(stderr || err.message || String(err)));
      }
      log?.("printRawZpl:success", { printer });
      resolve(stdout);
    });
  });
}

/**
 * ZPL 또는 RAW 버퍼를 프린터로 보낸다. dry-run이면 파일만 남긴다.
 * @returns {Promise<{ success: true, dryRun?: boolean, file?: string, printer: string, copies: number }>}
 */
export async function printRaw({ zpl, rawBuffer, printer, title = "Packing Label", copies = 1, paperProfile = "", log } = {}) {
  const target = String(printer || "").trim();
  if (!target && !printDryRun()) throw new Error("Printer is required");
  const n = Number.isFinite(copies) && copies > 0 ? Math.floor(copies) : 1;
  const data = rawBuffer && rawBuffer.length ? rawBuffer : Buffer.from(String(zpl || ""), "utf8");
  if (!data.length) throw new Error("zpl 또는 rawBase64 필드가 필요합니다.");
  const ext = rawBuffer && rawBuffer.length ? "bin" : "zpl";
  const filePath = await writePayloadFile(ext, data);
  if (printDryRun()) {
    log?.("printRawZpl:dry-run", { printer: target || "(none)", filePath, copies: n });
    return { success: true, dryRun: true, file: filePath, printer: target || "", copies: n };
  }
  const times = isWindows ? n : 1;
  try {
    for (let i = 0; i < times; i += 1) {
      await execPrint(filePath, target, title, n, paperProfile, log);
    }
  } finally {
    fs.unlink(filePath, () => undefined);
  }
  return { success: true, printer: target, copies: n };
}

function normalizeIp(ip) {
  let v = String(ip || "").trim();
  if (v.startsWith("::ffff:")) v = v.slice(7);
  if (v === "::1") return "127.0.0.1";
  return v;
}

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return normalizeIp(xf || req.socket?.remoteAddress || "");
}

function json(res, status, body, origin = "*") {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-pack-secret",
  });
  res.end(JSON.stringify(body));
}

function isNativePackPath(pathname) {
  return PACK_PATHS.has(pathname);
}

/**
 * pack-server와 같은 HTTP 경로를 처리한다. 처리했으면 true.
 * /api/* 는 작업 화면용(비밀 헤더 없음). /printers 등 원래 경로는 비밀·IP 규칙을 따른다.
 */
export async function handlePackRequest(req, res, url, { log = () => {} } = {}) {
  const pathname = url.pathname;
  if (!isPackPath(pathname)) return false;
  const origin = process.env.PACK_PRINT_SERVER_ORIGIN || "*";
  const native = isNativePackPath(pathname);
  const route = pathname.replace(/^\/api/, "") === "/pack/health" ? "/health" : pathname.replace(/^\/api/, "") || pathname;

  if (req.method === "OPTIONS") {
    json(res, 204, { success: true }, origin);
    return true;
  }

  if (native) {
    const allowed = allowIps();
    if (allowed.length && !allowed.includes("*") && !allowed.includes(clientIp(req))) {
      json(res, 403, { success: false, message: "Forbidden (IP not allowed)" }, origin);
      return true;
    }
    const secret = packSecret();
    if (secret && route !== "/health" && pathname !== "/pack/health") {
      const incoming = String(req.headers["x-pack-secret"] || "").trim();
      if (incoming !== secret) {
        json(res, 401, { success: false, message: "Unauthorized" }, origin);
        return true;
      }
    }
  }

  try {
    if (pathname === "/pack/health" || (pathname === "/health" && false)) {
      json(res, 200, { success: true, status: "ok", embed: true, dryRun: printDryRun() }, origin);
      return true;
    }
    if (pathname === "/pack/health") {
      json(res, 200, { success: true, status: "ok", embed: true, dryRun: printDryRun() }, origin);
      return true;
    }
    if (route === "/branding" && req.method === "GET") {
      json(res, 200, { success: true, branding: brandingFromEnv() }, origin);
      return true;
    }
    if (route === "/printers" && req.method === "GET") {
      const printers = await listPrinters().catch(() => []);
      json(res, 200, { success: true, printers, defaultPrinter: defaultPrinter() || null, embed: true, dryRun: printDryRun() }, origin);
      return true;
    }
    if ((route === "/print-zpl" || route === "/print-packing-label") && req.method === "POST") {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      let zpl = String(payload.zpl || "").trim();
      const rawBase64 = String(payload.rawBase64 || "").replace(/\s/g, "");
      if (route === "/print-packing-label" && !zpl && !rawBase64) zpl = buildPackingLabelZpl(payload);
      const printer = await resolvePrinter({ requestedPrinter: payload.printer, printerQuery: payload.printerQuery });
      if (!zpl && !rawBase64) {
        json(res, 400, { success: false, message: "zpl 또는 rawBase64 필드가 필요합니다." }, origin);
        return true;
      }
      if (!printer && !printDryRun()) {
        json(res, 400, { success: false, message: payload.printerQuery ? `${payload.printerQuery} 프린터를 찾지 못했습니다.` : "사용 가능한 프린터가 없습니다." }, origin);
        return true;
      }
      const rawBuffer = rawBase64 ? Buffer.from(rawBase64, "base64") : null;
      const copiesRaw = Number(payload.copies);
      const result = await printRaw({
        zpl,
        rawBuffer: rawBuffer && rawBuffer.length ? rawBuffer : null,
        printer,
        title: String(payload.title || (route === "/print-packing-label" ? "Custom Abutment Packing" : "Packing Label")).trim(),
        copies: Number.isFinite(copiesRaw) && copiesRaw > 0 ? copiesRaw : 1,
        paperProfile: typeof payload.paperProfile === "string" ? payload.paperProfile.trim() : "",
        log,
      });
      json(res, 200, {
        success: true,
        ...result,
        generated:
          route === "/print-packing-label"
            ? { requestId: safeText(payload.requestId, 40), lotNumber: safeText(payload.lotNumber, 20).toUpperCase() }
            : undefined,
      }, origin);
      return true;
    }
    return false;
  } catch (error) {
    log(`pack error ${error.message}`);
    json(res, 500, { success: false, message: error.message }, origin);
    return true;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

export function packStatus() {
  return {
    embed: packEmbedEnabled(),
    dryRun: printDryRun(),
    defaultPrinter: defaultPrinter() || null,
    hasSecret: Boolean(packSecret()),
  };
}

// http is imported only so tests can construct IncomingMessage-like objects if needed.
void http;
