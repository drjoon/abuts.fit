import popbill from "popbill";

const LinkID = process.env.POPBILL_LINK_ID;
const SecretKey = process.env.POPBILL_SECRET_KEY;
const IsTest = process.env.POPBILL_IS_TEST === "true";

if (!LinkID || !SecretKey) {
  console.warn(
    "⚠️  팝빌 API 인증 정보가 설정되지 않았습니다. POPBILL_LINK_ID, POPBILL_SECRET_KEY 환경변수를 확인하세요."
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

export const requestBankAccountList = async (
  CorpNum,
  BankCode,
  AccountNumber
) => {
  return new Promise((resolve, reject) => {
    easyFinBankService.requestJob(
      CorpNum,
      BankCode,
      AccountNumber,
      new Date().toISOString().split("T")[0].replace(/-/g, ""),
      new Date().toISOString().split("T")[0].replace(/-/g, ""),
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

export const getBankAccountTransactions = async (CorpNum, JobID) => {
  return new Promise((resolve, reject) => {
    easyFinBankService.search(
      CorpNum,
      JobID,
      ["I", "O"],
      1,
      500,
      "D",
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

export const issueTaxInvoice = async (
  CorpNum,
  taxInvoice,
  memo = "",
  forceIssue = false
) => {
  return new Promise((resolve, reject) => {
    taxinvoiceService.registIssue(
      CorpNum,
      taxInvoice,
      memo,
      forceIssue,
      "",
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

export const getTaxInvoiceInfo = async (CorpNum, MgtKeyType, MgtKey) => {
  return new Promise((resolve, reject) => {
    taxinvoiceService.getInfo(CorpNum, MgtKeyType, MgtKey, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

export const cancelTaxInvoice = async (
  CorpNum,
  MgtKeyType,
  MgtKey,
  memo = ""
) => {
  return new Promise((resolve, reject) => {
    taxinvoiceService.cancelIssue(
      CorpNum,
      MgtKeyType,
      MgtKey,
      memo,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

export const sendKakaoATS = async (
  CorpNum,
  templateCode,
  senderNum,
  content,
  altContent,
  altSendType,
  receivers,
  reserveDT = "",
  adsYN = false
) => {
  return new Promise((resolve, reject) => {
    kakaoService.sendATS(
      CorpNum,
      templateCode,
      senderNum,
      content,
      altContent,
      altSendType,
      receivers,
      reserveDT,
      adsYN,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

export const sendSMS = async (
  CorpNum,
  senderNum,
  content,
  receivers,
  reserveDT = "",
  adsYN = false
) => {
  return new Promise((resolve, reject) => {
    messageService.sendSMS(
      CorpNum,
      senderNum,
      content,
      receivers,
      reserveDT,
      adsYN,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

export const sendLMS = async (
  CorpNum,
  senderNum,
  subject,
  content,
  receivers,
  reserveDT = "",
  adsYN = false
) => {
  return new Promise((resolve, reject) => {
    messageService.sendLMS(
      CorpNum,
      senderNum,
      subject,
      content,
      receivers,
      reserveDT,
      adsYN,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

export const getKakaoSentInfo = async (CorpNum, receiptNum) => {
  return new Promise((resolve, reject) => {
    kakaoService.getSentListURL(CorpNum, receiptNum, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

export const getSMSSentInfo = async (CorpNum, receiptNum) => {
  return new Promise((resolve, reject) => {
    messageService.getSentListURL(CorpNum, receiptNum, (error, result) => {
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

export const registerKakaoSender = async (CorpNum, phoneNumber, senderName) => {
  return new Promise((resolve, reject) => {
    kakaoService.registSender(
      CorpNum,
      phoneNumber,
      senderName,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

export const registerSMSSender = async (CorpNum, phoneNumber, senderName) => {
  return new Promise((resolve, reject) => {
    messageService.registSender(
      CorpNum,
      phoneNumber,
      senderName,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};
