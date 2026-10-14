// related files:
// - web/backend/services/easyFinBankSync.core.js
// - web/backend/utils/popbill.util.js
// - web/backend/jobs/easyFinBankSyncWorker.js
// - web/backend/utils/creditBPlanMatching.js
// change-log:
// - 2026-10-14: 20분 주기 팝빌 계좌조회. 잔액 저장, 입금은 기존 매칭으로 넘긴다.
import SystemSettings from "../models/systemSettings.model.js";
import EasyFinBankSnapshot from "../models/easyFinBankSnapshot.model.js";
import { resolvePopbillBank } from "../utils/bankCodes.js";
import {
  getEasyFinBankJobState,
  isPopbillAccountCheckConfigured,
  requestEasyFinBankJob,
  searchEasyFinBank,
} from "../utils/popbill.util.js";
import {
  autoMatchBankTransactionsOnce,
  upsertBankTransaction,
} from "../utils/creditBPlanMatching.js";
import { runWithJobLock } from "../utils/distributedJobLock.js";
import {
  easyFinSearchRangeKst,
  isEasyFinJobDone,
  mapEasyFinDeposit,
  parsePopbillTrdt,
  readEasyFinBalance,
} from "./easyFinBankSync.core.js";

const SNAPSHOT_KEY = "abuts-deposit";
const LOCK_NAME = "easyfin-bank-sync";
const JOB_WAIT_MS = 90_000;
const JOB_POLL_MS = 2_000;
const DEFAULT_ACCOUNT = "80691000900004";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function resolveAbutsDepositAccount() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select({ bPlanDepositAccount: 1 })
    .lean();
  const info = doc?.bPlanDepositAccount || {};
  const bank = resolvePopbillBank(info.bankName || "하나은행") || {
    code: "0081",
    name: "하나은행",
  };
  const accountNumber = String(info.accountNumber || DEFAULT_ACCOUNT).replace(/\D/g, "");
  return {
    bankCode: bank.code,
    bankName: bank.name || "하나은행",
    accountNumber,
  };
}

async function waitUntilJobReady(jobId) {
  const deadline = Date.now() + JOB_WAIT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await getEasyFinBankJobState(jobId);
    const status = isEasyFinJobDone(last);
    if (status.done) {
      if (!status.ok) {
        const reason = String(last?.errorReason || last?.message || "").trim();
        throw new Error(reason || `계좌 수집에 실패했습니다. (${status.errorCode})`);
      }
      return last;
    }
    await delay(JOB_POLL_MS);
  }
  throw new Error("계좌 수집이 제한 시간 안에 끝나지 않았습니다.");
}

async function searchAll(jobId) {
  const rows = [];
  let page = 1;
  let pageCount = 1;
  let balance = null;
  let lastScrapAt = null;

  while (page <= pageCount && page <= 20) {
    const res = await searchEasyFinBank({
      jobId,
      page,
      perPage: 1000,
      order: "A",
    });
    if (balance == null) balance = readEasyFinBalance(res);
    if (!lastScrapAt) lastScrapAt = parsePopbillTrdt(res?.lastScrapDT || res?.lastScrapDt);
    pageCount = Math.max(1, Number(res?.pageCount || 1));
    const list = Array.isArray(res?.list) ? res.list : [];
    rows.push(...list);
    if (!list.length) break;
    page += 1;
  }

  return { rows, balance, lastScrapAt };
}

async function saveSnapshot(patch) {
  return EasyFinBankSnapshot.findOneAndUpdate(
    { key: SNAPSHOT_KEY },
    { $set: { key: SNAPSHOT_KEY, ...patch } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
}

async function syncUnlocked() {
  if (!isPopbillAccountCheckConfigured()) {
    const err = new Error("팝빌 연동 설정이 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const account = await resolveAbutsDepositAccount();
  const range = easyFinSearchRangeKst(new Date());
  let jobId = "";

  try {
    jobId = String(
      await requestEasyFinBankJob({
        bankCode: account.bankCode,
        accountNumber: account.accountNumber,
        sDate: range.sDate,
        eDate: range.eDate,
      }),
    );
    await waitUntilJobReady(jobId);
    const searched = await searchAll(jobId);

    let depositCount = 0;
    for (const row of searched.rows) {
      const mapped = mapEasyFinDeposit(row, account);
      if (!mapped) continue;
      await upsertBankTransaction(mapped);
      depositCount += 1;
    }

    const matched = await autoMatchBankTransactionsOnce({ limit: 200 }).catch((e) => {
      console.error("[easyFinBank] match failed:", e?.message || e);
      return null;
    });

    const doc = await saveSnapshot({
      bankCode: account.bankCode,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      balance: searched.balance,
      lastScrapAt: searched.lastScrapAt,
      jobId,
      syncedAt: new Date(),
      depositCount,
      error: "",
    });

    return { snapshot: doc, matched };
  } catch (e) {
    const message = String(e?.message || e || "계좌 조회에 실패했습니다.");
    await saveSnapshot({
      bankCode: account.bankCode,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      jobId,
      syncedAt: new Date(),
      error: message,
    }).catch(() => null);
    const err = new Error(message);
    err.statusCode = e?.statusCode || 502;
    throw err;
  }
}

export async function syncEasyFinBankOnce() {
  const ownerId = `easyfin-${process.pid}-${Date.now()}`;
  const locked = await runWithJobLock({
    name: LOCK_NAME,
    ownerId,
    leaseMs: 180_000,
    task: syncUnlocked,
  });
  if (!locked.acquired) {
    const err = new Error("계좌 조회가 이미 진행 중입니다.");
    err.statusCode = 409;
    throw err;
  }
  return locked.result;
}

export async function getEasyFinBankSnapshot() {
  const [doc, account] = await Promise.all([
    EasyFinBankSnapshot.findOne({ key: SNAPSHOT_KEY }).lean(),
    resolveAbutsDepositAccount().catch(() => null),
  ]);
  return { doc, account, configured: isPopbillAccountCheckConfigured() };
}
