import Request from "../../models/request.model.js";
import hanjinService from "../../services/hanjin.service.js";
import { getTodayYmdInKst } from "./utils.js";

export const HANJIN_CLIENT_ID = String(
  process.env.HANJIN_CLIENT_ID || "",
).trim();
const HANJIN_CSR_NUM = String(process.env.HANJIN_CSR_NUM || "").trim();
console.log(
  "[hanjin][init] 계약번호(HANJIN_CSR_NUM):",
  HANJIN_CSR_NUM || "(미설정)",
);
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

const HANJIN_PATH_FALLBACKS = {
  HANJIN_PRINT_WBL_PATH: "/v1/wbl/{client_id}/print-wbls",
  HANJIN_PICKUP_REQUEST_PATH: "/parcel-delivery/v1/order/insert-order",
  HANJIN_PICKUP_CANCEL_PATH: "/parcel-delivery/v1/order/cancel-order",
  HANJIN_CUSTOMER_CHECK_PATH: "/parcel-delivery/v1/customer/customer-check",
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

export const resolveMailboxList = (mailboxAddresses) =>
  Array.isArray(mailboxAddresses)
    ? mailboxAddresses.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

export const resolveHanjinPath = (envKey, fallbackPath) => {
  const raw = String(process.env[envKey] || "").trim();
  if (raw) return raw;
  return fallbackPath || "";
};

export const buildHanjinPathCandidates = (rawPath) => {
  const path = String(rawPath || "").trim();
  if (!path) return [];
  const candidates = [path];
  if (path.startsWith("/api/")) {
    candidates.push(path.replace(/^\/api\//, "/"));
  }
  return [...new Set(candidates)];
};

export const getHanjinPathFallbacks = () => HANJIN_PATH_FALLBACKS;

export const getWblPrintSettingsPayload = () => ({
  printer: {
    default: WBL_PRINTER_DEFAULT || null,
  },
  media: {
    default: WBL_MEDIA_DEFAULT || null,
    options: WBL_MEDIA_OPTIONS,
  },
});

export const ensureHanjinEnv = () => {
  if (!HANJIN_CLIENT_ID) {
    throw Object.assign(new Error("HANJIN_CLIENT_ID가 설정되지 않았습니다."), {
      statusCode: 500,
    });
  }
  if (!HANJIN_CSR_NUM) {
    throw Object.assign(new Error("HANJIN_CSR_NUM이 설정되지 않았습니다."), {
      statusCode: 500,
    });
  }
  if (!HANJIN_SHIPPER_ZIP) {
    throw Object.assign(
      new Error("HANJIN_SHIPPER_ZIP이 설정되지 않았습니다."),
      {
        statusCode: 500,
      },
    );
  }
};

const ensureHanjinSenderEnv = () => {
  if (!HANJIN_SENDER_ZIP)
    throw Object.assign(
      new Error("HANJIN_SENDER_ZIP 환경 변수가 필요합니다."),
      { statusCode: 500 },
    );
  if (!HANJIN_SENDER_BASE_ADDR)
    throw Object.assign(
      new Error("HANJIN_SENDER_BASE_ADDR 환경 변수가 필요합니다."),
      { statusCode: 500 },
    );
  if (!HANJIN_SENDER_DTL_ADDR)
    throw Object.assign(
      new Error("HANJIN_SENDER_DTL_ADDR 환경 변수가 필요합니다."),
      { statusCode: 500 },
    );
  if (!HANJIN_SENDER_NAME)
    throw Object.assign(
      new Error("HANJIN_SENDER_NAME 환경 변수가 필요합니다."),
      { statusCode: 500 },
    );
  if (!HANJIN_SENDER_TEL)
    throw Object.assign(
      new Error("HANJIN_SENDER_TEL 환경 변수가 필요합니다."),
      { statusCode: 500 },
    );
};

const normalizeHanjinZip = (value) => {
  const digits = String(value || "")
    .replace(/\D+/g, "")
    .trim();
  if (!digits) return "";
  if (digits.length === 5) return digits;
  return digits.slice(0, 5);
};

const resolveMailboxCode = (request) =>
  String(request?.mailboxAddress || request?.mailbox || "").trim();

const resolveBusinessOrganization = (request) => {
  const candidates = [
    request?.requestorBusinessAnchor,
    request?.businessAnchorId,
    request?.business,
    request?.requestor?.businessInfo,
  ];
  return candidates.find((c) => c && typeof c === "object" && c._id) || null;
};

// SSOT: metadata 사용 (extracted 레거시 제거)
const resolveOrganizationMeta = (business) => {
  if (!business || typeof business !== "object") return {};
  return business.metadata && typeof business.metadata === "object"
    ? business.metadata
    : {};
};

const resolveRequestOrganizationName = (request) => {
  const requestor = request?.requestor || {};
  const business = resolveBusinessOrganization(request);
  const metadata = resolveOrganizationMeta(business);
  return (
    business?.name ||
    metadata?.companyName ||
    requestor?.business ||
    request?.caseInfos?.clinicName ||
    requestor?.name ||
    ""
  );
};

const resolveReceiverZipSource = (request) => {
  const requestor = request?.requestor || {};
  const business = resolveBusinessOrganization(request);
  const metadata = resolveOrganizationMeta(business);
  return (
    requestor?.address?.postalCode ||
    requestor?.zipCode ||
    requestor?.postalCode ||
    metadata?.zipCode ||
    metadata?.postalCode ||
    ""
  );
};

const normalizeReceiverAddressForHanjin = (request) => {
  const requestor = request?.requestor || {};
  const business = resolveBusinessOrganization(request);
  const metadata = resolveOrganizationMeta(business);
  const addressCandidates = [
    requestor?.addressText,
    requestor?.address?.roadAddress,
    requestor?.address?.address1,
    requestor?.address,
    metadata?.address,
    metadata?.address1,
  ];
  return (
    addressCandidates
      .map((value) => String(value || "").trim())
      .find(Boolean) || ""
  );
};

const resolveReceiverDetailAddress = (request) => {
  const requestor = request?.requestor || {};
  const business = resolveBusinessOrganization(request);
  const metadata = resolveOrganizationMeta(business);
  const candidates = [
    requestor?.address?.detailAddress,
    requestor?.address?.address2,
    requestor?.address?.detail,
    requestor?.detailAddress,
    metadata?.addressDetail,
    metadata?.detailAddress,
    metadata?.address2,
  ];
  const resolvedCandidate =
    candidates.map((value) => String(value || "").trim()).find(Boolean) || "";

  if (resolvedCandidate) return resolvedCandidate;

  const baseAddress = normalizeReceiverAddressForHanjin(request);
  if (baseAddress) return "상세주소없음";

  return "";
};

const logMissingReceiverAddressDiagnostics = ({ request, mailbox, reason }) => {
  try {
    const requestor = request?.requestor || {};
    const business = resolveBusinessOrganization(request);
    const extracted = resolveOrganizationMeta(business);
    const normalizedBaseAddress = normalizeReceiverAddressForHanjin(request);
    const normalizedDetailAddress = resolveReceiverDetailAddress(request);
    console.error("[hanjin][address] missing receiver address", {
      reason,
      mailbox: String(mailbox || "").trim() || null,
      requestId: String(request?.requestId || "").trim() || null,
      requestMongoId: String(request?._id || "").trim() || null,
      organizationName:
        String(business?.name || extracted?.companyName || "").trim() || null,
      requestorAddressText: String(requestor?.addressText || "").trim() || null,
      requestorAddress1:
        String(
          requestor?.address?.address1 || requestor?.address?.roadAddress || "",
        ).trim() || null,
      requestorAddress2:
        String(
          requestor?.address?.address2 ||
            requestor?.address?.detailAddress ||
            requestor?.detailAddress ||
            "",
        ).trim() || null,
      requestorRoadAddress:
        String(requestor?.address?.roadAddress || "").trim() || null,
      requestorDetailAddress:
        String(requestor?.address?.detailAddress || "").trim() || null,
      requestorZip:
        String(
          requestor?.address?.postalCode ||
            requestor?.zipCode ||
            requestor?.address?.zipCode ||
            "",
        ).trim() || null,
      organizationExtractedAddress:
        String(extracted?.address || extracted?.address1 || "").trim() || null,
      organizationExtractedDetailAddress:
        String(
          extracted?.addressDetail ||
            extracted?.detailAddress ||
            extracted?.address2 ||
            "",
        ).trim() || null,
      organizationZip:
        String(extracted?.zipCode || extracted?.postalCode || "").trim() ||
        null,
      extractedRepresentativeName:
        String(extracted?.representativeName || "").trim() || null,
    });
  } catch (error) {
    console.error("[hanjin][address] diagnostics logging failed", error);
  }
};

const fetchWblServerSenderInfo = async () => {
  if (!WBL_PRINT_SERVER_BASE) {
    console.warn("[hanjin][sender] WBL_PRINT_SERVER_BASE 미설정");
    return null;
  }
  try {
    const headers = { "Content-Type": "application/json" };
    if (WBL_PRINT_SHARED_SECRET)
      headers["x-wbl-secret"] = WBL_PRINT_SHARED_SECRET;
    const url = `${WBL_PRINT_SERVER_BASE}/print-settings`;
    console.log("[hanjin][sender] wbls-server 발신인 정보 요청", { url });
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });
    console.log("[hanjin][sender] 응답", {
      status: response.status,
      ok: response.ok,
    });
    if (!response.ok) return null;
    const data = await response.json();
    console.log("[hanjin][sender] 파싱 결과", { sender: data?.sender });
    return data?.sender || null;
  } catch (error) {
    console.error("[hanjin][sender] fetch 실패", {
      message: error.message,
      name: error.name,
    });
    return null;
  }
};

export const buildResolvedLabelData = ({
  data,
  metaByMsgKey = {},
  payloadAddressList = [],
  senderOverride = null,
}) => {
  const payloadByMsgKey = Object.fromEntries(
    payloadAddressList
      .map((row) => {
        const msgKey = String(row?.msg_key || row?.msgKey || "").trim();
        return msgKey ? [msgKey, row] : null;
      })
      .filter(Boolean),
  );

  const enrichedData =
    data && typeof data === "object"
      ? {
          ...data,
          address_list: enrichHanjinAddressList({
            addressList: data.address_list,
            metaByMsgKey,
            payloadByMsgKey,
            senderOverride,
          }),
        }
      : data;

  const zplLabels =
    enrichedData && typeof enrichedData === "object"
      ? buildHanjinWblZplLabels({ addressList: enrichedData.address_list })
      : [];

  return {
    ...(enrichedData || {}),
    zplLabels,
  };
};

export const executeHanjinLabelPrint = async ({
  path,
  payload,
  metaByMsgKey,
  wblPrintOptions,
}) => {
  console.log(
    "[shipping][hanjin-print] requesting official Hanjin print data",
    {
      mailboxCount: Array.isArray(payload?.address_list)
        ? payload.address_list.length
        : 0,
    },
  );

  const resolvedPath = String(path || "")
    .replace("{client_id}", HANJIN_CLIENT_ID)
    .trim();
  if (!resolvedPath) {
    throw Object.assign(new Error("한진 운송장 출력 경로가 비어 있습니다."), {
      statusCode: 500,
    });
  }

  const senderInfo = await fetchWblServerSenderInfo();
  if (senderInfo) {
    console.log("[hanjin][label] wbls-server 발신인 정보 사용", senderInfo);
  }

  const data = await hanjinService.requestPrintApi({
    path: resolvedPath,
    method: "POST",
    data: payload,
  });

  const responseAddressList = Array.isArray(data?.address_list)
    ? data.address_list
    : [];

  console.log("[hanjin][zpl-generation] processing address list", {
    count: responseAddressList.length,
    firstRowPreview:
      responseAddressList.length > 0
        ? {
            msg_key: responseAddressList[0]?.msg_key,
            hub_cod: responseAddressList[0]?.hub_cod,
            tml_cod: responseAddressList[0]?.tml_cod,
            dom_mid: responseAddressList[0]?.dom_mid,
            cen_cod: responseAddressList[0]?.cen_cod,
            cen_nam: responseAddressList[0]?.cen_nam,
            s_tml_cod: responseAddressList[0]?.s_tml_cod,
            s_tml_nam: responseAddressList[0]?.s_tml_nam,
            grp_rnk: responseAddressList[0]?.grp_rnk,
            es_nam: responseAddressList[0]?.es_nam,
            dom_rgn: responseAddressList[0]?.dom_rgn,
            es_cod: responseAddressList[0]?.es_cod,
            prt_add: responseAddressList[0]?.prt_add,
            wbl_num: responseAddressList[0]?.wbl_num,
          }
        : null,
  });

  const errorCount = Number(data?.error_cnt || data?.errorCnt || 0);
  const addressList = responseAddressList;
  const failedRows = addressList.filter(
    (row) =>
      String(row?.result_code || row?.resultCode || "OK").trim() !== "OK",
  );
  if (errorCount > 0 || failedRows.length) {
    const firstFailed = failedRows[0] || null;
    const message =
      String(
        firstFailed?.result_message ||
          firstFailed?.resultMessage ||
          data?.resultMessage ||
          "한진 운송장 출력에 실패했습니다.",
      ).trim() || "한진 운송장 출력에 실패했습니다.";
    throw Object.assign(new Error(message), {
      statusCode: 502,
      data: {
        ...(data && typeof data === "object" ? data : {}),
        failedRows,
        message,
      },
    });
  }

  const labelData = buildResolvedLabelData({
    data,
    metaByMsgKey,
    payloadAddressList: payload?.address_list,
    senderOverride: senderInfo,
  });

  const shouldTriggerWblPrint =
    wblPrintOptions && typeof wblPrintOptions === "object";

  // wblPrintOptions에서 출력 모드 감지
  // shippingOutputMode: "image" (PDF 저장) 또는 "label" (실제 라벨 출력)
  const shippingOutputMode = String(
    wblPrintOptions?.shippingOutputMode || "label",
  )
    .trim()
    .toLowerCase();
  const outputMode = shippingOutputMode === "image" ? "pdf" : "print";
  const printMode = String(wblPrintOptions?.printMode || "pdf")
    .trim()
    .toLowerCase();

  const wblPrint = shouldTriggerWblPrint
    ? await triggerWblServerPrint(labelData, {
        ...wblPrintOptions,
        outputMode,
        printMode,
      })
    : { success: true, skipped: true, reason: "no_wbl_print_options" };

  return { labelData, wblPrint };
};

export const executeCachedLabelPrint = async ({
  cachedZplLabels = [],
  cachedAddressList = [],
  wblPrintOptions,
}) => {
  const zplLabels = Array.isArray(cachedZplLabels)
    ? cachedZplLabels.map((value) => String(value || "")).filter(Boolean)
    : [];
  if (!zplLabels.length) {
    throw Object.assign(
      new Error("재출력에 사용할 캐시 라벨 데이터가 없습니다."),
      {
        statusCode: 400,
      },
    );
  }

  const labelData = {
    address_list: Array.isArray(cachedAddressList) ? cachedAddressList : [],
    zplLabels,
  };
  const shouldTriggerWblPrint =
    wblPrintOptions && typeof wblPrintOptions === "object";
  const shippingOutputMode = String(
    wblPrintOptions?.shippingOutputMode || "label",
  )
    .trim()
    .toLowerCase();
  const outputMode = shippingOutputMode === "image" ? "pdf" : "print";
  const printMode = String(wblPrintOptions?.printMode || "pdf")
    .trim()
    .toLowerCase();

  const wblPrint = shouldTriggerWblPrint
    ? await triggerWblServerPrint(labelData, {
        ...wblPrintOptions,
        outputMode,
        printMode,
      })
    : { success: true, skipped: true, reason: "no_wbl_print_options" };

  return { labelData, wblPrint };
};

const requestWblServerPrint = async ({ zpl, body }) => {
  const headers = { "Content-Type": "application/json" };
  if (WBL_PRINT_SHARED_SECRET) {
    headers["x-wbl-secret"] = WBL_PRINT_SHARED_SECRET;
  }

  const controller = new AbortController();
  const timeoutMs = Number.isFinite(WBL_DOWNLOAD_TIMEOUT_MS)
    ? Math.max(1000, WBL_DOWNLOAD_TIMEOUT_MS)
    : 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const targetUrl = `${WBL_PRINT_SERVER_BASE}/print-zpl`;
  const startTime = Date.now();
  console.log("[wbl-print] → POST /print-zpl 요청 시작", {
    url: targetUrl,
    printer: body?.printer,
    paperProfile: body?.paperProfile,
    saveMode: body?.saveMode,
    zplLength: String(zpl || "").length,
    zplPreview: String(zpl || "").slice(0, 80),
    timeoutMs,
    hasSecret: Boolean(WBL_PRINT_SHARED_SECRET),
  });

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ zpl, ...body }),
      signal: controller.signal,
    });

    const data = await response.json();
    const elapsedMs = Date.now() - startTime;
    console.log("[wbl-print] ← /print-zpl 응답 수신", {
      url: targetUrl,
      elapsedMs,
      elapsedSec: (elapsedMs / 1000).toFixed(2),
      status: response.status,
      ok: response.ok,
      responseData: data,
    });

    return {
      success: response.ok,
      status: response.status,
      ...data,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const dispatchWblServerPrint = ({ zpl, body }) => {
  console.log("[wbl-print][dispatch] 비동기 출력 요청 시작", {
    printer: body?.printer,
    paperProfile: body?.paperProfile,
    zplLength: String(zpl || "").length,
  });
  void requestWblServerPrint({ zpl, body })
    .then((result) => {
      console.log("[wbl-print][dispatch] 비동기 출력 완료", {
        success: result?.success,
        status: result?.status,
        data: result,
      });
    })
    .catch((error) => {
      console.error("[wbl-print][dispatch] 비동기 출력 실패", {
        printer: body?.printer,
        message: error?.message,
        stack: error?.stack?.split("\n").slice(0, 4).join(" | "),
      });
    });
};

export const executeHanjinOrderApiWithFallback = async ({
  pathCandidates,
  data,
  logPrefix = "[hanjin][order]",
}) => {
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
      console.error(`${logPrefix} candidate failed`, {
        candidate,
        status: err?.status,
        message: err?.message,
        response: err?.data,
      });
      lastError = err;
      if (err?.status !== 404) {
        throw err;
      }
    }
  }
  throw lastError;
};

export const buildHanjinOrderFallbackCaller =
  ({ pathCandidates, logPrefix }) =>
  async ({ data }) => {
    const out = await executeHanjinOrderApiWithFallback({
      pathCandidates,
      data,
      logPrefix,
    });
    return out;
  };

export const findPackingStageRequestsByMailboxes = async (
  mailboxAddresses = [],
  options = {},
) => {
  const list = resolveMailboxList(mailboxAddresses);
  if (!list.length) return [];

  let query = Request.find({
    mailboxAddress: { $in: list },
    manufacturerStage: "포장.발송",
  });

  if (options.populateRequestor !== false) {
    query = query.populate("requestor", "name business phoneNumber address");
    query = query.populate("businessAnchorId", "name metadata");
  }

  if (options.select && typeof options.select === "object") {
    query = query.select(options.select);
  }

  if (options.lean) {
    query = query.lean();
  }

  return query;
};

export const resolveHanjinPayload = async function ({
  mailboxAddresses,
  payload,
}) {
  const preResolvedRequests = Array.isArray(this?.requests)
    ? this.requests
    : null;
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

  const requests = preResolvedRequests?.length
    ? preResolvedRequests
    : await findPackingStageRequestsByMailboxes(list, { lean: true });

  if (!requests.length) {
    const error = new Error("조건에 맞는 의뢰를 찾을 수 없습니다.");
    error.statusCode = 404;
    throw error;
  }

  const built = await buildHanjinDraftPayload(requests);

  return {
    payload: built.payload,
    metaByMsgKey: built.metaByMsgKey || {},
    usedDbRequests: true,
    requestIds: requests
      .map((req) => String(req?.requestId || "").trim())
      .filter(Boolean),
  };
};

export const buildHanjinInsertOrderBody = async ({ mailbox, requests }) => {
  ensureHanjinEnv();
  ensureHanjinSenderEnv();

  const list = Array.isArray(requests) ? requests : [];
  const first = list[0] || {};
  const organizationName = resolveRequestOrganizationName(first);
  const receiverZip = normalizeHanjinZip(resolveReceiverZipSource(first));
  const addressText = normalizeReceiverAddressForHanjin(first);
  const receiverDetail = resolveReceiverDetailAddress(first);
  if (!receiverDetail) {
    logMissingReceiverAddressDiagnostics({
      request: first,
      mailbox,
      reason: "missing_rcvrDtlAddr",
    });
    throw Object.assign(
      new Error(
        "수하인 상세주소(rcvrDtlAddr)가 비어 있어 한진 택배 접수를 진행할 수 없습니다. (사업자 상세주소를 입력해주세요)",
      ),
      { statusCode: 400 },
    );
  }
  // KST 기준 오늘 날짜 (YYYYMMDD)
  const todayYmd = getTodayYmdInKst();
  const ymd = todayYmd.replace(/-/g, "");
  const custOrdNo = `ABUTS_${ymd}_${String(mailbox || "-")}`.slice(0, 30);
  const receiverPhone = String(first?.requestor?.phoneNumber || "").trim();

  console.log(
    "[hanjin][insert-order] 계약번호(cntractNo):",
    HANJIN_CSR_NUM || "(미설정)",
  );
  return {
    custEdiCd: HANJIN_CLIENT_ID,
    custOrdNo,
    cntractNo: HANJIN_CSR_NUM,
    svcCatCd: "S",
    pickupAskDt: ymd,
    sndrZip: HANJIN_SENDER_ZIP,
    sndrBaseAddr: HANJIN_SENDER_BASE_ADDR,
    sndrDtlAddr: HANJIN_SENDER_DTL_ADDR,
    sndrNm: HANJIN_SENDER_NAME,
    sndrTelNo: HANJIN_SENDER_TEL,
    sndrMobileNo: HANJIN_SENDER_MOBILE || HANJIN_SENDER_TEL,
    rcvrZip: receiverZip,
    rcvrBaseAddr: addressText,
    rcvrDtlAddr: receiverDetail,
    rcvrNm: organizationName,
    rcvrTelNo: receiverPhone,
    rcvrMobileNo: receiverPhone,
    comodityNm: "의료기기",
    payTypCd: "PP",
    boxTypCd: "B",
    comodityList: [
      {
        comodityNm: "의료기기",
        comodityCnt: 1,
      },
    ],
  };
};

const buildHanjinDraftPayload = async (requests) => {
  ensureHanjinEnv();

  const mailboxGroupMap = new Map();
  for (const r of requests) {
    const mailbox = String(r?.mailboxAddress || "").trim();
    if (!mailbox) continue;
    if (!mailboxGroupMap.has(mailbox)) mailboxGroupMap.set(mailbox, []);
    mailboxGroupMap.get(mailbox).push(r);
  }

  const metaByMsgKey = {};
  const addressList = Array.from(mailboxGroupMap.entries()).map(
    ([mailbox, group]) => {
      const first = group[0] || {};
      const requestor = first.requestor || {};
      const business = resolveBusinessOrganization(first);
      const extracted = resolveOrganizationMeta(business);
      const organizationName = resolveRequestOrganizationName(first);
      const addressText = normalizeReceiverAddressForHanjin(first);
      const receiverZip = normalizeHanjinZip(resolveReceiverZipSource(first));
      const msgKey = String(mailbox || "").trim();

      if (!String(addressText || "").trim()) {
        logMissingReceiverAddressDiagnostics({
          request: first,
          mailbox: msgKey,
          reason: "missing_print_address",
        });
        throw Object.assign(
          new Error(
            `${resolveMailboxCode(first) || msgKey || "우편함"}: 수하인 주소(address)가 비어 있어 운송장 출력을 진행할 수 없습니다.`,
          ),
          { statusCode: 400 },
        );
      }

      metaByMsgKey[msgKey] = {
        mailbox_code: resolveMailboxCode(first),
        organization_name: organizationName,
        request_count: group.length,
        remark: [
          resolveMailboxCode(first),
          organizationName,
          `${group.length}건`,
        ]
          .filter(Boolean)
          .join(" / "),
      };

      return {
        client_id: HANJIN_CLIENT_ID,
        csr_num: HANJIN_CSR_NUM,
        snd_zip: HANJIN_SHIPPER_ZIP,
        rcv_zip: receiverZip,
        address: addressText,
        rcv_addr: addressText,
        rcvrBaseAddr: addressText,
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

  console.log(
    "[hanjin][print-wbls] 계약번호(csr_num):",
    HANJIN_CSR_NUM || "(미설정)",
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

export const debugHanjinPrintPayload = () => {};

const enrichHanjinAddressList = ({
  addressList,
  metaByMsgKey,
  payloadByMsgKey = {},
  senderOverride = null,
}) =>
  (Array.isArray(addressList) ? addressList : []).map((row) => {
    const msgKey = String(row?.msg_key || row?.msgKey || "").trim();
    const meta = metaByMsgKey?.[msgKey] || {};
    const payloadRow = payloadByMsgKey?.[msgKey] || {};
    const senderName =
      String(senderOverride?.name || "").trim() || HANJIN_SENDER_NAME;
    const senderTel =
      String(senderOverride?.tel || "").trim() || HANJIN_SENDER_TEL;
    const senderMobile =
      String(senderOverride?.mobile || "").trim() ||
      HANJIN_SENDER_MOBILE ||
      senderTel;
    const senderAddress = [
      String(senderOverride?.baseAddr || "").trim() || HANJIN_SENDER_BASE_ADDR,
      String(senderOverride?.dtlAddr || "").trim() || HANJIN_SENDER_DTL_ADDR,
    ]
      .filter(Boolean)
      .join(" ");

    if (!senderName || !senderTel || !senderAddress) {
      console.warn("[hanjin][enrich] 발신인 정보 누락", {
        msgKey,
        senderOverride,
        computed: { senderName, senderTel, senderAddress },
        env: {
          HANJIN_SENDER_NAME,
          HANJIN_SENDER_TEL,
          HANJIN_SENDER_BASE_ADDR,
          HANJIN_SENDER_DTL_ADDR,
        },
        rowOriginal: {
          snd_prn: row?.snd_prn,
          snd_nam: row?.snd_nam,
          snd_tel: row?.snd_tel,
          snd_add: row?.snd_add,
        },
      });
    }

    return {
      ...payloadRow,
      ...row,
      mailbox_code: meta.mailbox_code || row?.mailbox_code || null,
      organization_name:
        meta.organization_name || row?.organization_name || null,
      request_count: meta.request_count || row?.request_count || null,
      remark: meta.remark || row?.remark || null,
      receiver_name:
        row?.receiver_name ||
        payloadRow?.receiver_name ||
        payloadRow?.rcv_prn ||
        null,
      receiver_phone:
        row?.receiver_phone ||
        payloadRow?.receiver_phone ||
        payloadRow?.rcv_tel ||
        null,
      rcv_addr:
        row?.rcv_addr || payloadRow?.rcv_addr || payloadRow?.address || null,
      address:
        row?.address || payloadRow?.address || payloadRow?.rcv_addr || null,
      snd_prn: senderName || null,
      snd_nam: senderName || null,
      snd_tel: senderTel || null,
      snd_hphn: senderMobile || null,
      snd_add: senderAddress || null,
      snd_addr: senderAddress || null,
    };
  });

const buildHanjinWblZplLabels = ({ addressList }) => {
  const filtered = (Array.isArray(addressList) ? addressList : []).filter(
    (row) =>
      String(row?.result_code || row?.resultCode || "OK").trim() === "OK",
  );

  const zplLabels = filtered
    .map((row) => {
      // 한진 API 응답 필드 추출 (첨4 명세표 기준)
      const wblNum = String(row?.wbl_num || "").trim(); // ⑨ 운송장번호
      const hubCod = String(row?.hub_cod || "").trim(); // ① 허브코드(대분류)
      const tmlCod = String(row?.tml_cod || "").trim(); // ② 도착지터미널코드
      const tmlNam = String(row?.tml_nam || "").trim(); // 도착지터미널명 (화면용)
      const domMid = String(row?.dom_mid || "").trim(); // ④ 중분류코드
      const cenCod = String(row?.cen_cod || "").trim(); // ⑤ 집배점코드
      const cenNam = String(row?.cen_nam || "").trim(); // ⑥ 집배점명
      const sTmlCod = String(row?.s_tml_cod || "").trim(); // ⑦ 발송터미널코드
      const sTmlNam = String(row?.s_tml_nam || "").trim(); // ⑧ 발송터미널명
      const grpRnk = String(row?.grp_rnk || "").trim(); // ⑩ 소분류코드-배송사원
      const esNam = String(row?.es_nam || "").trim(); // ⑪ 배송사원명
      const prtAdd = String(row?.prt_add || "").trim(); // ⑫ 주소출력정보
      const domRgn = String(row?.dom_rgn || "").trim(); // ⑮ 권역구분 (1:수도권/2~6:지방/7:제주/9:도서지역)
      const esCod = String(row?.es_cod || "").trim(); // ⑯ 배송사원분류코드

      // 수신인 정보
      const receiverName = String(
        row?.receiver_name || row?.rcv_prn || "",
      ).trim();
      const receiverPhone = String(
        row?.receiver_phone || row?.rcv_tel || "",
      ).trim();
      const receiverAddr = String(row?.rcv_add || row?.address || "").trim();
      // 발신인 정보
      const senderName = String(row?.snd_prn || row?.snd_nam || "").trim();
      const senderPhone = String(row?.snd_tel || row?.snd_hphn || "").trim();
      const senderAddr = String(row?.snd_add || row?.snd_addr || "").trim();

      if (!wblNum) return "";

      const mailboxCode = String(row?.mailbox_code || "").trim();
      const orgName = String(row?.organization_name || "").trim();
      const reqCount = Number(row?.request_count || 0);
      const remark =
        String(row?.remark || "").trim() ||
        [mailboxCode, orgName, reqCount > 0 ? `${reqCount}건` : ""]
          .filter(Boolean)
          .join(" / ");
      const today = getTodayYmdInKst();
      const todayLabel = `${today.replace(/-/g, ".")}.`;

      // 지방/수도권 표시
      const domRgnNum = parseInt(domRgn, 10);
      const areaLabel =
        domRgnNum === 1 ? "수도권" : domRgnNum >= 7 ? "제주" : "지방";

      // 발송지 표시: s_tml_cod + s_tml_nam
      const senderLabel = [sTmlCod, sTmlNam].filter(Boolean).join(" ");
      const mainLabel = [hubCod, tmlCod].filter(Boolean).join(" ") || tmlNam;
      const terminalBarcodeValue = tmlCod || cenCod || esCod || wblNum;

      // 실제 한진 FS 운송장 레이아웃 기준 콘텐츠 전용 출력
      const zpl = `^XA
^MMT
^CI29
^PW984
^LL787
^PON
^LH0,0
^FO18,10^A0N,22,22^FD운송장번호^FS
^FO118,6^A0N,34,34^FD${wblNum}^FS
^FO572,10^A0N,22,22^FDP. 1^FS
^FO680,10^A0N,22,22^FD1 / 1^FS
^FO812,6^A0N,22,22^FDⓗ 한진택배^FS
^FO862,28^A0N,16,16^FD1588-0011^FS
^FO24,78^A0N,104,104^FD${mainLabel}^FS
^FO26,196^A0N,24,24^FD발지:${senderLabel}^FS
^FO428,74^A0N,58,58^FD${domMid}^FS
^FO560,78^A0N,28,28^FD${grpRnk}^FS
^FO428,126^A0N,50,50^FD${esNam}^FS
^FO682,82^A0N,64,64^FD${esCod || cenCod}^FS
^FO638,142^A0N,18,18^FD${cenCod ? `${cenCod} ` : ""}${cenNam}^FS
^FO860,92^A0N,34,34^FD${areaLabel}^FS
^FO10,292^A0B,26,26^FD받는분^FS
^FO74,226^A0N,24,24^FD${receiverName}^FS
^FO468,226^A0N,20,20^FD${receiverPhone}^FS
^FO74,258^A0N,20,20^FD${receiverAddr}^FS
^FO74,306^A0N,54,54^FD${prtAdd}^FS
^FO742,222^BY2,2,70^BCN,70,N,N,N^FD${terminalBarcodeValue}^FS
^FO10,444^A0B,26,26^FD보낸분^FS
^FO74,392^A0N,18,18^FD${senderName}  ${senderPhone}^FS
^FO74,418^A0N,16,16^FD${senderAddr}^FS
^FO734,392^A0N,18,18^FD${todayLabel} Type:S^FS
^FO74,486^A0N,22,22^FD의료기기^FS
^FO826,486^A0N,18,18^FD1 / 0 (건수/수량)^FS
^FO74,662^A0N,14,14^FD※ 개인정보 보호를 위하여 인수하신 화물의 운송장을 폐기하여 주시기 바랍니다. ⓗ^FS
^FO74,712^A0N,16,16^FD${remark}^FS
^FO602,552^BY2,2,94^BCN,94,N,N,N^FD${wblNum}^FS
^FO560,694^A0N,18,18^FD운임Type:S  ${wblNum}^FS
^XZ`;

      console.log("[hanjin][zpl] generated FS type label", {
        wblNum,
        tmlNam: hubCod || tmlCod,
        terminalBarcodeValue,
        remark,
        grpRnk,
        mailboxCode,
      });

      return zpl;
    })
    .filter(Boolean);

  return zplLabels;
};

async function triggerWblServerPrint(payload, options = null) {
  const printer = String(options?.printer || "").trim();
  const media = String(options?.paperProfile || options?.media || "").trim();
  const skipPrint = Boolean(options?.skipPrint);
  const outputMode = String(options?.outputMode || "print")
    .trim()
    .toLowerCase();

  console.log("[wbl-print][trigger] triggerWblServerPrint 진입", {
    WBL_PRINT_SERVER_BASE: WBL_PRINT_SERVER_BASE || "(미설정)",
    outputMode,
    printer: printer || "(없음)",
    media: media || "(없음)",
    skipPrint,
    zplLabelCount: payload?.zplLabels?.length ?? 0,
    addressListCount: payload?.address_list?.length ?? 0,
  });

  if (!WBL_PRINT_SERVER_BASE) {
    console.warn(
      "[wbl-print][trigger] WBL_PRINT_SERVER_BASE 미설정 → 출력 불가",
    );
    return {
      success: false,
      reason: "no_wbl_print_server_base",
      message: "운송장 출력 서버 기본 URL이 설정되지 않았습니다.",
    };
  }

  if (skipPrint) {
    return {
      success: true,
      skipped: true,
      reason: "skip_print_option",
      message: "출력 건너뛰기 옵션이 활성화되었습니다.",
    };
  }

  // PDF 저장 모드 - 프론트에서 Canvas로 PNG 생성 (wbls-server 불필요)
  if (outputMode === "pdf") {
    const labelCount = payload?.zplLabels?.length || 0;
    console.log(
      "[wbl-print] pdf mode: PNG rendering will be done on frontend",
      {
        labelCount,
      },
    );
    return {
      success: true,
      outputMode: "pdf",
      message: `${labelCount}개의 라벨을 PNG로 저장합니다.`,
      labelCount,
    };
  }

  // 프린터 출력 모드
  if (!printer) {
    console.warn("[wbl-print][trigger] 프린터 미선택 → 출력 중단");
    return {
      success: false,
      reason: "no_printer_selected",
      message: "프린터를 선택해주세요.",
    };
  }

  if (!media) {
    console.warn("[wbl-print][trigger] 용지 미선택 → 출력 중단");
    return {
      success: false,
      reason: "no_media_selected",
      message: "용지 종류를 선택해주세요.",
    };
  }

  if (!payload?.zplLabels?.length) {
    return {
      success: false,
      reason: "no_zpl_labels",
      message: "출력할 ZPL 라벨 데이터가 없습니다.",
    };
  }

  const labelCount = payload.zplLabels.length;
  console.log(
    "[wbl-print][trigger] label-png 모드: 프론트에서 PNG 렌더링 후 /print-png로 전송",
    { labelCount, printer, paperProfile: media },
  );

  return {
    success: true,
    outputMode: "label-png",
    message: `${labelCount}개 라벨 PNG 출력 준비 완료. 프론트에서 PNG 렌더링 후 전송합니다.`,
    labelCount,
    printer,
    paperProfile: media,
  };
}
