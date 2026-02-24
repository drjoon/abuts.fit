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
