const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const fetch = require("node-fetch");
const sharp = require("sharp");

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
    process.env[key] = value;
  }
}

loadLocalEnv();

const PORT = Number(process.env.PACK_PRINT_SERVER_PORT || 8004);
const ALLOW_ORIGIN = process.env.PACK_PRINT_SERVER_ORIGIN || "*";
const DEFAULT_PRINTER = process.env.PACK_PRINT_SERVER_DEFAULT_PRINTER || "";
const SHARED_SECRET = String(
  process.env.PACK_PRINT_SERVER_SHARED_SECRET || "",
).trim();
const PACK_LABEL_DPI = Number(process.env.PACK_LABEL_DPI || 600);
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
  const clientIp = getClientIp(req);
  const xForwardedFor = req.headers["x-forwarded-for"] || "";
  const remoteAddress = req.socket?.remoteAddress || "";
  log("blocked:ip", {
    clientIp,
    xForwardedFor,
    remoteAddress,
    allowedIps: ALLOW_IPS,
    method: req.method,
    path: req.url,
  });
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
  if (paperProfile === "PACK_65x80") {
    // landscape layout (80 x 65mm)
    return { pw: mmToDots(80, dpi), ll: mmToDots(65, dpi) };
  }

  return { pw: 640, ll: 520 };
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
  const dpi = Number(payload?.dpi) || PACK_LABEL_DPI;
  // PACK_LABEL_DPI 기준으로 모든 좌표 계산
  // 80x65mm @ 600DPI = 1890x1535 dots
  // 80x65mm @ 203DPI = 640x520 dots
  const scale = dpi / PACK_LABEL_DPI;
  const S = (n) => Math.round(Number(n) * scale);
  const F = (n) => Math.max(1, Math.round(Number(n) * scale));
  const T = Math.max(1, Math.round(6 * scale));
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

  // Layout target: 80x65mm landscape @ 600DPI (가로 모드)
  // 80mm = 1890 dots, 65mm = 1535 dots @ 600DPI
  // 이미지 회전 후 가로 긴 형태로 표시됨
  return [
    "^XA",
    `^PW${pw || 1890}`,
    `^LL${ll || 1535}`,
    "^LH0,0",
    "^CI28",

    // ===== TOP SECTION: Header with key info (mailbox, screw, lot) =====
    // Top border
    `^FO${S(90)},${S(90)}^GB${S(1710)},${S(130)},${T}^FS`,
    // Vertical dividers
    `^FO${S(660)},${S(90)}^GB${T},${S(130)},${T}^FS`,
    `^FO${S(1230)},${S(90)}^GB${T},${S(130)},${T}^FS`,
    // Header text (3 columns)
    `^FO${S(100)},${S(100)}^A0N,${F(100)},${F(100)}^FB${S(550)},1,0,C,0^FD${mailboxCode}^FS`,
    `^FO${S(670)},${S(100)}^A0N,${F(100)},${F(100)}^FB${S(550)},1,0,C,0^FD${screwType}^FS`,
    `^FO${S(1240)},${S(100)}^A0N,${F(100)},${F(100)}^FB${S(550)},1,0,C,0^FD${lotSuffix}^FS`,

    // ===== SECTION 2: Lab name (full width) =====
    `^FO${S(90)},${S(230)}^GB${S(1710)},${S(100)},${T}^FS`,
    `^FO${S(100)},${S(245)}^A0N,${F(70)},${F(70)}^FB${S(1690)},1,0,C,0^FD${labName}^FS`,

    // ===== SECTION 3: Clinic / Patient / Tooth =====
    `^FO${S(90)},${S(340)}^GB${S(1710)},${S(90)},${T}^FS`,
    `^FO${S(100)},${S(352)}^A0N,${F(50)},${F(50)}^FB${S(1690)},1,0,C,0^FD${clinicName} / ${patientName} / #${toothNumber}^FS`,

    // ===== SECTION 4: Dates (2 columns) =====
    `^FO${S(90)},${S(440)}^GB${S(1710)},${S(85)},${T}^FS`,
    `^FO${S(660)},${S(440)}^GB${T},${S(85)},${T}^FS`,
    `^FO${S(100)},${S(450)}^A0N,${F(45)},${F(45)}^FB${S(550)},1,0,C,0^FD의뢰: ${requestDate}^FS`,
    `^FO${S(670)},${S(450)}^A0N,${F(45)},${F(45)}^FB${S(1030)},1,0,C,0^FD제조: ${manufacturingDate}^FS`,

    // ===== SECTION 5: Implant info (2 columns) =====
    `^FO${S(90)},${S(535)}^GB${S(1710)},${S(85)},${T}^FS`,
    `^FO${S(660)},${S(535)}^GB${T},${S(85)},${T}^FS`,
    `^FO${S(100)},${S(545)}^A0N,${F(40)},${F(40)}^FB${S(550)},1,0,C,0^FD${implantManufacturer}^FS`,
    `^FO${S(670)},${S(545)}^A0N,${F(40)},${F(40)}^FB${S(1030)},1,0,C,0^FD${implantSystem} / ${implantType}^FS`,

    // ===== SECTION 6: Lot number =====
    `^FO${S(90)},${S(630)}^GB${S(1710)},${S(80)},${T}^FS`,
    `^FO${S(100)},${S(640)}^A0N,${F(45)},${F(45)}^FB${S(1690)},1,0,C,0^FD제조번호: ${lotNumber}^FS`,

    // ===== SECTION 7: Product details (left) + QR (right) =====
    `^FO${S(90)},${S(720)}^GB${S(1350)},${S(200)},${T}^FS`,
    `^FO${S(1450)},${S(720)}^GB${S(350)},${S(200)},${T}^FS`,
    // Product grid dividers
    `^FO${S(90)},${S(770)}^GB${S(1350)},${T},${T}^FS`,
    `^FO${S(90)},${S(820)}^GB${S(1350)},${T},${T}^FS`,
    `^FO${S(725)},${S(720)}^GB${T},${S(200)},${T}^FS`,
    // Product details text
    `^FO${S(100)},${S(730)}^A0N,${F(32)},${F(32)}^FD품명: ${PRODUCT_NAME}^FS`,
    `^FO${S(740)},${S(730)}^A0N,${F(32)},${F(32)}^FD비멸균 의료기기^FS`,
    `^FO${S(100)},${S(780)}^A0N,${F(32)},${F(32)}^FD모델: ${MODEL_NAME}^FS`,
    `^FO${S(740)},${S(780)}^A0N,${F(32)},${F(32)}^FD허가: ${LICENSE_NO}^FS`,
    `^FO${S(100)},${S(830)}^A0N,${F(32)},${F(32)}^FD사용기한: 해당없음^FS`,
    `^FO${S(740)},${S(830)}^A0N,${F(32)},${F(32)}^FD포장단위: 1 SET^FS`,
    // QR code
    `^FO${S(1510)},${S(740)}^BQN,2,${qrMag(7)}`,
    `^FDLA,${qrProductData || "-"}^FS`,

    // ===== SECTION 8: Manufacturer info (Acrodent) =====
    `^FO${S(90)},${S(930)}^GB${S(1350)},${S(170)},${T}^FS`,
    `^FO${S(1450)},${S(930)}^GB${S(350)},${S(170)},${T}^FS`,
    `^FO${S(100)},${S(940)}^A0N,${F(35)},${F(35)}^FD${COMPANY_NAME}^FS`,
    `^FO${S(100)},${S(980)}^A0N,${F(28)},${F(28)}^FD제조업허가: ${LICENSE_NO}^FS`,
    `^FO${S(100)},${S(1015)}^A0N,${F(28)},${F(28)}^FD${COMPANY_ADDR}^FS`,
    `^FO${S(100)},${S(1050)}^A0N,${F(28)},${F(28)}^FD${COMPANY_TEL_FAX}^FS`,
    `^FO${S(1510)},${S(950)}^BQN,2,${qrMag(6)}`,
    `^FDLA,${qrLotData || "-"}^FS`,

    // ===== SECTION 9: Abuts info =====
    `^FO${S(90)},${S(1110)}^GB${S(1350)},${S(170)},${T}^FS`,
    `^FO${S(1450)},${S(1110)}^GB${S(350)},${S(170)},${T}^FS`,
    `^FO${S(100)},${S(1120)}^A0N,${F(35)},${F(35)}^FD${ABUTS_COMPANY_NAME}^FS`,
    `^FO${S(100)},${S(1160)}^A0N,${F(28)},${F(28)}^FD${ABUTS_SALES_PERMIT}^FS`,
    `^FO${S(100)},${S(1195)}^A0N,${F(28)},${F(28)}^FD${ABUTS_ADDR}^FS`,
    `^FO${S(100)},${S(1230)}^A0N,${F(28)},${F(28)}^FD${ABUTS_TEL} / ${ABUTS_WEB}^FS`,
    `^FO${S(1510)},${S(1130)}^BQN,2,${qrMag(6)}`,
    `^FDLA,${qrAbutsData || "-"}^FS`,

    "^XZ",
  ].join("\n");
};

const convertZplToRotatedImage = async (zpl, dpi) => {
  // Labelary API로 ZPL을 PNG 이미지로 변환
  const labelaryUrl = `http://api.labelary.com/v1/printers/${dpi}dpi/labels/3.15x2.56/0/`;
  const response = await fetch(labelaryUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: zpl,
  });

  if (!response.ok) {
    throw new Error(`Labelary API failed: ${response.status}`);
  }

  const imageBuffer = await response.buffer();

  // sharp로 이미지를 90도 회전 (시계 반대 방향)
  const rotatedBuffer = await sharp(imageBuffer).rotate(-90).toBuffer();

  return rotatedBuffer;
};

const convertImageToZplGfa = async (imageBuffer, dpi) => {
  // 이미지를 흑백 1-bit로 변환
  const { data, info } = await sharp(imageBuffer)
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const bytesPerRow = Math.ceil(width / 8);

  // GFA 헥스 데이터 생성
  let hexData = "";
  for (let y = 0; y < height; y++) {
    let rowData = "";
    for (let x = 0; x < bytesPerRow; x++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const pixelX = x * 8 + bit;
        if (pixelX < width) {
          const pixelIndex = y * width + pixelX;
          // 0 = 검은색 (출력), 255 = 흰색 (출력 안함)
          if (data[pixelIndex] === 0) {
            byte |= 1 << (7 - bit);
          }
        }
      }
      rowData += byte.toString(16).toUpperCase().padStart(2, "0");
    }
    hexData += rowData;
  }

  // ZPL GFA 명령 생성
  const totalBytes = bytesPerRow * height;
  const gfaCommand = `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexData}`;

  return { gfaCommand, width, height };
};

const buildRotatedZpl = async (originalZpl, dpi) => {
  // 원본 ZPL을 이미지로 변환 후 90도 회전
  const rotatedImageBuffer = await convertZplToRotatedImage(originalZpl, dpi);

  // 회전된 이미지를 ZPL GFA로 변환
  const { gfaCommand, width, height } = await convertImageToZplGfa(
    rotatedImageBuffer,
    dpi,
  );

  // 최종 ZPL 생성 (가로 모드)
  const finalZpl = [
    "^XA",
    `^PW${width}`,
    `^LL${height}`,
    "^LH0,0",
    "^FO0,0",
    gfaCommand,
    "^XZ",
  ].join("\n");

  return finalZpl;
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
        "# 프린터 설정: Landscape 모드 + 90도 회전",
        "$printerSettings = New-Object System.Drawing.Printing.PrinterSettings",
        "$printerSettings.PrinterName = $printerName",
        "$pageSettings = New-Object System.Drawing.Printing.PageSettings",
        "$pageSettings.Landscape = $true",
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

      // 원본 ZPL 생성 (세로 모드)
      const originalZpl = buildPackingLabelZpl(payload);

      // DPI 가져오기
      const dpi = Number(payload?.dpi) || PACK_LABEL_DPI;

      // ZPL을 이미지로 변환 후 90도 회전하여 최종 ZPL 생성
      const zpl = await buildRotatedZpl(originalZpl, dpi);

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
