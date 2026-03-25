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

export const listKakaoTemplates = async (CorpNum) => {
  return new Promise((resolve, reject) => {
    kakaoService.listATSTemplate(CorpNum, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

function formatDateYYYYMMDD(d) {
  const date = d ? new Date(d) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
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
