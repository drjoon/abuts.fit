import Request from "../../models/request.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import hanjinService from "../../services/hanjin.service.js";
import { emitBgRuntimeStatus } from "../bg/bgRuntimeEvents.js";
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
import { emitCreditBalanceUpdatedToOrganization } from "../../utils/creditRealtime.js";

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

const extractTrackingNumberFromPickupData = (data) => {
  const candidates = [
    data?.trackingNumber,
    data?.waybillNumber,
    data?.wbl_num,
    data?.wblNum,
    data?.invoiceNo,
    data?.invoiceNumber,
    data?.orderNo,
    data?.orderNumber,
    data?.data?.trackingNumber,
    data?.data?.waybillNumber,
    data?.data?.wbl_num,
    data?.data?.wblNum,
    data?.result?.trackingNumber,
    data?.result?.waybillNumber,
    data?.result?.wbl_num,
    data?.result?.wblNum,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }
  return "";
};

async function ensureShippingPackageAndChargeFeeOnPickup({
  requests,
  actorUserId,
}) {
  const list = Array.isArray(requests) ? requests.filter(Boolean) : [];
  if (!list.length) {
    throw new Error("발송 패키지를 생성할 의뢰가 없습니다.");
  }

  const organizationIds = Array.from(
    new Set(
      list
        .map((request) => {
          const raw = getRequestorOrgId(request);
          const value = String(raw || "").trim();
          return Types.ObjectId.isValid(value) ? value : "";
        })
        .filter(Boolean),
    ),
  );

  if (organizationIds.length !== 1) {
    throw new Error(
      "우편함 묶음의 조직 정보가 일관되지 않아 발송 박스를 생성할 수 없습니다.",
    );
  }

  const organizationId = new Types.ObjectId(organizationIds[0]);
  const shipDateYmd = getTodayYmdInKst();

  let pkg = null;
  try {
    pkg = await ShippingPackage.findOneAndUpdate(
      { organizationId, shipDateYmd },
      {
        $setOnInsert: {
          organizationId,
          shipDateYmd,
          createdBy: actorUserId || null,
        },
        $addToSet: {
          requestIds: { $each: list.map((request) => request._id) },
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (error?.code === 11000 || message.includes("E11000")) {
      pkg = await ShippingPackage.findOne({ organizationId, shipDateYmd });
      if (pkg?._id) {
        await ShippingPackage.updateOne(
          { _id: pkg._id },
          {
            $addToSet: {
              requestIds: { $each: list.map((request) => request._id) },
            },
          },
        );
        pkg = await ShippingPackage.findById(pkg._id);
      }
    } else {
      throw error;
    }
  }

  if (!pkg?._id) {
    throw new Error("발송 박스 생성에 실패했습니다.");
  }

  const fee = Number(pkg.shippingFeeSupply || 0);
  if (fee > 0) {
    const uniqueKey = `shippingPackage:${String(pkg._id)}:shipping_fee`;
    const chargeResult = await CreditLedger.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          organizationId,
          userId: actorUserId || null,
          type: "SPEND",
          amount: -fee,
          refType: "SHIPPING_PACKAGE",
          refId: pkg._id,
          uniqueKey,
        },
      },
      { upsert: true },
    );

    if (chargeResult?.upsertedCount) {
      console.log("[SHIPPING_PICKUP_CHARGE] charged shipping fee", {
        organizationId: String(organizationId),
        shippingPackageId: String(pkg._id),
        fee,
        requestIds: list
          .map((request) => String(request.requestId || ""))
          .filter(Boolean),
      });
      await emitCreditBalanceUpdatedToOrganization({
        organizationId,
        balanceDelta: -fee,
        reason: "shipping_fee_spend",
        refId: pkg._id,
      });
    }
  }

  return pkg;
}

async function finalizeMailboxPickupShipment({
  requests,
  pickupData,
  actorUserId,
}) {
  const list = Array.isArray(requests) ? requests.filter(Boolean) : [];
  if (!list.length) return [];

  const pkg = await ensureShippingPackageAndChargeFeeOnPickup({
    requests: list,
    actorUserId,
  });
  const trackingNumber = extractTrackingNumberFromPickupData(pickupData);
  const actualShipPickup = new Date();
  const updatedIds = [];

  for (const request of list) {
    let deliveryInfo = null;
    if (request.deliveryInfoRef) {
      deliveryInfo = await DeliveryInfo.findById(request.deliveryInfoRef);
    }

    if (!deliveryInfo) {
      deliveryInfo = await DeliveryInfo.create({
        request: request._id,
        trackingNumber: trackingNumber || undefined,
        carrier: "hanjin",
        shippedAt: actualShipPickup,
      });
      request.deliveryInfoRef = deliveryInfo._id;
    } else {
      if (trackingNumber) {
        deliveryInfo.trackingNumber = trackingNumber;
      }
      deliveryInfo.carrier = "hanjin";
      if (!deliveryInfo.shippedAt) {
        deliveryInfo.shippedAt = actualShipPickup;
      }
      await deliveryInfo.save();
    }

    ensureReviewByStageDefaults(request);
    request.caseInfos.reviewByStage.shipping = {
      ...request.caseInfos.reviewByStage.shipping,
      status: "APPROVED",
      updatedAt: actualShipPickup,
      updatedBy: actorUserId || null,
      reason: "",
    };

    applyStatusMapping(request, "추적관리");
    request.productionSchedule = request.productionSchedule || {};
    request.productionSchedule.actualShipPickup = actualShipPickup;
    request.mailboxAddress = null;
    request.shippingPackageId = pkg._id;

    await request.save();
    updatedIds.push(String(request.requestId || "").trim());
  }

  console.log("[HANJIN_PICKUP_FINALIZED] finalized shipment", {
    shippingPackageId: String(pkg._id),
    trackingNumber: trackingNumber || null,
    requestIds: updatedIds,
  });

  return updatedIds;
}

async function resolveHanjinPayload({ mailboxAddresses, payload }) {
  if (payload && typeof payload === "object") {
    return {
      payload,
      metaByMsgKey: {},
      usedDbRequests: false,
      requestIds: [],
    };
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

  const built = buildHanjinDraftPayload(requests, list);

  return {
    payload: built.payload,
    metaByMsgKey: built.metaByMsgKey || {},
    usedDbRequests: true,
    requestIds: requests
      .map((req) => String(req?.requestId || "").trim())
      .filter(Boolean),
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

const normalizeHanjinZip = (value) => {
  const digits = String(value || "")
    .replace(/\D+/g, "")
    .trim();
  if (!digits) return "";
  if (digits.length >= 5) return digits.slice(0, 5);
  return digits;
};

const resolveLegacyScrewCode = (request) => {
  const manufacturer = String(
    request?.caseInfos?.implantManufacturer || "",
  ).trim();
  const isDentium = /\bDENTIUM\b/i.test(manufacturer)
    ? true
    : manufacturer.includes("덴티움");
  const legacy = isDentium ? "8B" : "0A";
  return legacy.split("").reverse().join("");
};

const resolveFullLotNumber = (request) => {
  const lot = request?.lotNumber || {};
  return (
    (typeof lot.value === "string" && lot.value.trim()) ||
    (typeof lot.material === "string" && lot.material.trim()) ||
    ""
  );
};

const resolveLotShortCode = (request) => {
  const fullLot = resolveFullLotNumber(request);
  if (!fullLot) return "";
  const token = fullLot.includes("-")
    ? fullLot.split("-").filter(Boolean).pop() || fullLot
    : fullLot;
  return token.trim();
};

const resolveMailboxCode = (request) =>
  String(request?.mailboxAddress || "").trim();

const resolveRequestOrganizationName = (request) => {
  const requestor = request?.requestor || {};
  const requestorOrg = request?.requestorOrganizationId || {};
  const extracted = requestorOrg?.extracted || {};
  return (
    String(requestorOrg?.name || "").trim() ||
    String(extracted?.companyName || "").trim() ||
    String(requestor?.organization || "").trim() ||
    String(request?.caseInfos?.clinicName || "").trim() ||
    String(requestor?.name || "").trim()
  );
};

const buildShippingRemark = ({
  mailboxCode,
  organizationName,
  requestCount,
}) => {
  const quantityLabel =
    Number.isFinite(Number(requestCount)) && Number(requestCount) > 0
      ? `${Math.round(Number(requestCount))}건`
      : "";
  return [
    String(mailboxCode || "").trim(),
    String(organizationName || "").trim(),
    quantityLabel,
  ]
    .filter(Boolean)
    .join(" / ");
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

  const receiverZip = normalizeHanjinZip(
    addr.zipCode || extracted.zipCode || "",
  );
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

  return list
    .filter((row) => row && row.result_code === "OK" && row.wbl_num)
    .map((row) => {
      const wbl = escapeZplText(row.wbl_num);
      const prtAdd = escapeZplText(row.prt_add || row.address || row.rcv_add);
      const tmlRaw = escapeZplText(row.tml_nam);
      const cenRaw = escapeZplText(row.cen_nam);
      const tml = isMeaningfulHanjinText(tmlRaw) ? tmlRaw : "";
      const cen = isMeaningfulHanjinText(cenRaw) ? cenRaw : "";
      const receiverName = escapeZplText(row.rcv_prn || row.rcv_nam || "");
      const receiverTel = escapeZplText(row.rcv_tel || row.rcv_hphn || "");
      const receiverZip = escapeZplText(row.rcv_zip || "");
      const senderName = escapeZplText(row.snd_prn || row.snd_nam || "");
      const senderTel = escapeZplText(row.snd_tel || row.snd_hphn || "");
      const senderAddr = escapeZplText(row.snd_add || row.snd_addr || "");
      const printedYmd = escapeZplText(row.prt_ymd || row.wbl_dt || "");
      const typeLabel = escapeZplText(row.pay_typ || row.fare_typ || "S");
      const remark = escapeZplText(row.remark || row.msg_key || "");
      const routeLarge = escapeZplText(tml || "CB");
      const routeMid = escapeZplText(cen || "650");

      return [
        "^XA",
        "^CI28",
        "^PW1218",
        "^LL812",
        "^LH0,0",
        "^FO18,18^GB1180,768,2^FS",
        "^FO18,58^GB1180,2,2^FS",
        "^FO18,150^GB1180,2,2^FS",
        "^FO18,290^GB1180,2,2^FS",
        "^FO18,428^GB1180,2,2^FS",
        "^FO18,562^GB1180,2,2^FS",
        "^FO700,58^GB2,92,2^FS",
        "^FO860,58^GB2,92,2^FS",
        "^FO980,58^GB2,92,2^FS",
        "^FO110,150^GB2,140,2^FS",
        "^FO110,428^GB2,134,2^FS",
        "^FO30,48^A0N,24,24^FD운송장번호^FS",
        `^FO150,44^A0N,30,30^FD${wbl}^FS`,
        "^FO520,44^A0N,18,18^FDP. 1^FS",
        "^FO590,44^A0N,18,18^FD1 / 1^FS",
        "^FO945,44^A0N,28,28^FD한진택배^FS",
        "^FO1045,44^A0N,18,18^FD1588-0011^FS",
        "^FO34,102^A0N,20,20^FD발도^FS",
        "^FO740,102^A0N,20,20^FD도착점^FS",
        "^FO892,102^A0N,20,20^FD권역^FS",
        "^FO1012,102^A0N,20,20^FD구분^FS",
        `^FO34,136^A0N,86,86^FD${routeLarge}^FS`,
        `^FO730,136^A0N,50,50^FD${routeMid}^FS`,
        receiverName ? `^FO730,186^A0N,24,24^FD${receiverName}^FS` : "",
        receiverZip ? `^FO880,136^A0N,48,48^FD${receiverZip}^FS` : "",
        remark ? `^FO1012,136^A0N,26,26^FB160,2,4,L,0^FD${remark}^FS` : "",
        "^FO44,202^A0B,24,24^FD받는분^FS",
        receiverName ? `^FO132,186^A0N,34,34^FD${receiverName}^FS` : "",
        receiverTel ? `^FO470,186^A0N,24,24^FD${receiverTel}^FS` : "",
        prtAdd ? `^FO132,234^A0N,28,28^FB1010,2,6,L,0^FD${prtAdd}^FS` : "",
        `^FO902,220^BCN,70,N,N,N^FD${wbl}^FS`,
        `^FO930,294^A0N,20,20^FD${wbl}^FS`,
        "^FO44,474^A0B,24,24^FD보내는분^FS",
        senderName ? `^FO132,462^A0N,26,26^FD${senderName}^FS` : "",
        senderTel ? `^FO480,462^A0N,22,22^FD${senderTel}^FS` : "",
        printedYmd ? `^FO882,462^A0N,20,20^FD${printedYmd}^FS` : "",
        `^FO1042,462^A0N,20,20^FDType:${typeLabel}^FS`,
        senderAddr
          ? `^FO132,514^A0N,20,20^FB900,2,4,L,0^FD${senderAddr}^FS`
          : "",
        remark ? `^FO34,596^A0N,28,28^FD비고^FS` : "",
        remark ? `^FO130,596^A0N,28,28^FB820,2,6,L,0^FD${remark}^FS` : "",
        "^FO34,728^A0N,16,16^FD개인정보 보호를 위하여 인수하신 화물의 운송장증을 폐기하여 주시기 바랍니다.^FS",
        `^FO904,620^BCN,88,N,N,N^FD${wbl}^FS`,
        `^FO836,736^A0N,18,18^FD운임Type:${typeLabel}^FS`,
        `^FO988,736^A0N,24,24^FD${wbl}^FS`,
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

const enrichHanjinAddressList = ({ addressList, metaByMsgKey = {} }) => {
  const list = Array.isArray(addressList) ? addressList : [];
  return list.map((row) => {
    const msgKey = String(row?.msg_key || "").trim();
    const meta = msgKey ? metaByMsgKey[msgKey] || {} : {};
    const senderAddr = [HANJIN_SENDER_BASE_ADDR, HANJIN_SENDER_DTL_ADDR]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ");
    return {
      ...row,
      snd_nam: String(
        row?.snd_nam || row?.snd_prn || HANJIN_SENDER_NAME || "",
      ).trim(),
      snd_prn: String(
        row?.snd_prn || row?.snd_nam || HANJIN_SENDER_NAME || "",
      ).trim(),
      snd_tel: String(
        row?.snd_tel || row?.snd_hphn || HANJIN_SENDER_TEL || "",
      ).trim(),
      snd_hphn: String(
        row?.snd_hphn ||
          row?.snd_tel ||
          HANJIN_SENDER_MOBILE ||
          HANJIN_SENDER_TEL ||
          "",
      ).trim(),
      snd_add: String(row?.snd_add || row?.snd_addr || senderAddr || "").trim(),
      snd_addr: String(
        row?.snd_addr || row?.snd_add || senderAddr || "",
      ).trim(),
      remark: String(row?.remark || meta?.remark || "").trim(),
      mailbox_code: String(row?.mailbox_code || meta?.mailboxCode || "").trim(),
      organization_name: String(
        row?.organization_name || meta?.organizationName || "",
      ).trim(),
      request_count: Number(row?.request_count || meta?.requestCount || 0),
      screw_code: String(row?.screw_code || meta?.screwCode || "").trim(),
      lot_short_code: String(
        row?.lot_short_code || meta?.lotShortCode || "",
      ).trim(),
      lot_full_number: String(
        row?.lot_full_number || meta?.lotFullNumber || "",
      ).trim(),
    };
  });
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

  const mailboxGroupMap = new Map();
  for (const r of requests) {
    const mailbox = String(r?.mailboxAddress || "").trim();
    if (!mailbox) continue;
    if (!mailboxGroupMap.has(mailbox)) {
      mailboxGroupMap.set(mailbox, []);
    }
    mailboxGroupMap.get(mailbox).push(r);
  }

  const metaByMsgKey = {};
  const addressList = Array.from(mailboxGroupMap.entries()).map(
    ([mailbox, group]) => {
      const first = Array.isArray(group) ? group[0] || {} : {};
      const requestor = first.requestor || {};
      const requestorOrg = first.requestorOrganizationId || {};
      const extracted = requestorOrg.extracted || {};
      const addr = requestor.address || {};

      const organizationName = resolveRequestOrganizationName(first);
      const addressText =
        addr.street ||
        addr.address1 ||
        addr.address2 ||
        requestor.addressText ||
        extracted.address ||
        "";

      const receiverZip = normalizeHanjinZip(
        addr.zipCode || extracted.zipCode || "",
      );

      const requestCount = Array.isArray(group) ? group.length : 0;
      const remark = buildShippingRemark({
        mailboxCode: mailbox,
        organizationName,
        requestCount,
      });

      const msgKey =
        `${mailbox || "-"} / ${organizationName || "-"} / ${requestCount}`
          .replace(/[\r\n]+/g, " ")
          .trim()
          .slice(0, 100);

      metaByMsgKey[msgKey] = {
        mailboxCode: mailbox,
        organizationName,
        requestCount,
        screwCode: resolveLegacyScrewCode(first),
        lotShortCode: resolveLotShortCode(first),
        lotFullNumber: resolveFullLotNumber(first),
        remark,
      };

      return {
        csr_num: HANJIN_CSR_NUM,
        snd_zip: HANJIN_SHIPPER_ZIP,
        rcv_zip: receiverZip,
        address: addressText,
        msg_key: msgKey,
        receiver_name:
          organizationName ||
          requestor.name ||
          extracted.representativeName ||
          extracted.companyName ||
          "",
        receiver_phone:
          requestor.phoneNumber ||
          extracted.phoneNumber ||
          requestor.phone ||
          "",
      };
    },
  );

  return {
    payload: {
      client_id: HANJIN_CLIENT_ID,
      csr_num: HANJIN_CSR_NUM,
      address_list: addressList,
    },
    metaByMsgKey,
  };
};

/**
 * 한진 운송장 출력 (메일박스 기준)
 * @route POST /api/requests/shipping/hanjin/print-labels
 */
export async function printHanjinLabels(req, res) {
  try {
    const { mailboxAddresses, payload, wblPrintOptions } = req.body || {};
    const runtimeRequestId = Array.isArray(payload?.address_list)
      ? String(payload?.address_list?.[0]?.msg_key || "").trim()
      : "";

    emitBgRuntimeStatus({
      requestId: runtimeRequestId || null,
      source: "wbls-server",
      stage: "shipping",
      status: "started",
      label: "운송장 출력중",
      tone: "slate",
      startedAt: new Date().toISOString(),
      metadata: {
        mailboxAddresses: Array.isArray(mailboxAddresses)
          ? mailboxAddresses
          : [],
      },
    });

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

    const runtimeRequestIds = Array.isArray(resolved?.requestIds)
      ? resolved.requestIds
      : [];
    const emitShippingRuntime = (payloadPerRequest) => {
      if (runtimeRequestIds.length > 0) {
        runtimeRequestIds.forEach((rid) => {
          emitBgRuntimeStatus({
            ...payloadPerRequest,
            requestId: rid,
          });
        });
        return;
      }
      emitBgRuntimeStatus({
        ...payloadPerRequest,
        requestId: null,
      });
    };

    emitShippingRuntime({
      source: "wbls-server",
      stage: "shipping",
      status: "started",
      label: "운송장 출력중",
      tone: "slate",
      startedAt: new Date().toISOString(),
      metadata: {
        mailboxAddresses: Array.isArray(mailboxAddresses)
          ? mailboxAddresses
          : [],
      },
    });

    const data = await hanjinService.requestPrintApi({
      path: path.replace("{client_id}", HANJIN_CLIENT_ID),
      method: "POST",
      data: resolved.payload,
    });

    const enrichedData =
      data && typeof data === "object"
        ? {
            ...data,
            address_list: enrichHanjinAddressList({
              addressList: data.address_list,
              metaByMsgKey: resolved.metaByMsgKey,
            }),
          }
        : data;

    const zplLabels =
      enrichedData && typeof enrichedData === "object"
        ? buildHanjinWblZplLabels({ addressList: enrichedData.address_list })
        : [];

    const shouldTriggerWblPrint =
      wblPrintOptions && typeof wblPrintOptions === "object";
    const wblPrint = shouldTriggerWblPrint
      ? await triggerWblServerPrint(enrichedData, wblPrintOptions)
      : { success: true, skipped: true, reason: "image_mode" };
    if (shouldTriggerWblPrint && !wblPrint?.success) {
      console.warn("[shipping] wbl print fallback needed", {
        reason: wblPrint?.reason || wblPrint?.message || "unknown",
        status: wblPrint?.status,
      });
    }

    const perRequestIdStatus = {};
    runtimeRequestIds.forEach((rid) => {
      perRequestIdStatus[rid] =
        wblPrint?.success === false ? "failed" : "completed";
    });

    if (runtimeRequestIds.length > 0) {
      runtimeRequestIds.forEach((rid) => {
        emitBgRuntimeStatus({
          requestId: rid,
          source: "wbls-server",
          stage: "shipping",
          status: perRequestIdStatus[rid],
          label:
            perRequestIdStatus[rid] === "failed"
              ? "운송장 출력 실패"
              : "운송장 출력 완료",
          tone: perRequestIdStatus[rid] === "failed" ? "rose" : "slate",
          clear: perRequestIdStatus[rid] !== "failed",
          metadata: {
            skipped: !!wblPrint?.skipped,
            message: wblPrint?.message || null,
            reason: wblPrint?.reason || null,
          },
        });
      });
    } else {
      emitBgRuntimeStatus({
        requestId: null,
        source: "wbls-server",
        stage: "shipping",
        status: wblPrint?.success === false ? "failed" : "completed",
        label:
          wblPrint?.success === false ? "운송장 출력 실패" : "운송장 출력 완료",
        tone: wblPrint?.success === false ? "rose" : "slate",
        clear: wblPrint?.success !== false,
        metadata: {
          skipped: !!wblPrint?.skipped,
          message: wblPrint?.message || null,
          reason: wblPrint?.reason || null,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...(enrichedData || {}),
        zplLabels,
      },
      wblPrint,
    });
  } catch (error) {
    console.error("Error in printHanjinLabels:", error);
    emitBgRuntimeStatus({
      requestId: null,
      source: "wbls-server",
      stage: "shipping",
      status: "failed",
      label: "운송장 출력 실패",
      tone: "rose",
      metadata: {
        message: error?.message || null,
      },
    });
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
      const requestDocs = await Request.find({
        _id: { $in: group.map((request) => request._id) },
        manufacturerStage: "포장.발송",
      });

      const updatedIds = await finalizeMailboxPickupShipment({
        requests: requestDocs,
        pickupData: data,
        actorUserId: req.user?._id || null,
      });

      results.push({ mailbox, success: true, data, updatedIds });
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

    // Only normal (bulk) shipping mode is supported now
    if (shippingMode !== "normal") {
      return res.status(400).json({
        success: false,
        message: "묶음 배송만 지원됩니다.",
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

          // Fetch requestor weeklyBatchDays for normal mode
          let weeklyBatchDaysForSchedule = [];
          if (shippingMode === "normal") {
            try {
              const orgId = getRequestorOrgId({ user: req.requestor });
              if (orgId && Types.ObjectId.isValid(orgId)) {
                const org = await RequestorOrganization.findById(orgId)
                  .select({ "shippingPolicy.weeklyBatchDays": 1 })
                  .lean();
                weeklyBatchDaysForSchedule = Array.isArray(
                  org?.shippingPolicy?.weeklyBatchDays,
                )
                  ? org.shippingPolicy.weeklyBatchDays
                  : [];
              }
            } catch (e) {
              // Continue without batch days
            }
          }

          // 생산 스케줄 재계산
          const newSchedule = recalculateProductionSchedule({
            currentStage: req.manufacturerStage,
            newShippingMode: shippingMode,
            maxDiameter,
            requestedAt,
            weeklyBatchDays: weeklyBatchDaysForSchedule,
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

          const pickupYmd = newSchedule?.scheduledShipPickup
            ? toKstYmd(newSchedule.scheduledShipPickup)
            : null;

          if (pickupYmd) {
            req.timeline.estimatedShipYmd = pickupYmd;
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
      weeklyBatchDays: mode === "normal" ? requestorWeeklyBatchDays : [],
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

    const pkg = await ensureShippingPackageAndChargeFeeOnPickup({
      requests,
      actorUserId: req.user?._id || null,
    });

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
      r.shippingPackageId = pkg._id;

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
