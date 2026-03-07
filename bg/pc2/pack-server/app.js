const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), "local.env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    if (typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const PORT = Number(process.env.PACK_PRINT_SERVER_PORT || 5788);
const ALLOW_ORIGIN = process.env.PACK_PRINT_SERVER_ORIGIN || "*";
const DEFAULT_PRINTER = process.env.PACK_PRINT_SERVER_DEFAULT_PRINTER || "";
const SHARED_SECRET = String(
  process.env.PACK_PRINT_SERVER_SHARED_SECRET || "",
).trim();
const ALLOW_IPS = String(
  process.env.ALLOW_IPS || process.env.PACK_ALLOW_IPS || "",
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const LOG_FILE = path.resolve(__dirname, "logs.txt");
const logStream = fs.createWriteStream(LOG_FILE, { flags: "w" });
logStream.on("error", (err) => {
  console.error("[pack-server] log stream error", err);
});

const log = (message, meta) => {
  const stamp = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `[pack-server] ${stamp} ${message}${suffix}`;
  console.log(line);
  if (logStream.writable) {
    logStream.write(`${line}\n`, (err) => {
      if (err) {
        console.error("[pack-server] failed to write log line", err);
      }
    });
  }
};

const jsonResponse = (res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-pack-secret",
  });
  res.end(payload);
};

const normalizeIp = (ip) => {
  let v = String(ip || "").trim();
  if (!v) return "";
  if (v.startsWith("::ffff:")) v = v.slice(7);
  if (v === "::1") return "127.0.0.1";
  return v;
};

const getClientIp = (req) => {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const raw = xf || req.socket?.remoteAddress || "";
  return normalizeIp(raw);
};

const isIpAllowed = (req) => {
  if (!ALLOW_IPS.length || ALLOW_IPS.includes("*")) return true;
  const ip = getClientIp(req);
  return ALLOW_IPS.includes(ip);
};

const requireIpAllowed = (req, res) => {
  if (isIpAllowed(req)) return true;
  log("blocked:ip", { ip: getClientIp(req) });
  jsonResponse(res, 403, {
    success: false,
    message: "Forbidden (IP not allowed)",
  });
  return false;
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
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

const isWindows = process.platform === "win32";

const listPrinters = () =>
  new Promise((resolve, reject) => {
    if (isWindows) {
      const psScript = [
        "if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {",
        "  Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name",
        "} elseif (Get-Command Get-WmiObject -ErrorAction SilentlyContinue) {",
        "  Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name",
        "} else {",
        '  throw \"No printer query cmdlets available\"',
        "}",
      ].join("; ");

      const psArgs = ["-NoProfile", "-Command", psScript];

      execFile(
        "powershell.exe",
        psArgs,
        { windowsHide: true },
        (err, stdout) => {
          if (err) return reject(err);
          const printers = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          return resolve(printers);
        },
      );
      return;
    }

    execFile("lpstat", ["-p"], (err, stdout) => {
      if (err) return reject(err);
      const printers = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/\s+/).filter(Boolean);
          if (!parts.length) return "";
          if (parts[0] === "printer" && parts[1]) return parts[1];
          return parts[0];
        })
        .filter(Boolean);
      resolve(printers);
    });
  });

const resolvePrinter = async ({ requestedPrinter }) => {
  const direct = String(requestedPrinter || "").trim();
  if (direct) return direct;

  const fallback = String(DEFAULT_PRINTER || "").trim();
  if (fallback) return fallback;

  const printers = await listPrinters().catch(() => []);
  if (Array.isArray(printers) && printers.length > 0) {
    return printers[0];
  }

  return "";
};

const safeText = (value, maxLen = 36) => {
  const s = String(value || "")
    .replace(/[\^~\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const mmToDots = (mm, dpi) => {
  const mmNum = Number(mm);
  const dpiNum = Number(dpi);
  if (!Number.isFinite(mmNum) || !Number.isFinite(dpiNum) || dpiNum <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((mmNum / 25.4) * dpiNum));
};

const resolvePackZplSize = (payload) => {
  const zplPW = Number(payload?.zplPW);
  const zplLL = Number(payload?.zplLL);
  if (
    Number.isFinite(zplPW) &&
    zplPW > 0 &&
    Number.isFinite(zplLL) &&
    zplLL > 0
  ) {
    return { pw: Math.floor(zplPW), ll: Math.floor(zplLL) };
  }

  const paperProfile = String(payload?.paperProfile || "").trim();
  const dpi = Number(payload?.dpi) || 203;
  if (paperProfile === "PACK_80x65") {
    // portrait layout (65 x 80mm)
    return { pw: mmToDots(65, dpi), ll: mmToDots(80, dpi) };
  }

  return { pw: 812, ll: 520 };
};

const buildPackingLabelZpl = (payload) => {
  const mailboxCode = safeText(payload.mailboxCode || "-", 12).toUpperCase();
  const screwType = safeText(payload.screwType || "-", 4).toUpperCase();
  const clinicName = safeText(payload.clinicName || "-", 28);
  const requestDateRaw = safeText(payload.requestDate || "-", 32);
  const requestDate = safeText(
    String(requestDateRaw).includes("T")
      ? String(requestDateRaw).split("T")[0]
      : requestDateRaw,
    10,
  );
  const patientName = safeText(payload.patientName || "-", 24);
  const toothNumber = safeText(payload.toothNumber || "-", 10);
  const implantManufacturer = safeText(payload.implantManufacturer || "-", 20);
  const implantSystem = safeText(payload.implantSystem || "-", 22);
  const implantType = safeText(payload.implantType || "-", 18);
  const labName = safeText(payload.labName || "-", 20);
  const lotNumber = safeText(payload.lotNumber || "-", 26).toUpperCase();
  const manufacturingDateRaw = safeText(payload.manufacturingDate || "-", 32);
  const manufacturingDate = safeText(
    String(manufacturingDateRaw).includes("T")
      ? String(manufacturingDateRaw).split("T")[0]
      : manufacturingDateRaw,
    10,
  );

  const { pw, ll } = resolvePackZplSize(payload);
  const dpi = Number(payload?.dpi) || 203;
  const scale = dpi / 203;
  const S = (n) => Math.round(Number(n) * scale);
  const F = (n) => Math.max(1, Math.round(Number(n) * scale));
  const T = Math.max(1, Math.round(2 * scale));
  const qrMag = (base) =>
    Math.min(10, Math.max(1, Math.round(Number(base) * scale)));

  const PRODUCT_NAME = "임플란트 상부구조물";
  const MODEL_NAME = "CA6512";
  const LICENSE_NO = "제3583호";
  const COMPANY_NAME = "(주)애크로덴트";
  const COMPANY_ADDR = "경남 김해시 전하로85번길 5(나동, 흥동)";
  const COMPANY_TEL_FAX = "T 055-314-4607  F 055-901-0241";
  const ABUTS_COMPANY_NAME = "어벗츠 주식회사";
  const ABUTS_SALES_PERMIT = "판매업허가 제####호";
  const ABUTS_ADDR = "경상남도 거제시 거제중앙로29길 6, 3층(고현동)";
  const ABUTS_TEL = "T 1588-3948";
  const ABUTS_WEB = "https://abuts.fit";

  const qrProductData = safeText(
    JSON.stringify({ lotNumber, manufacturingDate }),
    120,
  );
  const qrLotData = safeText(
    JSON.stringify({ lotNumber, manufacturingDate }),
    180,
  );
  const lotSuffix = String(lotNumber || "").slice(-3) || "-";
  const qrAbutsData = safeText(
    JSON.stringify({ company: ABUTS_COMPANY_NAME, web: ABUTS_WEB }),
    180,
  );

  // Layout target: 65x80mm portrait (approx 520x640 dots @203dpi)
  // Margin: 42 dots left/right (2x)
  // Content width: 436 dots (520 - 84)
  // Re-centered vertically after final font scaling
  return [
    "^XA",
    `^PW${pw || 520}`,
    `^LL${ll || 640}`,
    "^LH0,0",
    "^CI28",

    // ===== PRIORITY 1: Top header (mailbox / screw / lot suffix) =====
    `^FO${S(42)},${S(52)}^GB${S(436)},${S(58)},${T}^FS`,
    `^FO${S(236)},${S(52)}^GB${T},${S(58)},${T}^FS`,
    `^FO${S(333)},${S(52)}^GB${T},${S(58)},${T}^FS`,
    `^FO${S(42)},${S(56)}^A0N,${F(58)},${F(58)}^FB${S(194)},1,0,C,0^FD${mailboxCode}^FS`,
    `^FO${S(236)},${S(56)}^A0N,${F(58)},${F(58)}^FB${S(97)},1,0,C,0^FD${screwType}^FS`,
    `^FO${S(333)},${S(56)}^A0N,${F(58)},${F(58)}^FB${S(145)},1,0,C,0^FD${lotSuffix}^FS`,

    // ===== PRIORITY 1.5: Lab name (box height matches header) =====
    `^FO${S(42)},${S(114)}^GB${S(436)},${S(58)},${T}^FS`,
    `^FO${S(42)},${S(114)}^A0B,${F(40)},${F(40)}^FB${S(436)},1,0,C,0^FD${labName}^FS`,

    // ===== PRIORITY 2: Middle section (clinic, dates, implant, lot) =====
    // Row 1: Clinic / Patient / Tooth - 20% increase: 18pt -> 22pt
    `^FO${S(42)},${S(182)}^GB${S(436)},${S(32)},${T}^FS`,
    `^FO${S(42)},${S(191)}^A0N,${F(22)},${F(22)}^FB${S(436)},1,0,C,0^FD${clinicName} / ${patientName} / #${toothNumber}^FS`,

    // Row 2: Request date / Manufacturing date
    `^FO${S(42)},${S(218)}^GB${S(436)},${S(32)},${T}^FS`,
    `^FO${S(42)},${S(227)}^A0N,${F(22)},${F(22)}^FB${S(436)},1,0,C,0^FD의뢰일: ${requestDate} / 제조일: ${manufacturingDate}^FS`,

    // Row 3: Implant info
    `^FO${S(42)},${S(254)}^GB${S(436)},${S(32)},${T}^FS`,
    `^FO${S(42)},${S(263)}^A0N,${F(22)},${F(22)}^FB${S(436)},1,0,C,0^FD${implantManufacturer} / ${implantSystem} / ${implantType}^FS`,

    // Row 4: Lot number
    `^FO${S(42)},${S(290)}^GB${S(436)},${S(32)},${T}^FS`,
    `^FO${S(42)},${S(299)}^A0N,${F(22)},${F(22)}^FB${S(436)},1,0,C,0^FD제조번호: ${lotNumber}^FS`,

    // ===== PRIORITY 3: Product details + QR1 section =====
    // Left: details grid (same sizing as before)
    `^FO${S(42)},${S(326)}^GB${S(320)},${S(88)},${T}^FS`,
    // Right: QR1 box
    `^FO${S(362)},${S(326)}^GB${S(116)},${S(88)},${T}^FS`,
    // Left grid dividers
    `^FO${S(202)},${S(326)}^GB${T},${S(88)},${T}^FS`,
    `^FO${S(42)},${S(348)}^GB${S(320)},${T},${T}^FS`,
    `^FO${S(42)},${S(370)}^GB${S(320)},${T},${T}^FS`,
    `^FO${S(42)},${S(392)}^GB${S(320)},${T},${T}^FS`,

    // Left grid text
    `^FO${S(50)},${S(332)}^A0N,${F(13)},${F(13)}^FD품명: ${PRODUCT_NAME}^FS`,
    `^FO${S(210)},${S(332)}^A0N,${F(13)},${F(13)}^FD비멸균 의료기기^FS`,
    `^FO${S(50)},${S(354)}^A0N,${F(13)},${F(13)}^FD모델명: ${MODEL_NAME}^FS`,
    `^FO${S(50)},${S(376)}^A0N,${F(13)},${F(13)}^FD사용기한: 해당없음^FS`,
    `^FO${S(50)},${S(398)}^A0N,${F(13)},${F(13)}^FD포장단위: 1 SET^FS`,
    `^FO${S(210)},${S(354)}^A0N,${F(13)},${F(13)}^FD품목허가: ${LICENSE_NO}^FS`,
    `^FO${S(210)},${S(376)}^A0N,${F(13)},${F(13)}^FD사용방법: 사용자 매뉴얼^FS`,
    `^FO${S(210)},${S(398)}^A0N,${F(13)},${F(13)}^FD주의사항: 매뉴얼 참조^FS`,

    // QR1 placed in right box
    `^FO${S(380)},${S(330)}^BQN,2,${qrMag(3)}`,
    `^FDLA,${qrProductData || "-"}^FS`,

    // ===== PRIORITY 3: Bottom manufacturer info + QR codes =====
    // Acrodent box - 20% increase: 13pt -> 16pt, 10pt -> 12pt
    `^FO${S(42)},${S(424)}^GB${S(436)},${S(76)},${T}^FS`,
    `^FO${S(50)},${S(432)}^A0N,${F(16)},${F(16)}^FD${COMPANY_NAME}^FS`,
    `^FO${S(370)},${S(434)}^BQN,2,${qrMag(2)}`,
    `^FDLA,${qrLotData || "-"}^FS`,
    `^FO${S(50)},${S(452)}^A0N,${F(12)},${F(12)}^FD제조업허가: ${LICENSE_NO}^FS`,
    `^FO${S(50)},${S(466)}^A0N,${F(12)},${F(12)}^FD${COMPANY_ADDR}^FS`,
    `^FO${S(50)},${S(480)}^A0N,${F(12)},${F(12)}^FD${COMPANY_TEL_FAX}^FS`,

    // Abuts box
    `^FO${S(42)},${S(504)}^GB${S(436)},${S(76)},${T}^FS`,
    `^FO${S(50)},${S(512)}^A0N,${F(16)},${F(16)}^FD${ABUTS_COMPANY_NAME}^FS`,
    `^FO${S(370)},${S(514)}^BQN,2,${qrMag(2)}`,
    `^FDLA,${qrAbutsData || "-"}^FS`,
    `^FO${S(50)},${S(532)}^A0N,${F(12)},${F(12)}^FD${ABUTS_SALES_PERMIT}^FS`,
    `^FO${S(50)},${S(546)}^A0N,${F(12)},${F(12)}^FD${ABUTS_ADDR}^FS`,
    `^FO${S(50)},${S(560)}^A0N,${F(12)},${F(12)}^FD${ABUTS_TEL} / ${ABUTS_WEB}^FS`,

    "^XZ",
  ].join("\n");
};

const writeZplToTemp = async (zpl) => {
  const tempPath = path.join(
    os.tmpdir(),
    `abuts-pack-${Date.now()}-${Math.random().toString(16).slice(2)}.zpl`,
  );
  await fs.promises.writeFile(tempPath, zpl, "utf8");
  return tempPath;
};

const toPsSingleQuoted = (value) => {
  const raw = String(value ?? "");
  return `'${raw.replace(/'/g, "''")}'`;
};

const printRawZpl = ({ filePath, printer, title, copies, paperProfile }) =>
  new Promise((resolve, reject) => {
    if (isWindows) {
      const targetPrinter = String(printer || DEFAULT_PRINTER || "").trim();
      if (!targetPrinter) {
        return reject(new Error("Printer is required"));
      }

      const escapedPrinter = toPsSingleQuoted(targetPrinter);
      const escapedFilePath = toPsSingleQuoted(filePath);
      const escapedJobTitle = toPsSingleQuoted(String(title || "Pack Label"));

      const psScript = [
        `$printerName = ${escapedPrinter}`,
        `$filePath = ${escapedFilePath}`,
        `$jobTitle = ${escapedJobTitle}`,
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
        "    } finally {",
        "      [void][RawPrinterHelper]::EndPagePrinter($handle)",
        "    }",
        "  } finally {",
        "    [void][RawPrinterHelper]::EndDocPrinter($handle)",
        "  }",
        "} finally {",
        "  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr) }",
        "  if ($handle -ne [IntPtr]::Zero) { [void][RawPrinterHelper]::ClosePrinter($handle) }",
        "}",
        "if (-not [RawPrinterHelper]::ClosePrinter($handle)) { }",
      ].join("\r\n");

      const psArgs = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        psScript,
      ];

      log("printRawZpl", {
        command: "powershell.exe",
        printer: targetPrinter,
        paperProfile,
        filePath,
      });

      execFile(
        "powershell.exe",
        psArgs,
        { windowsHide: true },
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
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
    if (Number.isFinite(copies) && copies > 1) {
      args.push("-n", String(Math.floor(copies)));
    }
    args.push(filePath);

    log("printRawZpl", {
      command: "lp",
      printer,
      paperProfile,
      filePath,
    });

    execFile("lp", args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });

const requireSecret = (req, res) => {
  if (!SHARED_SECRET) return true;
  if (req.url === "/health") return true;

  const incoming = String(req.headers["x-pack-secret"] || "").trim();
  if (!incoming || incoming !== SHARED_SECRET) {
    jsonResponse(res, 401, {
      success: false,
      message: "Unauthorized",
    });
    return false;
  }
  return true;
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    return jsonResponse(res, 400, { success: false, message: "Invalid URL" });
  }

  if (req.method === "OPTIONS") {
    return jsonResponse(res, 204, { success: true });
  }

  if (!requireIpAllowed(req, res)) return;

  if (!requireSecret(req, res)) return;

  log("request", { method: req.method, url: req.url });

  if (req.url === "/health" && req.method === "GET") {
    return jsonResponse(res, 200, {
      success: true,
      status: "ok",
      defaultPrinter: DEFAULT_PRINTER || null,
    });
  }

  if (req.url === "/printers" && req.method === "GET") {
    try {
      const printers = await listPrinters();
      return jsonResponse(res, 200, {
        success: true,
        printers,
        defaultPrinter: DEFAULT_PRINTER || null,
      });
    } catch (error) {
      log("printers:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  if (req.url === "/print-zpl" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const zpl = String(payload.zpl || "").trim();
      const printer = await resolvePrinter({
        requestedPrinter: payload.printer,
      });
      const title = String(payload.title || "Packing Label").trim();
      const copiesRaw = Number(payload.copies);
      const copies =
        Number.isFinite(copiesRaw) && copiesRaw > 0 ? copiesRaw : 1;
      const paperProfile =
        typeof payload.paperProfile === "string"
          ? payload.paperProfile.trim()
          : "";

      if (!zpl) {
        return jsonResponse(res, 400, {
          success: false,
          message: "zpl 필드가 필요합니다.",
        });
      }

      if (!printer) {
        return jsonResponse(res, 400, {
          success: false,
          message:
            "사용 가능한 프린터가 없습니다. 프린터를 OS(CUPS)에 등록하거나 printer 값을 지정해주세요.",
        });
      }

      const tempPath = await writeZplToTemp(zpl);
      try {
        await printRawZpl({
          filePath: tempPath,
          printer,
          title,
          copies,
          paperProfile,
        });
      } finally {
        fs.unlink(tempPath, () => undefined);
      }

      return jsonResponse(res, 200, { success: true });
    } catch (error) {
      log("print-zpl:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  if (req.url === "/print-packing-label" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};

      const printer = await resolvePrinter({
        requestedPrinter: payload.printer,
      });
      const title = String(payload.title || "Custom Abutment Packing").trim();
      const copiesRaw = Number(payload.copies);
      const copies =
        Number.isFinite(copiesRaw) && copiesRaw > 0 ? copiesRaw : 1;
      const paperProfile =
        typeof payload.paperProfile === "string"
          ? payload.paperProfile.trim()
          : "";
      const zpl = buildPackingLabelZpl(payload);

      if (!printer) {
        return jsonResponse(res, 400, {
          success: false,
          message:
            "사용 가능한 프린터가 없습니다. 프린터를 OS(CUPS)에 등록하거나 printer 값을 지정해주세요.",
        });
      }

      const tempPath = await writeZplToTemp(zpl);
      try {
        await printRawZpl({
          filePath: tempPath,
          printer,
          title,
          copies,
          paperProfile,
        });
      } finally {
        fs.unlink(tempPath, () => undefined);
      }

      return jsonResponse(res, 200, {
        success: true,
        generated: {
          requestId: safeText(payload.requestId, 40),
          lotNumber: safeText(payload.lotNumber, 20).toUpperCase(),
        },
      });
    } catch (error) {
      log("print-packing-label:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  return jsonResponse(res, 404, { success: false, message: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`Pack print server running on http://localhost:${PORT}`);
});
