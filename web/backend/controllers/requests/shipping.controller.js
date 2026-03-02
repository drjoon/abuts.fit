import Request from "../../models/request.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import hanjinService from "../../services/hanjin.service.js";
import { handleHanjinTrackingWebhook } from "../webhooks/hanjinWebhook.controller.js";
import { Types } from "mongoose";
import {
  buildRequestorOrgScopeFilter,
  calculateExpressShipYmd,
  normalizeKoreanBusinessDay,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  DEFAULT_DELIVERY_ETA_LEAD_DAYS,
  getDeliveryEtaLeadDays,
  applyStatusMapping,
  bumpRollbackCount,
  normalizeRequestStage,
  normalizeRequestStageLabel,
  REQUEST_STAGE_GROUPS,
  getRequestorOrgId,
  ensureReviewByStageDefaults,
} from "./utils.js";

const __cache = new Map();
const memo = async ({ key, ttlMs, fn }) => {
  const now = Date.now();
  const hit = __cache.get(key);
  if (hit && typeof hit.expiresAt === "number" && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await fn();
  __cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
};

const resolveMailboxList = (mailboxAddresses) =>
  Array.isArray(mailboxAddresses)
    ? mailboxAddresses.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

async function resolveHanjinPayload({ mailboxAddresses, payload }) {
  if (payload && typeof payload === "object") {
    return { payload, usedDbRequests: false };
  }

  const list = resolveMailboxList(mailboxAddresses);
  if (!list.length) {
    const error = new Error("mailboxAddresses가 필요합니다.");
    error.statusCode = 400;
    throw error;
  }

  const requests = await Request.find({
    mailboxAddress: { $in: list },
    manufacturerStage: "포장.발송",
  })
    .populate("requestor", "name organization phoneNumber address")
    .populate("requestorOrganizationId", "name extracted")
    .lean();

  if (!requests.length) {
    const error = new Error("조건에 맞는 의뢰를 찾을 수 없습니다.");
    error.statusCode = 404;
    throw error;
  }

  return {
    payload: buildHanjinDraftPayload(requests, list),
    usedDbRequests: true,
  };
}

const resolveExpressShipLeadDays = () => 1;

const resolveHanjinPath = (envKey, fallbackPath) => {
  const raw = String(process.env[envKey] || "").trim();
  if (raw) return raw;
  return fallbackPath || "";
};

const buildHanjinPathCandidates = (rawPath) => {
  const path = String(rawPath || "").trim();
  if (!path) return [];

  const candidates = [path];
  if (path.startsWith("/api/")) {
    candidates.push(path.replace(/^\/api\//, "/"));
  }

  return [...new Set(candidates)];
};

const HANJIN_CLIENT_ID = String(process.env.HANJIN_CLIENT_ID || "").trim();
const HANJIN_CSR_NUM = String(process.env.HANJIN_CSR_NUM || "").trim();
const HANJIN_SHIPPER_ZIP = String(process.env.HANJIN_SHIPPER_ZIP || "").trim();
const WBL_PRINT_SERVER_BASE = String(
  process.env.WBL_PRINT_SERVER_BASE || "",
).trim();
const WBL_PRINT_SHARED_SECRET = String(
  process.env.WBL_PRINT_SHARED_SECRET || "",
).trim();
const WBL_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.WBL_DOWNLOAD_TIMEOUT_MS || 15000,
);
const WBL_PRINTER_DEFAULT = String(
  process.env.WBL_PRINTER_DEFAULT || "",
).trim();
const WBL_MEDIA_DEFAULT = String(process.env.WBL_MEDIA_DEFAULT || "FS").trim();
const WBL_MEDIA_OPTIONS = String(process.env.WBL_MEDIA_OPTIONS || "FS")
  .split(",")
  .map((v) => String(v || "").trim())
  .filter(Boolean);

export async function getWblPrintSettings(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      printer: {
        default: WBL_PRINTER_DEFAULT || null,
      },
      media: {
        default: WBL_MEDIA_DEFAULT || null,
        options: WBL_MEDIA_OPTIONS,
      },
    },
  });
}

const HANJIN_PATH_FALLBACKS = {
  HANJIN_PRINT_WBL_PATH: "/v1/wbl/{client_id}/print-wbls",
  HANJIN_PICKUP_REQUEST_PATH: "/parcel-delivery/v1/order/insert-order",
  HANJIN_PICKUP_CANCEL_PATH: "/parcel-delivery/v1/order/cancel-order",
};

const HANJIN_SENDER_ZIP = String(
  process.env.HANJIN_SENDER_ZIP || process.env.HANJIN_SHIPPER_ZIP || "",
).trim();
const HANJIN_SENDER_BASE_ADDR = String(
  process.env.HANJIN_SENDER_BASE_ADDR || "",
).trim();
const HANJIN_SENDER_DTL_ADDR = String(
  process.env.HANJIN_SENDER_DTL_ADDR || "",
).trim();
const HANJIN_SENDER_NAME = String(process.env.HANJIN_SENDER_NAME || "").trim();
const HANJIN_SENDER_TEL = String(process.env.HANJIN_SENDER_TEL || "").trim();
const HANJIN_SENDER_MOBILE = String(
  process.env.HANJIN_SENDER_MOBILE || "",
).trim();

const ensureHanjinSenderEnv = () => {
  if (!HANJIN_SENDER_ZIP) {
    throw Object.assign(
      new Error("HANJIN_SENDER_ZIP 환경 변수가 필요합니다."),
      {
        statusCode: 500,
      },
    );
  }
  if (!HANJIN_SENDER_BASE_ADDR) {
    throw Object.assign(
      new Error("HANJIN_SENDER_BASE_ADDR 환경 변수가 필요합니다."),
      {
        statusCode: 500,
      },
    );
  }
  if (!HANJIN_SENDER_DTL_ADDR) {
    throw Object.assign(
      new Error("HANJIN_SENDER_DTL_ADDR 환경 변수가 필요합니다."),
      {
        statusCode: 500,
      },
    );
  }
  if (!HANJIN_SENDER_NAME) {
    throw Object.assign(
      new Error("HANJIN_SENDER_NAME 환경 변수가 필요합니다."),
      {
        statusCode: 500,
      },
    );
  }
  if (!HANJIN_SENDER_TEL) {
    throw Object.assign(
      new Error("HANJIN_SENDER_TEL 환경 변수가 필요합니다."),
      {
        statusCode: 500,
      },
    );
  }
};

const buildHanjinInsertOrderBody = ({ mailbox, requests }) => {
  ensureHanjinEnv();
  ensureHanjinSenderEnv();

  const list = Array.isArray(requests) ? requests : [];
  const first = list[0] || {};
  const requestor = first.requestor || {};
  const requestorOrg = first.requestorOrganizationId || {};
  const extracted = requestorOrg.extracted || {};
  const addr = requestor.address || {};

  const receiverZip = String(addr.zipCode || extracted.zipCode || "")
    .trim()
    .slice(0, 6);
  const receiverBaseAddr =
    String(addr.street || addr.address1 || extracted.address || "").trim() ||
    String(requestor.addressText || "").trim();
  const receiverDtlAddr = String(addr.address2 || "").trim();

  const receiverName =
    String(first.caseInfos?.clinicName || "").trim() ||
    String(requestorOrg.name || extracted.companyName || "").trim() ||
    String(requestor.organization || "").trim() ||
    String(requestor.name || "").trim();

  const receiverTel = String(
    requestor.phoneNumber || extracted.phoneNumber || requestor.phone || "",
  )
    .trim()
    .slice(0, 20);

  const ymd = getTodayYmdInKst().replace(/-/g, "");
  const custOrdNo = `ABUTS_${ymd}_${String(mailbox || "-")}`.slice(0, 30);

  return {
    custEdiCd: HANJIN_CLIENT_ID,
    custOrdNo,
    svcCatCd: "E",
    cntractNo: HANJIN_CSR_NUM,
    pickupAskDt: ymd,
    sndrZip: HANJIN_SENDER_ZIP,
    sndrBaseAddr: HANJIN_SENDER_BASE_ADDR,
    sndrDtlAddr: HANJIN_SENDER_DTL_ADDR,
    sndrNm: HANJIN_SENDER_NAME,
    sndrTelNo: HANJIN_SENDER_TEL,
    ...(HANJIN_SENDER_MOBILE ? { sndrMobileNo: HANJIN_SENDER_MOBILE } : {}),
    sndrRefCntent: "abuts.fit",
    rcvrZip: receiverZip,
    rcvrBaseAddr: receiverBaseAddr,
    rcvrDtlAddr: receiverDtlAddr,
    rcvrNm: receiverName,
    rcvrTelNo: receiverTel || HANJIN_SENDER_TEL,
    ...(receiverTel ? { rcvrMobileNo: receiverTel } : {}),
    rcvrAskCntent: "",
    rcvrRefCntent: String(mailbox || "").trim(),
    comodityNm: "Custom Abutment",
    payTypCd: "CD",
    boxTypCd: "A",
  };
};

const resolveWblPrintPayload = (payload) => {
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

const escapeZplText = (value) =>
  String(value || "")
    .replace(/\^/g, "")
    .replace(/~/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim();

const isMeaningfulHanjinText = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return raw.replace(/[\/()\s]+/g, "").length > 0;
};

const buildHanjinWblZplLabels = ({ addressList }) => {
  const list = Array.isArray(addressList) ? addressList : [];
  if (!list.length) return [];

  // 4x6 inch label baseline (Zebra): width ~812 dots @203dpi, height ~1218
  // Keep it simple: print tracking + condensed address highlight.
  return list
    .filter((row) => row && row.result_code === "OK" && row.wbl_num)
    .map((row) => {
      const wbl = escapeZplText(row.wbl_num);
      const prtAdd = escapeZplText(row.prt_add);
      const tmlRaw = escapeZplText(row.tml_nam);
      const cenRaw = escapeZplText(row.cen_nam);
      const tml = isMeaningfulHanjinText(tmlRaw) ? tmlRaw : "";
      const cen = isMeaningfulHanjinText(cenRaw) ? cenRaw : "";
      const msgKey = escapeZplText(row.msg_key);

      const tmlLine = (() => {
        if (tml && cen) return `TML: ${tml} / ${cen}`;
        if (tml) return `TML: ${tml}`;
        if (cen) return `TML: ${cen}`;
        return "";
      })();

      return [
        "^XA",
        "^CI28",
        "^PW812",
        "^LL1218",
        "^LH0,0",
        "^FO40,40^A0N,48,48^FDHANJIN WBL^FS",
        `^FO40,120^A0N,42,42^FD${wbl}^FS`,
        `^FO40,180^BCN,120,Y,N,N^FD${wbl}^FS`,
        tmlLine ? `^FO40,330^A0N,28,28^FD${escapeZplText(tmlLine)}^FS` : "",
        prtAdd ? `^FO40,380^A0N,32,32^FD${prtAdd}^FS` : "",
        msgKey ? `^FO40,440^A0N,24,24^FDKEY: ${msgKey}^FS` : "",
        "^XZ",
      ]
        .filter(Boolean)
        .join("\n");
    });
};

const buildHanjinWblZpl = ({ addressList }) => {
  const labels = buildHanjinWblZplLabels({ addressList });
  if (!labels.length) return null;
  return labels.join("\n");
};

async function triggerWblServerPrint(payload, options = null) {
  if (!WBL_PRINT_SERVER_BASE) {
    return {
      success: false,
      skipped: true,
      reason: "wbl_print_server_not_configured",
    };
  }

  const opts = options && typeof options === "object" ? options : {};
  const requestedPrinter =
    typeof opts.printer === "string" && opts.printer.trim()
      ? opts.printer.trim()
      : "";
  const requestedMedia =
    typeof opts.paperProfile === "string" && opts.paperProfile.trim()
      ? opts.paperProfile.trim()
      : "";
  const mediaOptions = Array.isArray(WBL_MEDIA_OPTIONS)
    ? WBL_MEDIA_OPTIONS
    : [];
  const paperProfile =
    requestedMedia && mediaOptions.includes(requestedMedia)
      ? requestedMedia
      : WBL_MEDIA_DEFAULT || "";

  const zplPayload =
    payload && typeof payload === "object"
      ? buildHanjinWblZpl({ addressList: payload.address_list })
      : null;
  if (!zplPayload) {
    return { success: false, skipped: true, reason: "print_payload_not_found" };
  }

  const headers = { "Content-Type": "application/json" };
  if (WBL_PRINT_SHARED_SECRET) {
    headers["x-wbl-secret"] = WBL_PRINT_SHARED_SECRET;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WBL_DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${WBL_PRINT_SERVER_BASE.replace(/\/+$/, "")}/print-zpl`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          zpl: zplPayload,
          title: "Hanjin Label",
          ...(requestedPrinter
            ? { printer: requestedPrinter }
            : WBL_PRINTER_DEFAULT
              ? { printer: WBL_PRINTER_DEFAULT }
              : {}),
          ...(paperProfile ? { paperProfile } : {}),
        }),
        signal: controller.signal,
      },
    );

    const text = await res.text().catch(() => "");
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (!res.ok || !body?.success) {
      return {
        success: false,
        status: res.status,
        message: body?.message || text || "wbl print failed",
      };
    }

    return { success: true, status: res.status, mode: "zpl" };
  } catch (error) {
    return {
      success: false,
      message: error?.message || "wbl print failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

const ensureHanjinEnv = () => {
  if (!HANJIN_CLIENT_ID) {
    throw Object.assign(new Error("HANJIN_CLIENT_ID가 설정되지 않았습니다."), {
      statusCode: 500,
    });
  }
  if (!HANJIN_CSR_NUM) {
    throw Object.assign(new Error("HANJIN_CSR_NUM 환경 변수가 필요합니다."), {
      statusCode: 500,
    });
  }
  if (!HANJIN_SHIPPER_ZIP) {
    throw Object.assign(
      new Error("HANJIN_SHIPPER_ZIP 환경 변수가 필요합니다."),
      {
        statusCode: 500,
      },
    );
  }
};

const buildHanjinDraftPayload = (requests) => {
  ensureHanjinEnv();

  const mailboxToQuantity = new Map();
  for (const r of requests) {
    const mailbox = String(r?.mailboxAddress || "").trim();
    if (!mailbox) continue;
    mailboxToQuantity.set(mailbox, (mailboxToQuantity.get(mailbox) || 0) + 1);
  }

  const addressList = requests.map((r) => {
    const requestor = r.requestor || {};
    const requestorOrg = r.requestorOrganizationId || {};
    const extracted = requestorOrg.extracted || {};
    const addr = requestor.address || {};

    const clinicName = r.caseInfos?.clinicName || extracted.companyName || "";
    const addressText =
      addr.street ||
      addr.address1 ||
      addr.address2 ||
      requestor.addressText ||
      extracted.address ||
      "";

    const receiverZip = String(addr.zipCode || extracted.zipCode || "").slice(
      0,
      6,
    );

    const mailbox = String(r?.mailboxAddress || "").trim();
    const quantity =
      mailbox && mailboxToQuantity.has(mailbox)
        ? mailboxToQuantity.get(mailbox)
        : 1;
    const orgName =
      String(requestorOrg.name || "").trim() ||
      String(extracted.companyName || "").trim() ||
      String(requestor.organization || "").trim() ||
      String(clinicName || "").trim() ||
      String(requestor.name || "").trim();

    const msgKey = `${mailbox || "-"} / ${orgName || "-"} / ${quantity}`
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 100);

    return {
      csr_num: HANJIN_CSR_NUM,
      snd_zip: HANJIN_SHIPPER_ZIP,
      rcv_zip: receiverZip,
      address: addressText,
      msg_key: msgKey,
      receiver_name:
        clinicName ||
        requestor.name ||
        extracted.representativeName ||
        extracted.companyName ||
        "",
      receiver_phone:
        requestor.phoneNumber || extracted.phoneNumber || requestor.phone || "",
    };
  });

  return {
    client_id: HANJIN_CLIENT_ID,
    csr_num: HANJIN_CSR_NUM,
    address_list: addressList,
  };
};

/**
 * 한진 운송장 출력 (메일박스 기준)
 * @route POST /api/requests/shipping/hanjin/print-labels
 */
export async function printHanjinLabels(req, res) {
  try {
    const { mailboxAddresses, payload, wblPrintOptions } = req.body || {};

    const path = resolveHanjinPath(
      "HANJIN_PRINT_WBL_PATH",
      HANJIN_PATH_FALLBACKS.HANJIN_PRINT_WBL_PATH,
    );
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PRINT_WBL_PATH가 설정되지 않았습니다.",
      });
    }

    let resolved;
    try {
      resolved = await resolveHanjinPayload({ mailboxAddresses, payload });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }

    const data = await hanjinService.requestPrintApi({
      path: path.replace("{client_id}", HANJIN_CLIENT_ID),
      method: "POST",
      data: resolved.payload,
    });

    const zplLabels =
      data && typeof data === "object"
        ? buildHanjinWblZplLabels({ addressList: data.address_list })
        : [];

    const shouldTriggerWblPrint =
      wblPrintOptions && typeof wblPrintOptions === "object";
    const wblPrint = shouldTriggerWblPrint
      ? await triggerWblServerPrint(data, wblPrintOptions)
      : { success: true, skipped: true, reason: "image_mode" };
    if (shouldTriggerWblPrint && !wblPrint?.success) {
      console.warn("[shipping] wbl print fallback needed", {
        reason: wblPrint?.reason || wblPrint?.message || "unknown",
        status: wblPrint?.status,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...(data || {}),
        zplLabels,
      },
      wblPrint,
    });
  } catch (error) {
    console.error("Error in printHanjinLabels:", error);
    return res.status(500).json({
      success: false,
      message: "한진 운송장 출력 요청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 우편함 전체 롤백 (포장.발송 → 세척.패킹)
 * @route POST /api/requests/shipping/mailbox-rollback
 */
export async function rollbackMailboxShipping(req, res) {
  try {
    const { mailboxAddress, requestIds } = req.body || {};

    const mailbox = String(mailboxAddress || "").trim();
    if (!mailbox) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddress가 필요합니다.",
      });
    }

    const ids = Array.isArray(requestIds)
      ? requestIds
          .map((v) => String(v || "").trim())
          .filter((v) => Types.ObjectId.isValid(v))
      : [];

    const filter = {
      mailboxAddress: mailbox,
      manufacturerStage: "포장.발송",
    };

    if (ids.length) {
      filter._id = { $in: ids };
    }

    const requests = await Request.find(filter);
    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const updatedIds = [];
    for (const r of requests) {
      ensureReviewByStageDefaults(r);
      r.caseInfos.reviewByStage.shipping = {
        ...r.caseInfos.reviewByStage.shipping,
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
      bumpRollbackCount(r, "shipping");
      applyStatusMapping(r, "세척.패킹");
      r.mailboxAddress = null;
      await r.save();
      updatedIds.push(r.requestId);
    }

    return res.status(200).json({
      success: true,
      message: `${updatedIds.length}건이 롤백되었습니다.`,
      data: { updatedIds },
    });
  } catch (error) {
    console.error("Error in rollbackMailboxShipping:", error);
    return res.status(500).json({
      success: false,
      message: "우편함 롤백 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 한진 택배 수거 접수 (메일박스 기준)
 * @route POST /api/requests/shipping/hanjin/pickup
 */
export async function requestHanjinPickup(req, res) {
  try {
    const { mailboxAddresses, payload } = req.body || {};

    const path = resolveHanjinPath(
      "HANJIN_PICKUP_REQUEST_PATH",
      HANJIN_PATH_FALLBACKS.HANJIN_PICKUP_REQUEST_PATH,
    );
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PICKUP_REQUEST_PATH가 설정되지 않았습니다.",
      });
    }

    if (payload && !Array.isArray(mailboxAddresses)) {
      return res.status(200).json({
        success: true,
        data: {
          mocked: true,
          path,
          payload,
        },
      });
    }

    const list = resolveMailboxList(mailboxAddresses);
    if (!list.length && !(payload && typeof payload === "object")) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddresses가 필요합니다.",
      });
    }

    const pathCandidates = buildHanjinPathCandidates(path);

    const callHanjinWithFallback = async ({ data }) => {
      let lastError = null;
      for (const candidate of pathCandidates) {
        try {
          const out = await hanjinService.requestOrderApi({
            path: candidate,
            method: "POST",
            data,
          });
          lastError = null;
          return out;
        } catch (err) {
          lastError = err;
          if (err?.status !== 404) {
            throw err;
          }
        }
      }
      throw lastError;
    };

    // payload가 직접 들어오면(DEV/운영 수동 테스트) 그대로 전달
    if (payload && typeof payload === "object") {
      const data = await callHanjinWithFallback({ data: payload });
      return res.status(200).json({ success: true, data });
    }

    const requests = await Request.find({
      mailboxAddress: { $in: list },
      manufacturerStage: "포장.발송",
    })
      .populate("requestor", "name organization phoneNumber address")
      .populate("requestorOrganizationId", "name extracted")
      .lean();

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const byMailbox = new Map();
    for (const r of requests) {
      const mailbox = String(r?.mailboxAddress || "").trim();
      if (!mailbox) continue;
      if (!byMailbox.has(mailbox)) byMailbox.set(mailbox, []);
      byMailbox.get(mailbox).push(r);
    }

    const results = [];
    for (const mailbox of list) {
      const group = byMailbox.get(mailbox) || [];
      if (!group.length) {
        results.push({
          mailbox,
          success: false,
          skipped: true,
          reason: "no_requests",
        });
        continue;
      }

      const orderBody = buildHanjinInsertOrderBody({
        mailbox,
        requests: group,
      });

      const data = await callHanjinWithFallback({ data: orderBody });
      results.push({ mailbox, success: true, data });
    }

    return res.status(200).json({
      success: true,
      data: { results },
    });
  } catch (error) {
    console.error("Error in requestHanjinPickup:", error);
    return res.status(500).json({
      success: false,
      message: "한진 택배 수거 접수 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 한진 택배 수거 접수 취소 (메일박스 기준)
 * @route POST /api/requests/shipping/hanjin/pickup-cancel
 */
export async function cancelHanjinPickup(req, res) {
  try {
    const { mailboxAddresses, payload } = req.body || {};

    const path = resolveHanjinPath(
      "HANJIN_PICKUP_CANCEL_PATH",
      HANJIN_PATH_FALLBACKS.HANJIN_PICKUP_CANCEL_PATH,
    );
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PICKUP_CANCEL_PATH가 설정되지 않았습니다.",
      });
    }

    if (payload && !Array.isArray(mailboxAddresses)) {
      return res.status(200).json({
        success: true,
        data: {
          mocked: true,
          path,
          payload,
        },
      });
    }

    let resolved;
    try {
      resolved = await resolveHanjinPayload({ mailboxAddresses, payload });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }

    const list = resolveMailboxList(mailboxAddresses);
    if (!list.length && !(payload && typeof payload === "object")) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddresses가 필요합니다.",
      });
    }

    const pathCandidates = buildHanjinPathCandidates(path);

    const callHanjinWithFallback = async ({ data }) => {
      let lastError = null;
      for (const candidate of pathCandidates) {
        try {
          const out = await hanjinService.requestOrderApi({
            path: candidate,
            method: "POST",
            data,
          });
          lastError = null;
          return out;
        } catch (err) {
          lastError = err;
          if (err?.status !== 404) {
            throw err;
          }
        }
      }
      throw lastError;
    };

    // payload가 직접 들어오면(DEV/운영 수동 테스트) 그대로 전달
    if (payload && typeof payload === "object") {
      const data = await callHanjinWithFallback({ data: payload });
      return res.status(200).json({ success: true, data });
    }

    const ymd = getTodayYmdInKst().replace(/-/g, "");
    const results = [];
    for (const mailbox of list) {
      const custOrdNo = `ABUTS_${ymd}_${String(mailbox || "-")}`.slice(0, 30);
      const cancelBody = {
        custEdiCd: HANJIN_CLIENT_ID,
        custOrdNo,
      };
      const data = await callHanjinWithFallback({ data: cancelBody });
      results.push({ mailbox, success: true, data });
    }

    return res.status(200).json({
      success: true,
      data: { results },
    });
  } catch (error) {
    console.error("Error in cancelHanjinPickup:", error);
    return res.status(500).json({
      success: false,
      message: "한진 택배 수거 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function simulateHanjinWebhook(req, res) {
  try {
    const payload = req.body?.payload;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        success: false,
        message: "payload(JSON)가 필요합니다.",
      });
    }

    if (payload.mock) {
      return res.status(200).json({
        success: true,
        data: {
          mocked: true,
          payload,
        },
      });
    }

    const injectedSecret = String(
      process.env.HANJIN_WEBHOOK_SECRET || "",
    ).trim();

    const mockReq = {
      ...req,
      body: payload,
      headers: {
        ...req.headers,
        "x-webhook-secret": req.headers["x-webhook-secret"] || injectedSecret,
      },
    };

    return handleHanjinTrackingWebhook(mockReq, res);
  } catch (error) {
    console.error("Error in simulateHanjinWebhook:", error);
    return res.status(500).json({
      success: false,
      message: "한진 배송정보 수신 시뮬레이션 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 배송 방식 변경 (의뢰자용)
 * @route PATCH /api/requests/my/shipping-mode
 */
export async function updateMyShippingMode(req, res) {
  try {
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const { requestIds, shippingMode } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    if (!["normal", "express"].includes(shippingMode)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 배송 방식입니다.",
      });
    }

    // Fire & Forget: 즉시 응답 반환, 백그라운드에서 처리
    setImmediate(async () => {
      try {
        const { recalculateProductionSchedule, calculatePriority } =
          await import("./production.utils.js");

        const requests = await Request.find({
          ...requestFilter,
          requestId: { $in: requestIds },
          status: "의뢰", // 의뢰 단계만 변경 가능
        });

        for (const req of requests) {
          const maxDiameter = req.caseInfos?.maxDiameter;
          const requestedAt = req.createdAt || new Date();

          // 생산 스케줄 재계산
          const newSchedule = recalculateProductionSchedule({
            currentStage: req.status,
            newShippingMode: shippingMode,
            maxDiameter,
            requestedAt,
          });

          if (!newSchedule) continue;

          // finalShipping 업데이트 (원본 originalShipping은 보존)
          req.finalShipping = {
            mode: shippingMode,
            updatedAt: new Date(),
          };

          // 레거시 호환
          req.shippingMode = shippingMode;

          // 생산 스케줄 업데이트
          req.productionSchedule = newSchedule;

          // 발송 예정일(YYYY-MM-DD, KST)
          req.timeline = req.timeline || {};
          const pickup = newSchedule?.scheduledShipPickup;
          const pickupYmd = pickup ? toKstYmd(pickup) : null;
          if (pickupYmd) {
            req.timeline.estimatedShipYmd = pickupYmd;
          } else if (shippingMode === "express") {
            const createdYmd = toKstYmd(req.createdAt) || getTodayYmdInKst();
            req.timeline.estimatedShipYmd = await addKoreanBusinessDays({
              startYmd: createdYmd,
              days: 1,
            });
          } else {
            req.timeline.estimatedShipYmd = await addKoreanBusinessDays({
              startYmd: toKstYmd(req.createdAt) || getTodayYmdInKst(),
              days: 1,
            });
          }

          await req.save();
        }

        console.log(`[Fire&Forget] Updated ${requests.length} shipping modes`);
      } catch (err) {
        console.error("[Fire&Forget] Error in shipping mode update:", err);
      }
    });

    // 즉시 응답 (UI 대기 없음)
    return res.status(200).json({
      success: true,
      message: `배송 방식 변경이 처리 중입니다.`,
      data: {
        requestedCount: requestIds.length,
        shippingMode,
      },
    });
  } catch (error) {
    console.error("Error in updateMyShippingMode:", error);
    return res.status(500).json({
      success: false,
      message: "배송 방식 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 내 발송 패키지 요약 (의뢰자용)
 * @route GET /api/requests/my/shipping-packages
 */
export async function getMyShippingPackagesSummary(req, res) {
  try {
    const daysRaw = req.query.days;
    const days =
      typeof daysRaw === "string" && daysRaw.trim()
        ? Number(daysRaw)
        : typeof daysRaw === "number"
          ? daysRaw
          : 30;

    if (!Number.isFinite(days) || days <= 0) {
      return res.status(400).json({
        success: false,
        message: "유효한 기간(days) 값을 입력해주세요.",
      });
    }

    const orgId = getRequestorOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const todayYmd = getTodayYmdInKst();

    const packages = await ShippingPackage.find({
      organizationId: orgId,
      createdAt: { $gte: cutoff },
    })
      .select({
        shipDateYmd: 1,
        requestIds: 1,
        shippingFeeSupply: 1,
        createdAt: 1,
      })
      .populate({
        path: "requestIds",
        select: "requestId title caseInfos manufacturerStage createdAt",
      })
      .sort({ createdAt: -1 })
      .lean();

    const todayPackages = packages.filter((p) => p.shipDateYmd === todayYmd);
    const today = {
      shipDateYmd: todayYmd,
      packageCount: todayPackages.length,
      shippingFeeSupplyTotal: todayPackages.reduce(
        (acc, cur) => acc + Number(cur.shippingFeeSupply || 0),
        0,
      ),
    };

    const lastNDays = {
      days,
      packageCount: packages.length,
      shippingFeeSupplyTotal: packages.reduce(
        (acc, cur) => acc + Number(cur.shippingFeeSupply || 0),
        0,
      ),
    };

    const items = packages.map((p) => {
      const requests = Array.isArray(p.requestIds)
        ? p.requestIds.map((req) => ({
            id: String(req?._id || req),
            requestId: req?.requestId || "",
            title: req?.title || "",
            caseInfos: req?.caseInfos || {},
            manufacturerStage: req?.manufacturerStage || "",
            timeline: req?.timeline || {},
            createdAt: req?.createdAt,
          }))
        : [];

      return {
        id: String(p._id),
        shipDateYmd: p.shipDateYmd,
        requestCount: requests.length,
        shippingFeeSupply: Number(p.shippingFeeSupply || 0),
        createdAt: p.createdAt,
        requests,
      };
    });

    return res.status(200).json({
      success: true,
      data: { today, lastNDays, items },
    });
  } catch (error) {
    console.error("Error in getMyShippingPackagesSummary:", error);
    return res.status(500).json({
      success: false,
      message: "발송 패키지 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 발송 예정일 계산 (공용)
 * @route GET /api/requests/shipping-estimate
 */
export async function getShippingEstimate(req, res) {
  try {
    if (process.env.NODE_ENV === "development") {
      const hasAuth = Boolean(req.headers?.authorization);
      console.log("[getShippingEstimate] start", {
        hasAuth,
        userId: req.user?._id ? String(req.user._id) : null,
        role: req.user?.role || null,
        mode: req.query?.mode,
        maxDiameter: req.query?.maxDiameter,
      });
    }

    const mode = req.query.mode;
    const maxDiameterRaw = req.query.maxDiameter;
    const maxDiameter =
      typeof maxDiameterRaw === "string" && maxDiameterRaw.trim()
        ? Number(maxDiameterRaw)
        : typeof maxDiameterRaw === "number"
          ? maxDiameterRaw
          : null;

    if (!mode || !["express", "normal"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 mode 입니다.",
      });
    }

    const todayYmd = getTodayYmdInKst();

    // Fetch requestor weeklyBatchDays
    let requestorWeeklyBatchDays = [];
    try {
      const orgId = getRequestorOrgId(req);
      if (orgId && Types.ObjectId.isValid(orgId)) {
        const org = await RequestorOrganization.findById(orgId)
          .select({ "shippingPolicy.weeklyBatchDays": 1 })
          .lean();
        requestorWeeklyBatchDays = Array.isArray(
          org?.shippingPolicy?.weeklyBatchDays,
        )
          ? org.shippingPolicy.weeklyBatchDays
          : [];
      }
    } catch (e) {
      // handled by scheduler validation
    }

    if (mode === "normal" && requestorWeeklyBatchDays.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "묶음 배송 요일을 설정해주세요. 설정 > 배송에서 요일을 선택 후 다시 시도하세요.",
      });
    }

    const { calculateInitialProductionSchedule } =
      await import("./production.utils.js");
    const schedule = await calculateInitialProductionSchedule({
      shippingMode: mode,
      maxDiameter,
      requestedAt: new Date(),
      weeklyBatchDays: requestorWeeklyBatchDays,
    });
    const pickupYmdRaw = schedule?.scheduledShipPickup
      ? toKstYmd(schedule.scheduledShipPickup)
      : null;

    let estimatedShipYmdRaw;
    if (pickupYmdRaw) {
      estimatedShipYmdRaw = pickupYmdRaw;
    } else {
      // Use manufacturer lead times based on diameter
      const { getManufacturerLeadTimesUtil } =
        await import("../organizations/leadTime.controller.js");
      const manufacturerSettings = await getManufacturerLeadTimesUtil();
      const leadTimes = manufacturerSettings?.leadTimes || {};

      const d =
        typeof maxDiameter === "number" && !isNaN(maxDiameter)
          ? maxDiameter
          : 8;
      let diameterKey = "d8";
      if (d <= 6) diameterKey = "d6";
      else if (d <= 8) diameterKey = "d8";
      else if (d <= 10) diameterKey = "d10";
      else diameterKey = "d12";

      const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;

      estimatedShipYmdRaw = await addKoreanBusinessDays({
        startYmd: todayYmd,
        days: leadDays,
      });
    }

    const estimatedShipYmd = await normalizeKoreanBusinessDay({
      ymd: estimatedShipYmdRaw,
    });

    const payload = {
      success: true,
      data: {
        estimatedShipYmd,
      },
    };

    if (process.env.NODE_ENV === "development") {
      console.log("[getShippingEstimate] ok", {
        estimatedShipYmd,
      });
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error("[getShippingEstimate] error", error);
    return res.status(500).json({
      success: false,
      message: "발송 예정일 계산 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 묶음 배송 후보 조회 (의뢰자용)
 * @route GET /api/requests/my/bulk-shipping
 */
export async function getMyBulkShipping(req, res) {
  try {
    const userId = req.user?._id?.toString();

    const requestFilter = await buildRequestorOrgScopeFilter(req);

    const leadDays = await getDeliveryEtaLeadDays();
    const effectiveLeadDays = {
      ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
      ...(leadDays || {}),
    };

    const resolveNormalLeadDays = (maxDiameter) => {
      const d =
        typeof maxDiameter === "number" && !Number.isNaN(maxDiameter)
          ? maxDiameter
          : maxDiameter != null && String(maxDiameter).trim()
            ? Number(maxDiameter)
            : null;
      if (d == null || Number.isNaN(d)) return effectiveLeadDays.d10;
      if (d <= 6) return effectiveLeadDays.d6;
      if (d <= 8) return effectiveLeadDays.d8;
      if (d <= 10) return effectiveLeadDays.d10;
      return effectiveLeadDays.d12;
    };

    // 배치 최적화: 같은 diameter는 1회만 계산
    const todayYmd = getTodayYmdInKst();
    const diameterCache = new Map();

    const getExpressShipYmd = async (maxDiameter) => {
      const key = String(maxDiameter ?? "-");
      if (!diameterCache.has(key)) {
        const raw = await memo({
          key: `expressShip:${todayYmd}:${key}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => calculateExpressShipYmd({ maxDiameter, baseYmd: todayYmd }),
        });
        const normalized = await memo({
          key: `krbiz:normalize:${raw}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => normalizeKoreanBusinessDay({ ymd: raw }),
        });
        diameterCache.set(key, normalized);
      }
      return diameterCache.get(key);
    };

    const resolveEstimatedShipYmds = async (r) => {
      const ci = r.caseInfos || {};
      const maxDiameter = ci.maxDiameter;
      const mode = r.shippingMode || "normal";
      const createdYmd = toKstYmd(r.createdAt) || todayYmd;

      const normalize = (ymd) =>
        memo({
          key: `krbiz:normalize:${ymd}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => normalizeKoreanBusinessDay({ ymd }),
        });

      const addBiz = ({ startYmd, days }) =>
        memo({
          key: `krbiz:add:${startYmd}:${days}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => addKoreanBusinessDays({ startYmd, days }),
        });

      const clampStart = (ymd) => (ymd < todayYmd ? todayYmd : ymd);

      if (mode === "express") {
        const days = resolveExpressShipLeadDays(maxDiameter);
        const originalRaw = await addBiz({ startYmd: createdYmd, days });
        const nextRaw = await addBiz({
          startYmd: clampStart(createdYmd),
          days,
        });
        return {
          original: await normalize(originalRaw),
          next: await normalize(nextRaw),
        };
      }

      const pickup = r.productionSchedule?.scheduledShipPickup;
      const pickupYmd = pickup ? toKstYmd(pickup) : null;
      if (pickupYmd) {
        const original = await normalize(pickupYmd);
        const next =
          pickupYmd < todayYmd ? await normalize(todayYmd) : original;
        return { original, next };
      }

      const requestedShipYmd = toKstYmd(r.requestedShipDate);
      if (requestedShipYmd) {
        const original = await normalize(requestedShipYmd);
        const next =
          requestedShipYmd < todayYmd ? await normalize(todayYmd) : original;
        return { original, next };
      }

      const leadDays = resolveNormalLeadDays(maxDiameter);
      const originalRaw = await addBiz({
        startYmd: createdYmd,
        days: leadDays,
      });
      const nextRaw = await addBiz({
        startYmd: clampStart(createdYmd),
        days: leadDays,
      });
      return {
        original: await normalize(originalRaw),
        next: await normalize(nextRaw),
      };
    };

    const requests = await Request.find({
      ...requestFilter,
      manufacturerStage: {
        $in: REQUEST_STAGE_GROUPS.bulkCandidateAll,
      },
    })
      .select(
        "requestId title manufacturerStage caseInfos shippingMode requestedShipDate createdAt timeline.estimatedShipYmd requestor productionSchedule",
      )
      .populate("requestor", "name organization")
      .lean();

    const mapItem = async (r) => {
      const ci = r.caseInfos || {};
      const clinic =
        r.requestor?.organization || r.requestor?.name || req.user?.name || "";
      const maxDiameter =
        typeof ci.maxDiameter === "number"
          ? `${ci.maxDiameter}mm`
          : ci.maxDiameter != null
            ? `${Number(ci.maxDiameter)}mm`
            : "";

      const { original: originalEstimatedShipYmd, next: nextEstimatedShipYmd } =
        await resolveEstimatedShipYmds(r);

      const timeline = r.timeline || {};
      const updates = {};
      if (timeline.originalEstimatedShipYmd !== originalEstimatedShipYmd) {
        updates["timeline.originalEstimatedShipYmd"] = originalEstimatedShipYmd;
      }
      if (timeline.nextEstimatedShipYmd !== nextEstimatedShipYmd) {
        updates["timeline.nextEstimatedShipYmd"] = nextEstimatedShipYmd;
      }
      if (timeline.estimatedShipYmd == null) {
        updates["timeline.estimatedShipYmd"] = originalEstimatedShipYmd;
      }
      if (Object.keys(updates).length > 0) {
        await Request.updateOne({ _id: r._id }, { $set: updates }).exec();
      }

      const estimatedShipYmd = nextEstimatedShipYmd || originalEstimatedShipYmd;

      const stageKey = normalizeRequestStage(r);
      const stageLabel = normalizeRequestStageLabel(r);

      return {
        id: r.requestId,
        mongoId: r._id,
        title: r.title,
        clinic,
        patient: ci.patientName || "",
        tooth: ci.tooth || "",
        diameter: maxDiameter,
        stage: r.manufacturerStage,
        stageKey,
        stageLabel,
        shippingMode: r.shippingMode || "normal",
        requestedShipDate: r.requestedShipDate,
        estimatedShipYmd,
        originalEstimatedShipYmd,
        nextEstimatedShipYmd,
      };
    };

    const [pre, post, waiting] = await Promise.all([
      Promise.all(
        requests
          .filter((r) => REQUEST_STAGE_GROUPS.pre.includes(r.manufacturerStage))
          .map(mapItem),
      ),
      Promise.all(
        requests
          .filter((r) =>
            REQUEST_STAGE_GROUPS.post.includes(r.manufacturerStage),
          )
          .map(mapItem),
      ),
      Promise.all(
        requests
          .filter((r) =>
            REQUEST_STAGE_GROUPS.waiting.includes(r.manufacturerStage),
          )
          .map(mapItem),
      ),
    ]);

    const responseData = { pre, post, waiting };

    return res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
    });
  } catch (error) {
    console.error("Error in getMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 후보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 발송 처리 (운송장 번호 등록 및 상태 변경)
 * @route POST /api/requests/shipping/register
 */
export async function registerShipment(req, res) {
  try {
    const { requestIds, trackingNumber, carrier = "hanjin" } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "운송장 번호가 필요합니다.",
      });
    }

    const requests = await Request.find({
      requestId: { $in: requestIds },
      manufacturerStage: "포장.발송",
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const updatedIds = [];

    for (const r of requests) {
      const scheduledPickup = r.productionSchedule?.scheduledShipPickup
        ? new Date(r.productionSchedule.scheduledShipPickup)
        : null;
      const now = new Date();
      const actualShipPickup =
        scheduledPickup && !Number.isNaN(scheduledPickup.getTime())
          ? scheduledPickup
          : now;
      // 1. Create or update DeliveryInfo
      let deliveryInfo = null;
      if (r.deliveryInfoRef) {
        deliveryInfo = await DeliveryInfo.findById(r.deliveryInfoRef);
      }

      if (!deliveryInfo) {
        deliveryInfo = await DeliveryInfo.create({
          request: r._id,
          trackingNumber,
          carrier,
          shippedAt: actualShipPickup,
        });
        r.deliveryInfoRef = deliveryInfo._id;
      } else {
        deliveryInfo.trackingNumber = trackingNumber;
        deliveryInfo.carrier = carrier;
        if (!deliveryInfo.shippedAt) {
          deliveryInfo.shippedAt = actualShipPickup;
        }
        await deliveryInfo.save();
      }

      // 2. Update Review Stage
      ensureReviewByStageDefaults(r);
      r.caseInfos.reviewByStage.shipping = {
        ...r.caseInfos.reviewByStage.shipping,
        status: "APPROVED",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };

      // 3. Move to Tracking Stage
      applyStatusMapping(r, "추적관리");

      // 4. Mark actual pickup + clear mailbox address
      r.productionSchedule = r.productionSchedule || {};
      r.productionSchedule.actualShipPickup = actualShipPickup;
      r.mailboxAddress = null;

      await r.save();
      updatedIds.push(r.requestId);
    }

    return res.status(200).json({
      success: true,
      message: `${updatedIds.length}건의 의뢰가 발송 처리되었습니다.`,
      data: {
        updatedIds,
      },
    });
  } catch (error) {
    console.error("Error in registerShipment:", error);
    return res.status(500).json({
      success: false,
      message: "발송 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
/**
 * 묶음 배송 생성/신청 (의뢰자용)
 * @route POST /api/requests/my/bulk-shipping
 */
export async function createMyBulkShipping(req, res) {
  try {
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const { requestIds } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    const requests = await Request.find({
      ...requestFilter,
      requestId: { $in: requestIds },
      manufacturerStage: { $in: REQUEST_STAGE_GROUPS.bulkCreateEligible },
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    for (const r of requests) {
      applyStatusMapping(r, "발송");
      await r.save();
    }

    return res.status(200).json({
      success: true,
      message: `${requests.length}건의 의뢰가 발송 상태로 변경되었습니다.`,
      data: {
        updatedIds: requests.map((r) => r.requestId),
      },
    });
  } catch (error) {
    console.error("Error in createMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 신청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
