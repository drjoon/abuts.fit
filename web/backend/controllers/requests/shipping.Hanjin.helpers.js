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

const resolveRequestorOrganization = (request) => {
  const candidates = [
    request?.requestorOrganization,
    request?.requestorBusinessId,
    request?.requestor?.businessInfo,
  ];
  return (
    candidates.find(
      (candidate) => candidate && typeof candidate === "object",
    ) || {}
  );
};

const resolveRequestOrganizationName = (request) => {
  const requestor = request?.requestor || {};
  const requestorOrg = resolveRequestorOrganization(request);
  const extracted = requestorOrg?.extracted || {};
  return (
    requestorOrg?.name ||
    extracted?.companyName ||
    requestor?.business ||
    request?.caseInfos?.clinicName ||
    requestor?.name ||
    ""
  );
};

const resolveReceiverZipSource = (request) => {
  const requestor = request?.requestor || {};
  const requestorOrg = resolveRequestorOrganization(request);
  const extracted = requestorOrg?.extracted || {};
  return (
    requestor?.address?.postalCode ||
    requestor?.zipCode ||
    requestor?.postalCode ||
    extracted?.zipCode ||
    extracted?.postalCode ||
    ""
  );
};

const normalizeReceiverAddressForHanjin = (request) => {
  const requestor = request?.requestor || {};
  const requestorOrg = resolveRequestorOrganization(request);
  const extracted = requestorOrg?.extracted || {};
  const addressCandidates = [
    requestor?.addressText,
    requestor?.address?.roadAddress,
    requestor?.address?.address1,
    requestor?.address,
    extracted?.address,
    extracted?.address1,
  ];
  return (
    addressCandidates
      .map((value) => String(value || "").trim())
      .find(Boolean) || ""
  );
};

const resolveReceiverDetailAddress = (request) => {
  const requestor = request?.requestor || {};
  const requestorOrg = resolveRequestorOrganization(request);
  const extracted = requestorOrg?.extracted || {};
  const candidates = [
    requestor?.address?.detailAddress,
    requestor?.address?.address2,
    requestor?.address?.detail,
    requestor?.detailAddress,
    extracted?.addressDetail,
    extracted?.detailAddress,
    extracted?.address2,
  ];
  return (
    candidates.map((value) => String(value || "").trim()).find(Boolean) || ""
  );
};

const logMissingReceiverAddressDiagnostics = ({ request, mailbox, reason }) => {
  try {
    const requestor = request?.requestor || {};
    const requestorOrg = resolveRequestorOrganization(request);
    const extracted = requestorOrg?.extracted || {};
    const normalizedBaseAddress = normalizeReceiverAddressForHanjin(request);
    const normalizedDetailAddress = resolveReceiverDetailAddress(request);
    console.error("[hanjin][address] missing receiver address", {
      reason,
      mailbox: String(mailbox || "").trim() || null,
      requestId: String(request?.requestId || "").trim() || null,
      requestMongoId: String(request?._id || "").trim() || null,
      organizationName:
        String(requestorOrg?.name || extracted?.companyName || "").trim() ||
        null,
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
  const data = await hanjinService.requestPrintApi({
    path: path.replace("{client_id}", HANJIN_CLIENT_ID),
    method: "POST",
    data: payload,
  });

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
        firstFailed?.result_msg ||
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
  const wblPrint = shouldTriggerWblPrint
    ? await triggerWblServerPrint(labelData, wblPrintOptions)
    : { success: true, skipped: true, reason: "image_mode" };

  return { labelData, wblPrint };
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
    console.log(`${logPrefix} trying candidates`, {
      pathCandidates,
      data,
    });
    const out = await executeHanjinOrderApiWithFallback({
      pathCandidates,
      data,
      logPrefix,
    });
    console.log(`${logPrefix} candidate success`, {
      pathCandidates,
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
    query = query.populate("requestorBusinessId", "name extracted");
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
      const requestorOrg = resolveRequestorOrganization(first);
      const extracted = requestorOrg.extracted || {};
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

export const debugHanjinPrintPayload = (payload) => {
  try {
    const row = Array.isArray(payload?.address_list)
      ? payload.address_list[0]
      : null;
    if (!row) return;
    console.log("[hanjin][print] address_list sample", {
      msg_key: row?.msg_key,
      has_address: Boolean(String(row?.address || "").trim()),
      has_rcv_addr: Boolean(String(row?.rcv_addr || "").trim()),
      has_rcvrBaseAddr: Boolean(String(row?.rcvrBaseAddr || "").trim()),
      keys: row && typeof row === "object" ? Object.keys(row) : [],
    });
  } catch (e) {
    console.error("[hanjin][print] payload debug failed", e);
  }
};

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

const buildHanjinWblZplLabels = ({ addressList }) =>
  (Array.isArray(addressList) ? addressList : [])
    .filter(
      (row) =>
        String(row?.result_code || row?.resultCode || "OK").trim() === "OK",
    )
    .map((row) => String(row?.zpl || row?.ZPL || "").trim())
    .filter(Boolean);

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

  if (skipPrint) {
    return {
      success: true,
      skipped: true,
      reason: "skip_print_option",
      message: "출력 건너뛰기 옵션이 활성화되었습니다.",
    };
  }

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

  try {
    // wbls-server의 /print-zpl 엔드포인트로 각 ZPL 라벨을 개별 인쇄
    const results = [];
    for (const zpl of payload.zplLabels) {
      const headers = { "Content-Type": "application/json" };
      if (WBL_PRINT_SHARED_SECRET) {
        headers["x-wbl-secret"] = WBL_PRINT_SHARED_SECRET;
      }

      const response = await fetch(`${WBL_PRINT_SERVER_BASE}/print-zpl`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          zpl,
          printer,
          paperProfile: media,
          title: "Hanjin Waybill Label",
        }),
      });

      const data = await response.json();
      results.push({
        success: response.ok,
        status: response.status,
        ...data,
      });

      if (!response.ok) {
        return {
          success: false,
          reason: "zpl_print_failed",
          message: data?.message || "ZPL 라벨 인쇄에 실패했습니다.",
          details: results,
        };
      }
    }

    return {
      success: true,
      message: `${results.length}개의 라벨이 인쇄되었습니다.`,
      details: results,
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      message: error.message,
      reason: "wbl_print_server_error",
    };
  }
}
