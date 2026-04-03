import { emitBgRuntimeStatus } from "../bg/bgRuntimeEvents.js";

const PACK_PRINT_SERVER_BASE = String(
  process.env.PACK_PRINT_SERVER_BASE || "http://localhost:8004",
).trim();
const PACK_PRINT_SERVER_SHARED_SECRET = String(
  process.env.PACK_PRINT_SERVER_SHARED_SECRET,
).trim();
const PACK_PRINT_SERVER_TIMEOUT_MS = Number(
  process.env.PACK_PRINT_SERVER_TIMEOUT_MS ||
    process.env.PACK_PRINT_TIMEOUT_MS ||
    15000,
);

const PACK_PAPER_DEFAULT = String(process.env.PACK_PAPER_DEFAULT).trim();
const PACK_PAPER_OPTIONS = String(process.env.PACK_PAPER_OPTIONS)
  .split(",")
  .map((v) => String(v || "").trim())
  .filter(Boolean);

const PACK_LABEL_DPI = Number(process.env.PACK_LABEL_DPI);
const PACK_LABEL_DESIGN_DPI = 203; // 원본 디자인 좌표는 203 DPI 기준

const mmToDots = (mm, dpi) => {
  const mmNum = Number(mm);
  const dpiNum = Number(dpi);
  if (!Number.isFinite(mmNum) || !Number.isFinite(dpiNum) || dpiNum <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((mmNum / 25.4) * dpiNum));
};

const withTimeout = async (promise, ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const value = await promise(controller.signal);
    return value;
  } finally {
    clearTimeout(timer);
  }
};

export async function getPackPrintSettings(req, res) {
  const dpi = PACK_LABEL_DPI;
  const designDpi = PACK_LABEL_DESIGN_DPI;
  const paperDefault = PACK_PAPER_DEFAULT;
  const paperOptions = PACK_PAPER_OPTIONS;

  // Current supported profile: PACK_80x65 (landscape 80 x 65mm)
  const mm =
    paperDefault === "PACK_80x65" || paperOptions.includes("PACK_80x65")
      ? { w: 80, h: 65 }
      : null;

  const dots = mm ? { pw: mmToDots(mm.w, dpi), ll: mmToDots(mm.h, dpi) } : null;
  const designDots = mm
    ? {
        pw: mmToDots(mm.w, designDpi),
        ll: mmToDots(mm.h, designDpi),
        dpi: designDpi,
      }
    : null;

  return res.status(200).json({
    success: true,
    data: {
      paper: {
        default: paperDefault,
        options: paperOptions,
      },
      dpi,
      label: {
        mm,
        dots,
        designDots,
      },
    },
  });
}

const callPackServer = async ({ path, method, body }) => {
  if (!PACK_PRINT_SERVER_BASE) {
    const error = new Error("pack_print_server_not_configured");
    error.statusCode = 400;
    throw error;
  }

  const url = `${PACK_PRINT_SERVER_BASE.replace(/\/+$/, "")}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (PACK_PRINT_SERVER_SHARED_SECRET) {
    headers["x-pack-secret"] = PACK_PRINT_SERVER_SHARED_SECRET;
  }

  console.log("[packingPrint] proxy request", {
    method,
    url,
    hasBody: Boolean(body),
  });

  const res = await withTimeout(
    (signal) =>
      fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
      }),
    PACK_PRINT_SERVER_TIMEOUT_MS,
  );

  const text = await res.text().catch(() => "");
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  console.log("[packingPrint] proxy response", {
    method,
    url,
    status: res.status,
    success: parsed?.success ?? null,
    message: parsed?.message || null,
  });

  return { res, text, body: parsed };
};

/**
 * @route POST /api/requests/packing/print-zpl
 */
export async function printPackZpl(req, res) {
  try {
    const payload =
      req.body && typeof req.body === "object" ? { ...req.body } : {};
    const requestId = String(payload?.requestId || "").trim();

    emitBgRuntimeStatus({
      requestId: requestId || null,
      source: "pack-server",
      stage: "packing",
      status: "started",
      label: "패킹 라벨 출력중",
      tone: "amber",
      startedAt: new Date().toISOString(),
      metadata: {
        printer: payload?.printer || null,
        paperProfile: payload?.paperProfile || null,
        mode: "bitmap-zpl",
      },
    });

    console.log("[packingPrint] raw zpl print request received", {
      requestId: payload?.requestId || null,
      printer: payload?.printer || null,
      paperProfile: payload?.paperProfile || null,
      zplLength: typeof payload?.zpl === "string" ? payload.zpl.length : 0,
    });

    const requestedPaper = String(payload.paperProfile || "").trim();
    const allowed = Array.isArray(PACK_PAPER_OPTIONS) ? PACK_PAPER_OPTIONS : [];
    const resolvedPaper =
      requestedPaper && allowed.includes(requestedPaper)
        ? requestedPaper
        : String(PACK_PAPER_DEFAULT || "").trim();
    payload.paperProfile = resolvedPaper || undefined;

    const {
      res: upstream,
      body,
      text,
    } = await callPackServer({
      path: "/print-zpl",
      method: "POST",
      body: payload,
    });

    if (!upstream.ok || !body?.success) {
      emitBgRuntimeStatus({
        requestId: requestId || null,
        source: "pack-server",
        stage: "packing",
        status: "failed",
        label: "패킹 라벨 출력 실패",
        tone: "rose",
        metadata: {
          message: body?.message || text || "패킹 라벨 출력에 실패했습니다.",
          mode: "bitmap-zpl",
        },
      });
      return res.status(upstream.status || 502).json({
        success: false,
        message: body?.message || text || "패킹 라벨 출력에 실패했습니다.",
      });
    }

    emitBgRuntimeStatus({
      requestId: requestId || null,
      source: "pack-server",
      stage: "packing",
      status: "completed",
      label: "패킹 라벨 출력 완료",
      tone: "amber",
      clear: true,
    });

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    const requestId = String(req?.body?.requestId || "").trim();
    console.error("[packingPrint] raw zpl print proxy error", {
      status,
      message: error?.message || null,
    });
    emitBgRuntimeStatus({
      requestId: requestId || null,
      source: "pack-server",
      stage: "packing",
      status: "failed",
      label: "패킹 라벨 출력 실패",
      tone: "rose",
      metadata: {
        status,
        message: error?.message || null,
        mode: "bitmap-zpl",
      },
    });
    return res.status(status).json({
      success: false,
      message:
        error?.message === "pack_print_server_not_configured"
          ? "PACK_PRINT_SERVER_BASE가 설정되지 않았습니다."
          : error?.message || "패킹 라벨 출력 중 오류가 발생했습니다.",
    });
  }
}

/**
 * @route GET /api/requests/packing/printers
 */
export async function getPackPrinters(req, res) {
  try {
    const { res: upstream, body } = await callPackServer({
      path: "/printers",
      method: "GET",
    });

    if (!upstream.ok || !body?.success) {
      return res.status(upstream.status || 502).json({
        success: false,
        message: body?.message || "프린터 목록을 불러올 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      printers: Array.isArray(body.printers) ? body.printers : [],
      defaultPrinter: body.defaultPrinter || null,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res.status(status).json({
      success: false,
      message:
        error?.message === "pack_print_server_not_configured"
          ? "PACK_PRINT_SERVER_BASE가 설정되지 않았습니다."
          : error?.message || "프린터 목록 조회 중 오류가 발생했습니다.",
    });
  }
}

/**
 * @route POST /api/requests/packing/print-packing-label
 */
export async function printPackPackingLabel(req, res) {
  try {
    const payload =
      req.body && typeof req.body === "object" ? { ...req.body } : {};
    const requestId = String(payload?.requestId || "").trim();

    emitBgRuntimeStatus({
      requestId: requestId || null,
      source: "pack-server",
      stage: "packing",
      status: "started",
      label: "패킹 라벨 출력중",
      tone: "amber",
      startedAt: new Date().toISOString(),
      metadata: {
        printer: payload?.printer || null,
        paperProfile: payload?.paperProfile || null,
      },
    });

    console.log("[packingPrint] print request received", {
      requestId: payload?.requestId || null,
      printer: payload?.printer || null,
      paperProfile: payload?.paperProfile || null,
    });

    const requestedPaper = String(payload.paperProfile || "").trim();
    const allowed = Array.isArray(PACK_PAPER_OPTIONS) ? PACK_PAPER_OPTIONS : [];
    const resolvedPaper =
      requestedPaper && allowed.includes(requestedPaper)
        ? requestedPaper
        : String(PACK_PAPER_DEFAULT || "").trim();
    payload.paperProfile = resolvedPaper || undefined;

    const dpi =
      Number.isFinite(PACK_LABEL_DPI) && PACK_LABEL_DPI > 0
        ? PACK_LABEL_DPI
        : 600;
    payload.dpi = dpi;

    if (payload.paperProfile === "PACK_65x80") {
      payload.zplPW = mmToDots(80, dpi);
      payload.zplLL = mmToDots(65, dpi);
    }

    const {
      res: upstream,
      body,
      text,
    } = await callPackServer({
      path: "/print-packing-label",
      method: "POST",
      body: payload,
    });

    if (!upstream.ok || !body?.success) {
      emitBgRuntimeStatus({
        requestId: requestId || null,
        source: "pack-server",
        stage: "packing",
        status: "failed",
        label: "패킹 라벨 출력 실패",
        tone: "rose",
        metadata: {
          message: body?.message || text || "패킹 라벨 출력에 실패했습니다.",
        },
      });
      return res.status(upstream.status || 502).json({
        success: false,
        message: body?.message || text || "패킹 라벨 출력에 실패했습니다.",
      });
    }

    emitBgRuntimeStatus({
      requestId: requestId || null,
      source: "pack-server",
      stage: "packing",
      status: "completed",
      label: "패킹 라벨 출력 완료",
      tone: "amber",
      clear: true,
    });

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    const requestId = String(req?.body?.requestId || "").trim();
    console.error("[packingPrint] print proxy error", {
      status,
      message: error?.message || null,
    });
    emitBgRuntimeStatus({
      requestId: requestId || null,
      source: "pack-server",
      stage: "packing",
      status: "failed",
      label: "패킹 라벨 출력 실패",
      tone: "rose",
      metadata: {
        status,
        message: error?.message || null,
      },
    });
    return res.status(status).json({
      success: false,
      message:
        error?.message === "pack_print_server_not_configured"
          ? "PACK_PRINT_SERVER_BASE가 설정되지 않았습니다."
          : error?.message || "패킹 라벨 출력 중 오류가 발생했습니다.",
    });
  }
}
