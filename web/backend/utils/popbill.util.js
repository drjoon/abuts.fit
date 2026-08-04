// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import popbill from "popbill";

const LinkID = process.env.POPBILL_LINK_ID;
const SecretKey = process.env.POPBILL_SECRET_KEY;
const isTestEnvDefined = Object.prototype.hasOwnProperty.call(
  process.env,
  "POPBILL_IS_TEST",
);
const IsTest = isTestEnvDefined
  ? process.env.POPBILL_IS_TEST === "true"
  : process.env.NODE_ENV !== "production";

if (!LinkID || !SecretKey) {
  console.warn(
    "⚠️  팝빌 API 인증 정보가 설정되지 않았습니다. POPBILL_LINK_ID, POPBILL_SECRET_KEY 환경변수를 확인하세요.",
  );
}

popbill.config({
  LinkID,
  SecretKey,
  IsTest,
  defaultErrorHandler: false,
  IPRestrictOnOff: true,
  UseStaticIP: false,
  UseLocalTimeYN: true,
});

export const easyFinBankService = popbill.EasyFinBankService();
export const taxinvoiceService = popbill.TaxinvoiceService();
export const kakaoService = popbill.KakaoService();
export const messageService = popbill.MessageService();

export const getPopbillChargeInfo = async (CorpNum, serviceType) => {
  return new Promise((resolve, reject) => {
    const service = {
      easyfinbank: easyFinBankService,
      taxinvoice: taxinvoiceService,
      kakao: kakaoService,
      message: messageService,
    }[serviceType];

    if (!service) {
      return reject(new Error("Invalid service type"));
    }

    service.getChargeInfo(CorpNum, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

export const getPopbillBalance = async (CorpNum) => {
  return new Promise((resolve, reject) => {
    easyFinBankService.getBalance(CorpNum, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

export const listKakaoTemplates = async (CorpNum, UserID = null) => {
  const userId =
    UserID == null || UserID === ""
      ? null
      : String(UserID).replace(/[^\x20-\x7E]/g, "").trim() || null;

  return new Promise((resolve, reject) => {
    // 시그니처: (CorpNum, UserID, success, error) — 콜백을 UserID로 넘기면 헤더 크래시
    kakaoService.listATSTemplate(
      CorpNum,
      userId,
      (result) => resolve(result),
      (error) => reject(error),
    );
  });
};

const normalizeLocalPhone = (raw) => {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
};

const getPopbillMessageConfig = () => {
  const corpNum = String(process.env.POPBILL_CORP_NUM || "").replace(/\D/g, "");
  const sender = String(process.env.POPBILL_SENDER_NUM || "").replace(/\D/g, "");
  // HTTP 헤더(x-pb-userid)용 — ASCII만 허용
  const userIdRaw = String(process.env.POPBILL_USER_ID || "").trim();
  const userId = userIdRaw.replace(/[^\x20-\x7E]/g, "").trim();
  const linkId = String(process.env.POPBILL_LINK_ID || "").trim();
  const secret = String(process.env.POPBILL_SECRET_KEY || "").trim();

  if (!linkId || !secret) {
    throw new Error("POPBILL_LINK_ID/POPBILL_SECRET_KEY 환경변수가 필요합니다.");
  }
  if (!corpNum) {
    throw new Error("POPBILL_CORP_NUM 환경변수가 필요합니다.");
  }
  if (!sender) {
    throw new Error("POPBILL_SENDER_NUM 환경변수가 필요합니다.");
  }

  return { corpNum, sender, userId: userId || null };
};

/** 문자 바이트 대략치(한글 2byte) — SMS 90byte 기준 */
export const approxMessageBytes = (text) => {
  let n = 0;
  for (const ch of String(text || "")) {
    n += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return n;
};

/**
 * 팝빌 문자 즉시 발송 (단문/장문 자동: XMS)
 * - content + to: 동일 내용 동보
 * - items: [{ phone, content, name? }] 수신자별 개별 내용
 * @returns {Promise<{ receiptNum: string, method: "SMS"|"LMS" }>}
 */
export const sendPopbillXMS = async ({
  to,
  content,
  subject = "알림",
  items = null,
} = {}) => {
  const { corpNum, sender, userId } = getPopbillMessageConfig();

  let messages;
  if (Array.isArray(items) && items.length) {
    messages = items
      .map((item) => {
        const phone = normalizeLocalPhone(item?.phone || item?.to || "");
        const text = String(item?.content ?? content ?? "");
        if (!phone || phone.length < 10 || !text) return null;
        return {
          Receiver: phone,
          ReceiverName: String(item?.name || "").trim(),
          Contents: text,
          Subject: subject,
        };
      })
      .filter(Boolean);
  } else {
    const receivers = (Array.isArray(to) ? to : [to])
      .map(normalizeLocalPhone)
      .filter((v) => v.length >= 10);
    const text = String(content || "");
    messages = receivers.map((rcv) => ({
      Receiver: rcv,
      ReceiverName: "",
      Contents: text,
      Subject: subject,
    }));
  }

  if (!messages.length) {
    throw new Error("수신번호/내용을 확인하세요.");
  }

  const sampleText = messages[0].Contents;
  const method = approxMessageBytes(sampleText) > 90 ? "LMS" : "SMS";
  const sharedContent =
    messages.every((m) => m.Contents === sampleText) ? sampleText : "";

  const receiptNum = await new Promise((resolve, reject) => {
    if (messages.length === 1) {
      messageService.sendXMS(
        corpNum,
        sender,
        messages[0].Receiver,
        messages[0].ReceiverName || "",
        subject,
        messages[0].Contents,
        "",
        false,
        "",
        "",
        userId || "",
        (result) => resolve(result),
        (error) => reject(error),
      );
      return;
    }

    messageService.sendXMS_multi(
      corpNum,
      sender,
      subject,
      sharedContent,
      messages,
      "",
      false,
      "",
      "",
      userId || "",
      (result) => resolve(result),
      (error) => reject(error),
    );
  });

  return { receiptNum: String(receiptNum || ""), method };
};

/**
 * 팝빌 알림톡 즉시 발송 (실패 시 동일 내용 SMS/LMS 대체: altSendType=C)
 * - items: [{ phone, content, name? }] 수신자별 개별 내용
 * @returns {Promise<{ receiptNum: string, method: "KAKAO" }>}
 */
export const sendPopbillKakaoATS = async ({
  to,
  content,
  templateCode,
  emphasizeTitle = "",
  items = null,
} = {}) => {
  const { corpNum, sender, userId } = getPopbillMessageConfig();
  const code = String(templateCode || "").trim();
  if (!code) {
    throw new Error("알림톡 템플릿 코드를 확인하세요.");
  }

  let msgs;
  let sharedContent = String(content || "");
  if (Array.isArray(items) && items.length) {
    msgs = items
      .map((item) => {
        const phone = normalizeLocalPhone(item?.phone || item?.to || "");
        const text = String(item?.content ?? content ?? "");
        if (!phone || phone.length < 10 || !text) return null;
        return {
          rcv: phone,
          rcvnm: String(item?.name || "").trim(),
          msg: text,
          altmsg: text,
          altsjt: "알림",
        };
      })
      .filter(Boolean);
    sharedContent = msgs[0]?.msg || "";
  } else {
    const receivers = (Array.isArray(to) ? to : [to])
      .map(normalizeLocalPhone)
      .filter((v) => v.length >= 10);
    if (!receivers.length || !sharedContent) {
      throw new Error("수신번호/내용을 확인하세요.");
    }
    msgs = receivers.map((rcv) => ({
      rcv,
      rcvnm: "",
      msg: sharedContent,
      altmsg: sharedContent,
      altsjt: "알림",
    }));
  }

  if (!msgs.length) {
    throw new Error("수신번호/내용을 확인하세요.");
  }

  const allSame = msgs.every((m) => m.msg === sharedContent);

  const receiptNum = await new Promise((resolve, reject) => {
    if (allSame) {
      kakaoService.sendATS_same(
        corpNum,
        code,
        sender,
        sharedContent,
        "알림",
        sharedContent,
        "C",
        "",
        msgs.map((m) => ({ rcv: m.rcv, rcvnm: m.rcvnm })),
        userId || null,
        null,
        null,
        (result) => resolve(result),
        (error) => reject(error),
      );
      return;
    }

    // 수신자별 개별 내용
    kakaoService.sendATS_multi(
      corpNum,
      code,
      sender,
      "C",
      "",
      msgs,
      userId || null,
      null,
      null,
      (result) => resolve(result),
      (error) => reject(error),
    );
  });

  return {
    receiptNum: String(receiptNum || ""),
    method: "KAKAO",
    emphasizeTitle: String(emphasizeTitle || ""),
  };
};

function formatDateYYYYMMDD(d) {
  // KST 기준 날짜 포맷 (YYYYMMDD)
  const date = d ? new Date(d) : new Date();
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return kstDate.replace(/-/g, "");
}

export const buildTaxinvoiceObject = ({
  draft,
  mgtKey,
  writeDate: writeDateOverride,
}) => {
  const buyer = draft.buyer || {};
  const supplierCorpNum = (
    process.env.POPBILL_SUPPLIER_CORP_NUM ||
    process.env.POPBILL_CORP_NUM ||
    ""
  ).replace(/-/g, "");
  const supplyAmt = String(Math.round(Number(draft.supplyAmount) || 0));
  const taxAmt = String(Math.round(Number(draft.vatAmount) || 0));
  const totalAmt = String(Math.round(Number(draft.totalAmount) || 0));

  return {
    writeDate: writeDateOverride
      ? String(writeDateOverride).replace(/-/g, "").slice(0, 8)
      : formatDateYYYYMMDD(draft.writeDate || draft.createdAt),
    chargeDirection: "정과금",
    issueType: "정발행",
    purposeType: "영수",
    issueTiming: "직접발행",
    taxType: "과세",

    invoicerCorpNum: supplierCorpNum,
    invoicerMgtKey: mgtKey,
    invoicerCorpName:
      process.env.POPBILL_SUPPLIER_CORP_NAME || "어벗츠 주식회사",
    invoicerCEOName: process.env.POPBILL_SUPPLIER_CEO_NAME || "",
    invoicerAddr: process.env.POPBILL_SUPPLIER_ADDR || "",
    invoicerBizType: process.env.POPBILL_SUPPLIER_BIZ_TYPE || "서비스업",
    invoicerBizClass:
      process.env.POPBILL_SUPPLIER_BIZ_CLASS || "소프트웨어 개발",
    invoicerContactName: process.env.POPBILL_SUPPLIER_CONTACT_NAME || "",
    invoicerEmail: process.env.POPBILL_SUPPLIER_EMAIL || "",
    invoicerSMSSendYN: false,

    invoiceeType: "사업자",
    invoiceeCorpNum: (buyer.bizNo || "").replace(/-/g, ""),
    invoiceeCorpName: buyer.corpName || "",
    invoiceeCEOName: buyer.ceoName || "",
    invoiceeAddr: buyer.addr || "",
    invoiceeBizType: buyer.bizType || "",
    invoiceeBizClass: buyer.bizClass || "",
    invoiceeContactName1: buyer.contactName || "",
    invoiceeEmail1: buyer.contactEmail || "",
    invoiceeSMSSendYN: false,

    supplyCostTotal: supplyAmt,
    taxTotal: taxAmt,
    totalAmount: totalAmt,

    detailList: [
      {
        serialNum: 1,
        purchaseDT: formatDateYYYYMMDD(draft.createdAt),
        itemName: "치과기공소 솔루션 이용료",
        qty: "1",
        unitCost: supplyAmt,
        supplyCost: supplyAmt,
        tax: taxAmt,
        remark: "",
      },
    ],
  };
};

export const registIssueInvoice = ({ corpNum, taxinvoice }) => {
  const cleanCorpNum = String(corpNum || "").replace(/-/g, "");
  return new Promise((resolve, reject) => {
    taxinvoiceService.registIssue(
      cleanCorpNum,
      taxinvoice,
      false,
      false,
      "",
      "",
      "",
      "",
      (response) => resolve(response),
      (error) => reject(error),
    );
  });
};

export const cancelIssuedInvoice = ({ corpNum, mgtKey, memo = "발행취소" }) => {
  const cleanCorpNum = String(corpNum || "").replace(/-/g, "");
  return new Promise((resolve, reject) => {
    taxinvoiceService.cancelIssue(
      cleanCorpNum,
      "SELL",
      mgtKey,
      memo,
      "",
      (response) => resolve(response),
      (error) => reject(error),
    );
  });
};
