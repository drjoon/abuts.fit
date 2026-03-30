import Request from "../../models/request.model.js";
import hanjinService from "../../services/hanjin.service.js";

export const HANJIN_CLIENT_ID = String(
  process.env.HANJIN_CLIENT_ID || "",
).trim();
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

export const buildResolvedLabelData = ({ data, metaByMsgKey = {} }) => {
  const enrichedData =
    data && typeof data === "object"
      ? {
          ...data,
          address_list: enrichHanjinAddressList({
            addressList: data.address_list,
            metaByMsgKey,
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
  // 한진 API 응답에서 ZPL 라벨 데이터를 받기 위해 print-wbls API 호출
  // payload는 address_list를 포함한 형식이어야 함
  const printPath = path.replace("{client_id}", HANJIN_CLIENT_ID);

  const hanjinStartTime = Date.now();
  console.log("[shipping][hanjin-print] requesting label print", {
    mailboxCount: Array.isArray(payload?.address_list)
      ? payload.address_list.length
      : 0,
  });

  const data = await hanjinService.requestPrintApi({
    path: printPath,
    method: "POST",
    data: payload,
  });

  const hanjinElapsedMs = Date.now() - hanjinStartTime;
  console.log("[shipping][hanjin-print] received label response", {
    elapsedMs: hanjinElapsedMs,
    elapsedSec: (hanjinElapsedMs / 1000).toFixed(2),
  });

  // 한진 API 응답 구조 확인
  if (Array.isArray(data?.address_list) && data.address_list.length > 0) {
    console.log("[hanjin][api-response] first address item keys:", {
      keys: Object.keys(data.address_list[0]),
      hasZpl:
        "wbl_zpl" in data.address_list[0] || "zpl" in data.address_list[0],
      sample: data.address_list[0],
    });
  }

  const errorCount = Number(data?.error_cnt || data?.errorCnt || 0);
  const addressList = Array.isArray(data?.address_list)
    ? data.address_list
    : [];
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

  const labelData = buildResolvedLabelData({ data, metaByMsgKey });

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
    address_list: [],
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

  const startTime = Date.now();
  console.log("[wbl-print] requesting ZPL conversion", {
    saveMode: body?.saveMode,
    paperProfile: body?.paperProfile,
  });

  try {
    const response = await fetch(`${WBL_PRINT_SERVER_BASE}/print-zpl`, {
      method: "POST",
      headers,
      body: JSON.stringify({ zpl, ...body }),
      signal: controller.signal,
    });

    const data = await response.json();
    const elapsedMs = Date.now() - startTime;
    console.log("[wbl-print] received ZPL conversion response", {
      elapsedMs,
      elapsedSec: (elapsedMs / 1000).toFixed(2),
      success: response.ok,
      status: response.status,
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
  void requestWblServerPrint({ zpl, body }).catch((error) => {
    console.error("[wbl-print][dispatch] async print failed", {
      message: error?.message,
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

  const built = buildHanjinDraftPayload(requests);

  return {
    payload: built.payload,
    metaByMsgKey: built.metaByMsgKey || {},
    usedDbRequests: true,
    requestIds: requests
      .map((req) => String(req?.requestId || "").trim())
      .filter(Boolean),
  };
};

export const buildHanjinInsertOrderBody = ({ mailbox, requests }) => {
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
  const ymd = String(new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const custOrdNo = `ABUTS_${ymd}_${String(mailbox || "-")}`.slice(0, 30);
  const receiverPhone = String(first?.requestor?.phoneNumber || "").trim();

  return {
    custEdiCd: HANJIN_CLIENT_ID,
    custOrdNo,
    cntractNo: HANJIN_CSR_NUM,
    svcCatCd: "E",
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

const buildHanjinDraftPayload = (requests) => {
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

const enrichHanjinAddressList = ({ addressList, metaByMsgKey }) =>
  (Array.isArray(addressList) ? addressList : []).map((row) => {
    const msgKey = String(row?.msg_key || row?.msgKey || "").trim();
    const meta = metaByMsgKey?.[msgKey] || {};
    return {
      ...row,
      mailbox_code: meta.mailbox_code || row?.mailbox_code || null,
      organization_name:
        meta.organization_name || row?.organization_name || null,
      request_count: meta.request_count || row?.request_count || null,
      remark: meta.remark || row?.remark || null,
    };
  });

const buildHanjinWblZplLabels = ({ addressList }) => {
  const filtered = (Array.isArray(addressList) ? addressList : []).filter(
    (row) =>
      String(row?.result_code || row?.resultCode || "OK").trim() === "OK",
  );

  const zplLabels = filtered
    .map((row) => {
      // 한진 API 응답 필드 추출
      const wblNum = String(row?.wbl_num || "").trim();
      const prtAdd = String(row?.prt_add || "").trim();
      const receiverName = String(row?.receiver_name || "").trim();
      const receiverPhone = String(row?.receiver_phone || "").trim();
      const tmlNam = String(row?.tml_nam || "").trim();
      const cenNam = String(row?.cen_nam || "").trim();
      const sTemNam = String(row?.s_tml_nam || "").trim();
      const domRgn = String(row?.dom_rgn || "").trim();
      const domMid = String(row?.dom_mid || "").trim();
      const grpRnk = String(row?.grp_rnk || "").trim();
      const esCod = String(row?.es_cod || "").trim();

      if (!wblNum) {
        return "";
      }

      // 한진 FS 타입 운송장 ZPL 라벨 생성
      // 용지 크기: 123mm x 100mm (약 984 x 787 dots at 203 DPI)
      // Code Page 29 (한국어 KS X 1001)
      // 첨부 이미지 기준 정확한 레이아웃 (가로형)
      const remark =
        String(row?.remark || "").trim() || `${receiverName} / 1건`;
      const mailboxCode = String(row?.mailbox_code || "").trim();
      const today = new Date().toISOString().slice(0, 10);

      const zpl = `^XA
^MMT
^CI29
^PW984
^LL787
^PON
^LH0,0
^FO30,20^A0N,24,24^FD운송장번호^FS
^FO200,15^A0N,36,36^FD${wblNum}^FS
^FO550,20^A0N,18,18^FDP.1  1/1^FS
^FO850,20^A0N,18,18^FD한진택배 1588-0011^FS
^FO30,70^GB924,3,3^FS
^FO30,90^A0N,120,120^FD${tmlNam}^FS
^FO500,90^GB3,230,3^FS
^FO520,90^A0N,28,28^FD도화정^FS
^FO520,125^A0N,24,24^FD${domRgn}^FS
^FO630,90^GB3,230,3^FS
^FO650,90^A0N,28,28^FD권역^FS
^FO650,125^A0N,40,40^FD${grpRnk}^FS
^FO760,90^GB3,230,3^FS
^FO780,90^A0N,28,28^FD구분^FS
^FO780,125^A0N,24,24^FD${mailboxCode}^FS
^FO30,200^A0N,80,80^FD${domMid}^FS
^FO30,290^A0N,60,60^FD${sTemNam}^FS
^FO30,330^GB924,3,3^FS
^FO30,350^A0N,22,22^FD배달주소^FS
^FO30,380^A0N,20,20^FD${prtAdd}^FS
^FO650,350^BY2,2,120^BCN,120,N,N,N^FD${wblNum}^FS
^FO30,520^GB924,3,3^FS
^FO30,540^A0N,22,22^FD받는분^FS
^FO30,570^A0N,20,20^FD${receiverName}^FS
^FO30,600^A0N,20,20^FD${receiverPhone}^FS
^FO800,540^A0N,18,18^FD${today}^FS
^FO800,570^A0N,18,18^FDType:S^FS
^FO30,640^A0N,18,18^FD의료기기  1/0^FS
^FO30,670^GB924,3,3^FS
^FO30,690^A0N,20,20^FD비고  ${remark}^FS
^FO800,690^BY2,2,40^BCN,40,N,N,N^FD${wblNum}^FS
^XZ`;

      console.log("[hanjin][zpl] generated FS type label", {
        wblNum,
        tmlNam,
        domMid,
        cenNam,
        grpRnk,
        mailboxCode,
        zplPreview: zpl.slice(0, 200),
      });

      return zpl;
    })
    .filter(Boolean);

  return zplLabels;
};

async function triggerWblServerPrint(payload, options = null) {
  if (!WBL_PRINT_SERVER_BASE) {
    return {
      success: false,
      reason: "no_wbl_print_server_base",
      message: "운송장 출력 서버 기본 URL이 설정되지 않았습니다.",
    };
  }

  const printer = String(options?.printer || "").trim();
  const media = String(options?.paperProfile || options?.media || "").trim();
  const skipPrint = Boolean(options?.skipPrint);
  const outputMode = String(options?.outputMode || "print")
    .trim()
    .toLowerCase();

  if (skipPrint) {
    return {
      success: true,
      skipped: true,
      reason: "skip_print_option",
      message: "출력 건너뛰기 옵션이 활성화되었습니다.",
    };
  }

  // PDF 저장 모드 - 비동기 처리로 즉시 반환
  if (outputMode === "pdf") {
    if (!media) {
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

    // 비동기로 PDF 변환 요청 (응답 대기 없이 즉시 반환)
    const labelCount = payload.zplLabels.length;
    console.log("[wbl-print] queuing PDF conversion batch (async)", {
      labelCount,
    });

    // 백그라운드에서 PDF 변환 처리
    void (async () => {
      const wblStartTime = Date.now();
      try {
        const pdfResults = await Promise.all(
          payload.zplLabels.map((zpl) =>
            requestWblServerPrint({
              zpl,
              body: {
                saveMode: "pdf",
                paperProfile: media,
                title: "Hanjin Waybill Label",
              },
            }),
          ),
        );

        const wblElapsedMs = Date.now() - wblStartTime;
        const failedResult = pdfResults.find((result) => !result?.success);

        if (failedResult) {
          console.error("[wbl-print] PDF conversion batch failed", {
            elapsedMs: wblElapsedMs,
            elapsedSec: (wblElapsedMs / 1000).toFixed(2),
            labelCount,
            error: failedResult?.message,
          });
        } else {
          console.log("[wbl-print] PDF conversion batch completed", {
            elapsedMs: wblElapsedMs,
            elapsedSec: (wblElapsedMs / 1000).toFixed(2),
            labelCount,
          });
        }
      } catch (error) {
        const wblElapsedMs = Date.now() - wblStartTime;
        console.error("[wbl-print] PDF conversion batch error", {
          elapsedMs: wblElapsedMs,
          elapsedSec: (wblElapsedMs / 1000).toFixed(2),
          labelCount,
          error: error.message,
        });
      }
    })();

    // 즉시 성공 응답 반환 (실제 PDF 변환은 백그라운드에서 진행)
    return {
      success: true,
      queued: true,
      outputMode: "pdf",
      message: `${labelCount}개의 라벨 PDF 변환을 요청했습니다.`,
      labelCount,
    };
  }

  // 프린터 출력 모드
  if (!printer) {
    return {
      success: false,
      reason: "no_printer_selected",
      message: "프린터를 선택해주세요.",
    };
  }

  if (!media) {
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

  payload.zplLabels.forEach((zpl) => {
    dispatchWblServerPrint({
      zpl,
      body: {
        printer,
        paperProfile: media,
        title: "Hanjin Waybill Label",
      },
    });
  });

  return {
    success: true,
    queued: true,
    outputMode: "print",
    message: `${payload.zplLabels.length}개의 라벨 인쇄 요청을 접수했습니다.`,
    queuedCount: payload.zplLabels.length,
  };
}
