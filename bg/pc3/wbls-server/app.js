const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { log } = require("./utils/logger");

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

const PORT = Number(process.env.PRINT_SERVER_PORT || 8005);
const ALLOW_ORIGIN = process.env.PRINT_SERVER_ORIGIN || "*";
const DEFAULT_MEDIA_PROFILE = String(
  process.env.WBL_MEDIA_DEFAULT || "FS",
).trim();
const DEFAULT_PRINTER = String(
  process.env.PRINT_SERVER_DEFAULT_PRINTER || "",
).trim();
const ALLOW_IPS = String(
  process.env.ALLOW_IPS || process.env.WBL_ALLOW_IPS || "",
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isWindows = process.platform === "win32";

const jsonResponse = (res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
  const allowed = ALLOW_IPS.includes(ip);
  log("ip-check", { clientIp: ip, allowed, allowedIps: ALLOW_IPS });
  return allowed;
};

const requireIpAllowed = (req, res) => {
  if (isIpAllowed(req)) return true;
  const ip = getClientIp(req);
  log("blocked:ip", { clientIp: ip, allowedIps: ALLOW_IPS });
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
      if (raw.length > 20_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });

const listPrinters = () =>
  new Promise((resolve, reject) => {
    if (isWindows) {
      const psScript = [
        "if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {",
        "  Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name",
        "} elseif (Get-Command Get-WmiObject -ErrorAction SilentlyContinue) {",
        "  Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name",
        "} else {",
        '  throw "No printer query cmdlets available"',
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

const resolvePrinter = async (requestedPrinter) => {
  const printer = String(requestedPrinter || "").trim();
  if (printer) return printer;
  if (DEFAULT_PRINTER) return DEFAULT_PRINTER;
  const printers = await listPrinters().catch(() => []);
  if (Array.isArray(printers) && printers.length > 0) {
    return printers[0];
  }
  return "";
};

const toPsSingleQuoted = (value) => {
  const raw = String(value ?? "");
  return `'${raw.replace(/'/g, "''")}'`;
};

const printRawZplWindows = ({ filePath, printer, title }) =>
  new Promise((resolve, reject) => {
    const targetPrinter = String(printer || DEFAULT_PRINTER || "").trim();
    if (!targetPrinter) {
      return reject(new Error("Printer is required"));
    }

    const escapedPrinter = toPsSingleQuoted(targetPrinter);
    const escapedFilePath = toPsSingleQuoted(filePath);
    const escapedJobTitle = toPsSingleQuoted(String(title || "Hanjin Label"));

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

    log("print-zpl:windows", { printer: targetPrinter, filePath });

    execFile(
      "powershell.exe",
      psArgs,
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      },
    );
  });

const writeTextToTemp = async (text, ext) => {
  const tempPath = path.join(
    os.tmpdir(),
    `hanjin-label-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`,
  );
  await fs.promises.writeFile(tempPath, text, "utf8");
  return tempPath;
};

const MEDIA_PROFILE_MAP = {
  NS: "NS",
  NL: "NL",
  FS: "FS",
};

const resolveMediaProfile = (paperProfile) => {
  const key = typeof paperProfile === "string" ? paperProfile.trim() : "";
  if (key && MEDIA_PROFILE_MAP[key]) return MEDIA_PROFILE_MAP[key];
  if (key) return key;
  return DEFAULT_MEDIA_PROFILE || "";
};

const buildLpArgs = ({ filePath, printer, title, paperProfile, raw }) => {
  const args = [];
  if (printer) args.push("-d", printer);
  if (title) args.push("-t", title);
  const media = resolveMediaProfile(paperProfile);
  if (media) {
    args.push("-o", `media=${media}`);
  }
  if (raw) {
    args.push("-o", "raw");
  }
  args.push(filePath);
  return args;
};

/**
 * 시스템 한글 TrueType 폰트 경로를 반환한다. 없으면 null.
 * ^A0N 같은 ZPL 기본 폰트는 한글 글리프가 없으므로,
 * 한글이 포함된 ZPL은 이 폰트를 이용해 PDF로 렌더링 후 출력한다.
 */
const findKoreanFontPath = () => {
  const candidates = isWindows
    ? [
        "C:\\Windows\\Fonts\\malgun.ttf",
        "C:\\Windows\\Fonts\\gulim.ttc",
        "C:\\Windows\\Fonts\\batang.ttc",
        "C:\\Windows\\Fonts\\NanumGothic.ttf",
      ]
    : [
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
      ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
};

/**
 * ZPL 문자열에서 텍스트/바코드 필드를 파싱해 렌더링 요소 배열로 반환한다.
 * ZPL 좌표계: 좌상단 원점, 단위는 dot(1/203 inch).
 */
const parseZplForPdf = (zpl) => {
  const elements = [];
  const s = String(zpl || "");
  // 텍스트: ^FO{x},{y}^A0N,{h},{w}^FD{text}^FS
  const textRe = /\^FO(\d+),(\d+)\^A0N,(\d+),(\d+)\^FD([^^]*)\^FS/g;
  let m;
  while ((m = textRe.exec(s)) !== null) {
    const text = String(m[5] || "").trim();
    if (text) {
      elements.push({
        type: "text",
        x: +m[1],
        y: +m[2],
        h: +m[3],
        w: +m[4],
        text,
      });
    }
  }
  // 바코드: ^FO{x},{y}^BY{n},{r},{h}^BCN^FD{data}^FS
  const barRe = /\^FO(\d+),(\d+)\^BY\d+,[\d.]+,(\d+)\^BCN\^FD([^^]*)\^FS/g;
  while ((m = barRe.exec(s)) !== null) {
    const data = String(m[4] || "").trim();
    if (data) {
      elements.push({ type: "barcode", x: +m[1], y: +m[2], h: +m[3], data });
    }
  }
  return elements;
};

/**
 * ZPL을 파싱해 pdfkit + 한글 폰트로 PDF를 생성한다.
 * ZPL 좌표(dot, 203dpi) → PDF 포인트(72dpi)로 변환.
 * 한글이 포함된 Hanjin 운송장 라벨에 사용한다.
 */
const renderZplAsKoreanPdf = async (zpl, pdfPath, koreanFontPath) => {
  const PDFDocument = require("pdfkit");
  const bwipjs = require("bwip-js");
  const DOT_TO_PT = 72 / 203;
  const pwMatch = String(zpl).match(/\^PW(\d+)/i);
  const llMatch = String(zpl).match(/\^LL(\d+)/i);
  const pageW = Number(pwMatch ? pwMatch[1] : 1218) * DOT_TO_PT;
  const pageH = Number(llMatch ? llMatch[1] : 812) * DOT_TO_PT;
  const doc = new PDFDocument({ size: [pageW, pageH], margin: 0 });
  let hasKoreanFont = false;
  if (koreanFontPath) {
    try {
      doc.registerFont("Korean", koreanFontPath);
      doc.font("Korean");
      hasKoreanFont = true;
    } catch (e) {
      log("korean-font:register-failed", {
        path: koreanFontPath,
        error: e.message,
      });
    }
  }
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  const elements = parseZplForPdf(zpl);
  for (const el of elements) {
    const px = el.x * DOT_TO_PT;
    const py = el.y * DOT_TO_PT;
    if (el.type === "text") {
      const fontSize = Math.max(6, el.h * DOT_TO_PT * 0.85);
      if (hasKoreanFont) {
        try {
          doc.font("Korean");
        } catch {
          // 폰트 설정 실패 무시
        }
      }
      try {
        doc.fontSize(fontSize).text(el.text, px, py, { lineBreak: false });
      } catch {
        // 렌더링 실패는 무시하고 계속
      }
    } else if (el.type === "barcode") {
      try {
        const barcodeH = Math.max(24, el.h * DOT_TO_PT);
        const buf = await bwipjs.toBuffer({
          bcid: "code128",
          text: el.data,
          scale: 2,
          height: Math.round(barcodeH / 4),
          includetext: false,
        });
        doc.image(buf, px, py, { height: barcodeH });
      } catch (e) {
        log("barcode:render-error", { data: el.data, error: e.message });
      }
    }
  }
  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
};

const printFile = ({ filePath, printer, title, paperProfile, raw = false }) =>
  new Promise((resolve, reject) => {
    if (isWindows && raw) {
      printRawZplWindows({ filePath, printer, title })
        .then(resolve)
        .catch(reject);
      return;
    }

    const args = buildLpArgs({ filePath, printer, title, paperProfile, raw });
    execFile("lp", args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });

const server = http.createServer(async (req, res) => {
  const clientIp = getClientIp(req);

  if (!req.url) {
    return jsonResponse(res, 400, { success: false, message: "Invalid URL" });
  }

  log("request:incoming", {
    method: req.method,
    url: req.url,
    clientIp,
    xForwardedFor: req.headers["x-forwarded-for"],
    remoteAddress: req.socket?.remoteAddress,
  });

  if (req.method === "OPTIONS") {
    return jsonResponse(res, 204, { success: true });
  }

  if (!requireIpAllowed(req, res)) return;

  if (req.url === "/health" && req.method === "GET") {
    return jsonResponse(res, 200, { success: true, status: "ok" });
  }

  if (req.url === "/printers" && req.method === "GET") {
    try {
      const printers = await listPrinters();
      log("printers", { count: printers.length });
      return jsonResponse(res, 200, { success: true, printers });
    } catch (error) {
      log("printers:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  if (req.url === "/print" && req.method === "POST") {
    return jsonResponse(res, 410, {
      success: false,
      message: "Legacy PDF printing is disabled. Use /print-zpl.",
    });
  }

  if (req.url === "/print-zpl" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const zpl = payload.zpl;
      const printer = await resolvePrinter(payload.printer);
      const title = payload.title || "Hanjin Label";
      const paperProfile =
        typeof payload.paperProfile === "string"
          ? payload.paperProfile.trim()
          : "";
      const saveMode = payload.saveMode || "print";
      const printMode = String(payload.printMode || "raw")
        .trim()
        .toLowerCase();

      if (!zpl || typeof zpl !== "string") {
        return jsonResponse(res, 400, {
          success: false,
          message: "zpl 문자열이 필요합니다.",
        });
      }

      if (saveMode === "pdf") {
        const pdfPath = path.join(
          os.tmpdir(),
          `hanjin-label-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
        );

        log("print-zpl:pdf-convert", { title });

        try {
          const koreanFontPath = findKoreanFontPath();
          await renderZplAsKoreanPdf(zpl, pdfPath, koreanFontPath);

          const pdfBuffer = await fs.promises.readFile(pdfPath);
          const base64Pdf = pdfBuffer.toString("base64");

          fs.unlink(pdfPath, () => undefined);

          log("print-zpl:pdf-done", { title });

          return jsonResponse(res, 200, {
            success: true,
            saveMode: "pdf",
            pdf: base64Pdf,
            filename: `${title}-${Date.now()}.pdf`,
          });
        } catch (error) {
          fs.unlink(pdfPath, () => undefined);
          throw error;
        }
      }

      if (!printer) {
        return jsonResponse(res, 400, {
          success: false,
          message:
            "사용 가능한 프린터가 없습니다. 프린터를 OS(CUPS)에 등록하거나 printer 값을 지정해주세요.",
        });
      }

      // 한글 포함 ZPL: 시스템 한글 폰트로 PDF 렌더링 후 출력한다.
      // ^A0N 등 ZPL 기본 폰트는 한글 글리프를 포함하지 않으므로,
      // raw ZPL 또는 pdfkit 기본 폰트로 출력하면 한글이 깨진다.
      const koreanFontPath = findKoreanFontPath();
      if (/[\uAC00-\uD7A3]/.test(zpl) && koreanFontPath) {
        log("print-zpl:korean-pdf", { printer, title, font: koreanFontPath });
        const pdfPath = path.join(
          os.tmpdir(),
          `hanjin-label-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
        );
        try {
          await renderZplAsKoreanPdf(zpl, pdfPath, koreanFontPath);
          await printFile({
            filePath: pdfPath,
            printer,
            title,
            paperProfile,
            raw: false,
          });
          log("print-zpl:done", { printer, title, printMode: "korean-pdf" });
          return jsonResponse(res, 200, {
            success: true,
            printMode: "korean-pdf",
          });
        } catch (error) {
          log("print-zpl:korean-pdf:error", { message: error.message });
          return jsonResponse(res, 500, {
            success: false,
            message: error.message,
          });
        } finally {
          fs.unlink(pdfPath, () => undefined);
        }
      }

      const tempPath = await writeTextToTemp(zpl, "zpl");

      log("print-zpl:queued", { printer, title, printMode });

      try {
        await printFile({
          filePath: tempPath,
          printer,
          title,
          paperProfile,
          raw: true,
        });
        log("print-zpl:done", { printer, title, printMode: "raw" });
      } finally {
        fs.unlink(tempPath, () => undefined);
      }

      return jsonResponse(res, 200, { success: true, printMode });
    } catch (error) {
      log("print-zpl:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  return jsonResponse(res, 404, { success: false, message: "Not Found" });
});

server.listen(PORT, "0.0.0.0", () => {
  const address = server.address();
  const host = address.address;
  const actualPort = address.port;
  console.log(`Print server running on http://0.0.0.0:${actualPort}`);
  log("server:started", {
    host,
    port: actualPort,
    url: `http://0.0.0.0:${actualPort}`,
    allowedIps: ALLOW_IPS,
    platform: process.platform,
  });
});
