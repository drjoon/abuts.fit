import axios from "axios";
import {
  acquireNextTask,
  completeTask,
  failTask,
  releaseStuckTasks,
  issueTaxInvoice,
  getTaxInvoiceInfo,
  requestBankAccountList,
  getBankAccountTransactions,
  sendKakaoATS,
  sendSMS,
  sendLMS,
} from "../utils/popbill.util.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import { enqueueEasyFinBankCheck } from "../utils/queueManager.js"; // queueManager에 추가 필요할 수 있음, 없으면 직접 구현

const status = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  processedCount: 0,
  failedCount: 0,
};

export function getPopbillWorkerStatus() {
  return { ...status };
}

const WORKER_ID = `popbill-worker:${process.pid}`;
const POLL_INTERVAL_MS = 5000;
const STUCK_TASK_CHECK_INTERVAL_MS = 60000;
const MAX_RETRY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6시간

const pushoverConfig = {
  token: process.env.PUSHOVER_TOKEN || process.env.WORKER_PUSHOVER_TOKEN || "",
  user: process.env.PUSHOVER_USER || process.env.WORKER_PUSHOVER_USER || "",
  device: process.env.PUSHOVER_DEVICE || "",
  priority: process.env.PUSHOVER_PRIORITY,
};

async function sendPushover({ title, message }) {
  const { token, user, device, priority } = pushoverConfig;
  if (!token || !user) return;
  try {
    const body = new URLSearchParams({
      token,
      user,
      title: title || "popbill worker",
      message,
    });
    if (device) body.append("device", device);
    if (priority !== undefined) body.append("priority", String(priority));

    await axios.post("https://api.pushover.net/1/messages.json", body, {
      timeout: 5000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch (err) {
    console.error("[popbillWorker] pushover send failed:", err?.message);
  }
}

async function processTaxInvoiceIssue(task) {
  const { draftId, corpNum } = task.payload;

  const draft = await TaxInvoiceDraft.findById(draftId);
  if (!draft) {
    throw new Error(`TaxInvoiceDraft not found: ${draftId}`);
  }

  if (draft.status === "SENT") {
    return { alreadySent: true, draftId };
  }

  const taxInvoice = {
    writeDate: formatDate(draft.approvedAt || draft.createdAt),
    chargeDirection: "정과금",
    purposeType: "영수",
    taxType: "과세",
    invoicerCorpNum: corpNum,
    invoicerCorpName: draft.buyer?.corpName || "",
    invoicerCEOName: draft.buyer?.ceoName || "",
    invoicerAddr: draft.buyer?.addr || "",
    invoicerBizClass: draft.buyer?.bizClass || "",
    invoicerBizType: draft.buyer?.bizType || "",
    invoicerContactName: draft.buyer?.contactName || "",
    invoicerEmail: draft.buyer?.contactEmail || "",
    invoicerTEL: draft.buyer?.contactTel || "",
    invoiceeCorpNum: process.env.POPBILL_SUPPLIER_CORP_NUM || "",
    invoiceeCorpName: process.env.POPBILL_SUPPLIER_CORP_NAME || "",
    invoiceeCEOName: process.env.POPBILL_SUPPLIER_CEO_NAME || "",
    invoiceeAddr: process.env.POPBILL_SUPPLIER_ADDR || "",
    invoiceeBizClass: process.env.POPBILL_SUPPLIER_BIZ_CLASS || "",
    invoiceeBizType: process.env.POPBILL_SUPPLIER_BIZ_TYPE || "",
    invoiceeContactName: process.env.POPBILL_SUPPLIER_CONTACT_NAME || "",
    invoiceeEmail: process.env.POPBILL_SUPPLIER_EMAIL || "",
    invoiceeTEL: process.env.POPBILL_SUPPLIER_TEL || "",
    supplyCostTotal: String(draft.supplyAmount || 0),
    taxTotal: String(draft.vatAmount || 0),
    totalAmount: String(draft.totalAmount || 0),
    modifyCode: null,
    detailList: [
      {
        serialNum: 1,
        purchaseDT: formatDate(draft.approvedAt || draft.createdAt),
        itemName: draft.description || "크레딧 충전",
        spec: "",
        qty: "1",
        unitCost: String(draft.supplyAmount || 0),
        supplyCost: String(draft.supplyAmount || 0),
        tax: String(draft.vatAmount || 0),
        remark: "",
      },
    ],
  };

  const mgtKey = `DRAFT_${draft._id}`;
  const result = await issueTaxInvoice(corpNum, taxInvoice, mgtKey, false);

  await TaxInvoiceDraft.updateOne(
    { _id: draft._id },
    {
      $set: {
        status: "SENT",
        sentAt: new Date(),
        hometaxTrxId: result?.ntsconfirmNum || mgtKey,
        failReason: null,
      },
    }
  );

  return { issued: true, draftId, mgtKey, result };
}

async function processTaxInvoiceCancel(task) {
  const { draftId, corpNum, mgtKey } = task.payload;

  const draft = await TaxInvoiceDraft.findById(draftId);
  if (!draft) {
    throw new Error(`TaxInvoiceDraft not found: ${draftId}`);
  }

  if (draft.status === "CANCELLED") {
    return { alreadyCancelled: true, draftId };
  }

  const result = await getTaxInvoiceInfo(corpNum, "SELL", mgtKey);

  if (result.stateCode === 3) {
    return { alreadyCancelled: true, draftId };
  }

  await TaxInvoiceDraft.updateOne(
    { _id: draft._id },
    {
      $set: {
        status: "CANCELLED",
        failReason: null,
      },
    }
  );

  return { cancelled: true, draftId, mgtKey };
}

async function processNotificationKakao(task) {
  const { templateCode, to, content, altContent, receiverName } = task.payload;
  console.log(`[popbillWorker] NOTIFICATION_KAKAO: ${to}`);

  const corpNum = process.env.POPBILL_CORP_NUM;
  const senderNum = process.env.POPBILL_SENDER_NUM || "";

  if (!corpNum || !senderNum) {
    throw new Error("POPBILL_CORP_NUM or POPBILL_SENDER_NUM not set");
  }

  const result = await sendKakaoATS(
    corpNum,
    templateCode,
    senderNum,
    to,
    receiverName || "",
    content,
    altContent || content,
    "C",
    ""
  );

  return { sent: true, receiptNum: result.receiptNum };
}

async function processNotificationSMS(task) {
  const { to, content, receiverName } = task.payload;
  console.log(`[popbillWorker] NOTIFICATION_SMS: ${to}`);

  const corpNum = process.env.POPBILL_CORP_NUM;
  const senderNum = process.env.POPBILL_SENDER_NUM || "";

  if (!corpNum || !senderNum) {
    throw new Error("POPBILL_CORP_NUM or POPBILL_SENDER_NUM not set");
  }

  const result = await sendSMS(
    corpNum,
    senderNum,
    to,
    receiverName || "",
    content,
    ""
  );

  return { sent: true, receiptNum: result.receiptNum };
}

async function processNotificationLMS(task) {
  const { to, subject, content, receiverName } = task.payload;
  console.log(`[popbillWorker] NOTIFICATION_LMS: ${to}`);

  const corpNum = process.env.POPBILL_CORP_NUM;
  const senderNum = process.env.POPBILL_SENDER_NUM || "";

  if (!corpNum || !senderNum) {
    throw new Error("POPBILL_CORP_NUM or POPBILL_SENDER_NUM not set");
  }

  const result = await sendLMS(
    corpNum,
    senderNum,
    to,
    receiverName || "",
    subject || "",
    content,
    ""
  );

  return { sent: true, receiptNum: result.receiptNum };
}

async function processEasyFinBankRequest(task) {
  const { bankCode, accountNumber, startDate, endDate } = task.payload;
  console.log(
    `[popbillWorker] EASYFIN_BANK_REQUEST: ${bankCode} ${accountNumber}`
  );

  const corpNum = process.env.POPBILL_CORP_NUM;
  if (!corpNum) throw new Error("POPBILL_CORP_NUM not set");

  // 1. 수집 요청
  const jobID = await requestBankAccountList(
    corpNum,
    bankCode,
    accountNumber,
    startDate,
    endDate
  );

  // 2. 수집 상태 체크를 위한 후속 태스크 엔큐 (1분 후)
  const scheduledFor = new Date(Date.now() + 60 * 1000);
  await enqueueEasyFinBankCheck({
    jobID,
    bankCode,
    accountNumber,
    scheduledFor,
  });

  return { requested: true, jobID };
}

async function processEasyFinBankCheck(task) {
  const { jobID, bankCode, accountNumber } = task.payload;
  console.log(`[popbillWorker] EASYFIN_BANK_CHECK: ${jobID}`);

  const corpNum = process.env.POPBILL_CORP_NUM;

  // 1. 수집 결과(거래내역) 조회 시도 (Job 상태 체크 포함됨)
  // getBankAccountTransactions 내부에서 상태가 '성공'이 아니면 에러를 던지거나 빈 배열 반환 가능
  // 여기서는 popbill.util.js의 getBankAccountTransactions가 완료될 때까지 기다리는지 확인 필요
  // 보통 getBankAccountTransactions는 search API를 호출함. search API는 잡이 완료되어야 결과가 나옴.
  // 잡이 진행중이면 에러가 발생할 수 있음 (P001021004: 수집중입니다 등)

  try {
    const transactions = await getBankAccountTransactions(corpNum, jobID);
    console.log(
      `[popbillWorker] EASYFIN_BANK_CHECK: ${transactions.length} transactions found`
    );

    // 2. DB 저장 (upsert)
    // background/utils/creditBPlanMatching.js 의 upsertBankTransaction 활용
    // 하지만 popbill.util.js에서 가져오는 데이터 포맷과 upsertBankTransaction이 기대하는 포맷을 맞춰야 함
    // 여기서는 background/utils/creditBPlanMatching.js 를 import 해서 사용

    let savedCount = 0;
    const { upsertBankTransaction: upsertTx } = await import(
      "../utils/creditBPlanMatching.js"
    );

    for (const tx of transactions) {
      // tx 필드 매핑 필요 (팝빌 응답 -> DB 모델)
      // 팝빌 search 응답 필드: tid, trDate, trTime, withdraw, deposit, balance, remark, branch, etc.
      const occurredAt = parseTransactionDate(tx.trDate, tx.trTime);
      await upsertTx({
        bankCode,
        accountNumber,
        externalId: tx.tid,
        tranAmt:
          Number(tx.deposit || 0) > 0
            ? Number(tx.deposit)
            : Number(tx.withdraw || 0),
        printedContent: tx.remark || "",
        occurredAt,
        raw: tx,
      });
      savedCount++;
    }

    return { checked: true, savedCount, status: "COMPLETED" };
  } catch (error) {
    // 팝빌 계좌조회 에러 코드 처리
    // -99999999: 수집 진행중 (재시도 필요)
    // -14000001: 잡 아이디가 존재하지 않음 (재시도 불필요)
    const errorMsg = error.message || "";

    if (
      errorMsg.includes("-99999999") ||
      errorMsg.includes("진행중") ||
      errorMsg.includes("수집중")
    ) {
      console.log(
        `[popbillWorker] Bank check still in progress, will retry: ${errorMsg}`
      );
      const retryableError = new Error(errorMsg);
      retryableError.shouldRetry = true;
      throw retryableError;
    }

    if (errorMsg.includes("-14000001") || errorMsg.includes("존재하지")) {
      console.error(
        `[popbillWorker] Invalid jobID, marking as failed: ${errorMsg}`
      );
      const nonRetryable = new Error(`Invalid jobID: ${jobID}`);
      nonRetryable.shouldRetry = false;
      throw nonRetryable;
    }

    console.error(`[popbillWorker] Bank check failed: ${errorMsg}`);
    throw error;
  }
}

async function processTask(task) {
  switch (task.taskType) {
    case "TAX_INVOICE_ISSUE":
      return await processTaxInvoiceIssue(task);
    case "TAX_INVOICE_CANCEL":
      return await processTaxInvoiceCancel(task);
    case "NOTIFICATION_KAKAO":
      return await processNotificationKakao(task);
    case "NOTIFICATION_SMS":
      return await processNotificationSMS(task);
    case "NOTIFICATION_LMS":
      return await processNotificationLMS(task);
    case "EASYFIN_BANK_REQUEST":
      return await processEasyFinBankRequest(task);
    case "EASYFIN_BANK_CHECK":
      return await processEasyFinBankCheck(task);
    default:
      throw new Error(`Unknown task type: ${task.taskType}`);
  }
}

function formatDate(date) {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseTransactionDate(trDate, trTime) {
  if (!trDate) return new Date();
  const y = trDate.substring(0, 4);
  const m = trDate.substring(4, 6);
  const d = trDate.substring(6, 8);
  const h = trTime ? trTime.substring(0, 2) : "00";
  const min = trTime ? trTime.substring(2, 4) : "00";
  const s = trTime ? trTime.substring(4, 6) : "00";
  return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
}

async function pollAndProcess() {
  try {
    const task = await acquireNextTask({
      taskTypes: [
        "TAX_INVOICE_ISSUE",
        "TAX_INVOICE_CANCEL",
        "NOTIFICATION_KAKAO",
        "NOTIFICATION_SMS",
        "NOTIFICATION_LMS",
        "EASYFIN_BANK_REQUEST",
        "EASYFIN_BANK_CHECK",
      ],
      workerId: WORKER_ID,
    });

    if (!task) {
      return;
    }

    console.log(
      `[popbillWorker] Processing task ${task._id} (${task.taskType})`
    );

    try {
      const result = await processTask(task);
      await completeTask({ taskId: task._id, result });
      status.processedCount += 1;
      status.lastSuccessAt = new Date().toISOString();
      console.log(`[popbillWorker] Task ${task._id} completed`);
    } catch (err) {
      console.error(`[popbillWorker] Task ${task._id} failed:`, err);
      const shouldRetry = err?.shouldRetry !== false;
      await failTask({ taskId: task._id, error: err, shouldRetry });
      status.failedCount += 1;
      status.lastError = { message: err?.message, taskId: task._id };

      const attemptCount = task.attemptCount || 1; // acquireNextTask에서 이미 +1
      const maxAttempts = task.maxAttempts || 5;
      const elapsedMs = Date.now() - new Date(task.createdAt || Date.now());
      const retryWindowExceeded = elapsedMs > MAX_RETRY_WINDOW_MS;
      const shouldNotify =
        !shouldRetry || attemptCount >= maxAttempts || retryWindowExceeded;

      if (shouldNotify) {
        const lines = [
          `taskId: ${task._id}`,
          `taskType: ${task.taskType}`,
          `attempt: ${attemptCount}/${maxAttempts}`,
          `retryWindowExceeded: ${retryWindowExceeded}`,
          `error: ${err?.message || err}`,
        ];
        await sendPushover({
          title: `[popbill-worker] task failed`,
          message: lines.join("\n"),
        });
      }
    }
  } catch (err) {
    console.error("[popbillWorker] Poll error:", err);
    status.lastError = { message: err?.message };
  }

  status.lastRunAt = new Date().toISOString();
}

let pollInterval = null;
let stuckCheckInterval = null;

export function startPopbillWorker() {
  if (pollInterval) {
    console.log("[popbillWorker] Already started");
    return;
  }

  console.log("[popbillWorker] Starting...");

  pollInterval = setInterval(() => {
    pollAndProcess().catch((err) => {
      console.error("[popbillWorker] Unhandled error:", err);
    });
  }, POLL_INTERVAL_MS);

  stuckCheckInterval = setInterval(() => {
    releaseStuckTasks()
      .then((result) => {
        if (result.released > 0) {
          console.log(
            `[popbillWorker] Released ${result.released} stuck tasks`
          );
        }
      })
      .catch((err) => {
        console.error("[popbillWorker] Stuck task check error:", err);
      });
  }, STUCK_TASK_CHECK_INTERVAL_MS);

  console.log("[popbillWorker] Started");
}

export function stopPopbillWorker() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (stuckCheckInterval) {
    clearInterval(stuckCheckInterval);
    stuckCheckInterval = null;
  }
  console.log("[popbillWorker] Stopped");
}

export function getQueueStats() {
  return {
    pending: 0, // DB 기반이므로 고정값 대신 0 또는 제거
    processing: 0,
  };
}
