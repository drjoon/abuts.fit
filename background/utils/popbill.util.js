import popbill from "popbill";

const taxinvoiceService = new popbill.TaxinvoiceService();
const easyFinBankService = new popbill.EasyFinBankService();
const kakaoService = new popbill.KakaoService();
const messageService = new popbill.MessageService();

const linkID = process.env.POPBILL_LINK_ID || "";
const secretKey = process.env.POPBILL_SECRET_KEY || "";
const isTest = process.env.POPBILL_IS_TEST === "true";

taxinvoiceService.setLinkID(linkID);
taxinvoiceService.setSecretKey(secretKey);
taxinvoiceService.setTest(isTest);

easyFinBankService.setLinkID(linkID);
easyFinBankService.setSecretKey(secretKey);
easyFinBankService.setTest(isTest);

kakaoService.setLinkID(linkID);
kakaoService.setSecretKey(secretKey);
kakaoService.setTest(isTest);

messageService.setLinkID(linkID);
messageService.setSecretKey(secretKey);
messageService.setTest(isTest);

export async function issueTaxInvoice(corpNum, taxInvoice, memo, forceIssue) {
  return new Promise((resolve, reject) => {
    taxinvoiceService.RegistIssue(
      corpNum,
      taxInvoice,
      memo,
      forceIssue,
      (result) => {
        if (result.code) {
          reject(new Error(`[${result.code}] ${result.message}`));
        } else {
          resolve(result);
        }
      }
    );
  });
}

export async function getTaxInvoiceInfo(corpNum, mgtKeyType, mgtKey) {
  return new Promise((resolve, reject) => {
    taxinvoiceService.GetInfo(corpNum, mgtKeyType, mgtKey, (result) => {
      if (result.code) {
        reject(new Error(`[${result.code}] ${result.message}`));
      } else {
        resolve(result);
      }
    });
  });
}

export async function requestBankAccountList(
  corpNum,
  bankCode,
  accountNumber,
  startDate,
  endDate
) {
  return new Promise((resolve, reject) => {
    easyFinBankService.RequestJob(
      corpNum,
      bankCode,
      accountNumber,
      startDate,
      endDate,
      (result) => {
        if (result.code) {
          reject(new Error(`[${result.code}] ${result.message}`));
        } else {
          resolve(result.jobID);
        }
      }
    );
  });
}

export async function getBankAccountTransactions(corpNum, jobID) {
  return new Promise((resolve, reject) => {
    easyFinBankService.Search(corpNum, jobID, [], 1, 1000, "D", (result) => {
      if (result.code) {
        reject(new Error(`[${result.code}] ${result.message}`));
      } else {
        resolve(result.list || []);
      }
    });
  });
}

export async function sendKakaoATS(
  corpNum,
  templateCode,
  senderNum,
  receiverNum,
  receiverName,
  content,
  altContent,
  altSendType,
  sndDT
) {
  return new Promise((resolve, reject) => {
    const message = {
      templateCode,
      snd: senderNum,
      rcv: receiverNum,
      rcvnm: receiverName || "",
      msg: content,
      altmsg: altContent || content,
      altSendType: altSendType || "C",
      sndDT: sndDT || "",
    };

    kakaoService.SendATS(
      corpNum,
      templateCode,
      senderNum,
      [message],
      "",
      (result) => {
        if (result.code) {
          reject(new Error(`[${result.code}] ${result.message}`));
        } else {
          resolve(result);
        }
      }
    );
  });
}

export async function sendSMS(
  corpNum,
  senderNum,
  receiverNum,
  receiverName,
  content,
  sndDT
) {
  return new Promise((resolve, reject) => {
    const message = {
      snd: senderNum,
      rcv: receiverNum,
      rcvnm: receiverName || "",
      msg: content,
      sndDT: sndDT || "",
    };

    messageService.SendSMS(corpNum, senderNum, [message], "", (result) => {
      if (result.code) {
        reject(new Error(`[${result.code}] ${result.message}`));
      } else {
        resolve(result);
      }
    });
  });
}

export async function sendLMS(
  corpNum,
  senderNum,
  receiverNum,
  receiverName,
  subject,
  content,
  sndDT
) {
  return new Promise((resolve, reject) => {
    const message = {
      snd: senderNum,
      rcv: receiverNum,
      rcvnm: receiverName || "",
      sjt: subject || "",
      msg: content,
      sndDT: sndDT || "",
    };

    messageService.SendLMS(corpNum, senderNum, "", [message], "", (result) => {
      if (result.code) {
        reject(new Error(`[${result.code}] ${result.message}`));
      } else {
        resolve(result);
      }
    });
  });
}

export {
  acquireNextTask,
  completeTask,
  failTask,
  releaseStuckTasks,
} from "./queueManager.js";
