import axios from "axios";
import BankPollingState from "../models/bankPollingState.model.js";
import { upsertBankTransaction } from "../utils/creditBPlanMatching.js";

const toBool = (v) =>
  String(v || "")
    .trim()
    .toLowerCase() === "true";

const toStringOrEmpty = (v) => String(v || "").trim();

const toNumberOrNaN = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function makeIsTuno(tsymd) {
  const suffix = String(Date.now()).slice(-8);
  return `${tsymd}${suffix}`;
}

function toIsoFromNhDateTime(trdd, txtm) {
  if (!/^\d{8}$/.test(trdd) || !/^\d{6}$/.test(txtm)) return null;
  const iso = `${trdd.slice(0, 4)}-${trdd.slice(4, 6)}-${trdd.slice(
    6,
    8
  )}T${txtm.slice(0, 2)}:${txtm.slice(2, 4)}:${txtm.slice(4, 6)}+09:00`;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

async function acquireLock({ key, owner, lockMs = 10 * 60 * 1000 }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lockMs);
  const res = await BankPollingState.findOneAndUpdate(
    {
      key,
      $or: [{ lockedAt: null }, { lockedAt: { $lt: now } }],
    },
    {
      $set: { lockedAt: now, lockedBy: owner, lockExpiresAt: expiresAt },
    },
    { upsert: true, new: true }
  );
  if (!res || res.lockedBy !== owner) {
    throw new Error("lock_not_acquired");
  }
  return res;
}

async function releaseLock({ key, owner }) {
  await BankPollingState.updateOne(
    { key, lockedBy: owner },
    { $set: { lockedAt: null, lockedBy: null, lockExpiresAt: null } }
  );
}

async function callInquireTransactionHistory({ url, body }) {
  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
  };

  const res = await axios.post(url, body, { headers, timeout: 15_000 });
  const data = res?.data || {};

  const rpcd = String(data?.Header?.Rpcd || "").trim();
  if (rpcd && rpcd !== "00000") {
    const rsms = String(data?.Header?.Rsms || "").trim();
    const err = new Error(`NH api error rpcd=${rpcd} rsms=${rsms}`);
    err.rpcd = rpcd;
    err.rsms = rsms;
    err.response = data;
    throw err;
  }

  const rec = Array.isArray(data?.REC) ? data.REC : [];
  return {
    rec,
    iqtcnt: data?.Iqtcnt ?? data?.iqtcnt ?? rec.length,
    raw: data,
  };
}

export async function pollNhOpenBankingOnce() {
  if (!toBool(process.env.NH_OPENBANKING_POLLING_ENABLED)) {
    return { skipped: true, reason: "disabled" };
  }

  const url = toStringOrEmpty(process.env.NH_OPENBANKING_TRANSACTIONS_URL);
  if (!url) {
    return { skipped: true, reason: "missing_url" };
  }

  const accessToken = toStringOrEmpty(process.env.NH_OPENBANKING_ACCESS_TOKEN);
  const iscd = toStringOrEmpty(process.env.NH_OPENBANKING_ISCD);
  const fintechApsno = toStringOrEmpty(
    process.env.NH_OPENBANKING_FINTECH_APSNO
  );
  const apiSvcCd = toStringOrEmpty(process.env.NH_OPENBANKING_API_SVC_CD);
  const bncd = toStringOrEmpty(process.env.NH_OPENBANKING_BNCD);
  const acno = toStringOrEmpty(process.env.NH_OPENBANKING_ACNO);

  if (!accessToken || !iscd || !fintechApsno || !apiSvcCd || !bncd || !acno) {
    return { skipped: true, reason: "missing_env" };
  }

  const trnsDsnc = toStringOrEmpty(process.env.NH_OPENBANKING_TRNS_DSNC) || "A";
  const lnsq = toStringOrEmpty(process.env.NH_OPENBANKING_LNSQ) || "ASC";
  const dmcnt = Math.min(
    200,
    Math.max(1, Number(process.env.NH_OPENBANKING_DMCNT || 100) || 100)
  );

  const maxPages = Math.min(
    50,
    Math.max(1, Number(process.env.NH_OPENBANKING_MAX_PAGES || 10) || 10)
  );

  const onlyDeposit = String(process.env.NH_OPENBANKING_ONLY_DEPOSIT || "")
    .trim()
    .toLowerCase();
  const onlyDepositEnabled = onlyDeposit ? onlyDeposit === "true" : true;
  const allowUnknownDirection =
    String(process.env.NH_OPENBANKING_ALLOW_UNKNOWN_DIRECTION || "")
      .trim()
      .toLowerCase() === "true";

  const key = "nh:InquireTransactionHistory";
  const owner = `worker:${process.pid}`;

  await acquireLock({ key, owner });

  let inserted = 0;
  let maxOccurredAtMs = 0;
  let maxExternalId = "";

  try {
    const today = new Date();
    const tsymd = `${today.getFullYear()}${String(
      today.getMonth() + 1
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const trtm = `${String(today.getHours()).padStart(2, "0")}${String(
      today.getMinutes()
    ).padStart(2, "0")}${String(today.getSeconds()).padStart(2, "0")}`;

    const state = await BankPollingState.findOne({ key }).lean();
    const fromDate =
      state?.lastOccurredAt instanceof Date
        ? state.lastOccurredAt
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const insymd =
      state?.lastOccurredAt instanceof Date
        ? `${state.lastOccurredAt.getFullYear()}${String(
            state.lastOccurredAt.getMonth() + 1
          ).padStart(2, "0")}${String(state.lastOccurredAt.getDate()).padStart(
            2,
            "0"
          )}`
        : `${fromDate.getFullYear()}${String(fromDate.getMonth() + 1).padStart(
            2,
            "0"
          )}${String(fromDate.getDate()).padStart(2, "0")}`;

    const ineymd = `${today.getFullYear()}${String(
      today.getMonth() + 1
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    for (let page = 1; page <= maxPages; page += 1) {
      const body = {
        Header: {
          ApiNm: "InquireTransactionHistory",
          Tsymd: tsymd,
          Trtm: trtm,
          Iscd: iscd,
          FintechApsno: fintechApsno,
          ApiSvcCd: apiSvcCd,
          IsTuno: makeIsTuno(tsymd),
          AccessToken: accessToken,
        },
        Bncd: bncd,
        Acno: acno,
        Insymd: insymd,
        Ineymd: ineymd,
        TrnsDsnc: trnsDsnc,
        Lnsq: lnsq,
        PageNo: String(page),
        Dmcnt: String(dmcnt),
      };

      const result = await callInquireTransactionHistory({ url, body });
      const rec = result?.rec || [];

      for (const r of rec) {
        const trdd = String(r?.Trdd || "").trim();
        const txtm = String(r?.Txtm || "").trim();
        const tuno = String(r?.Tuno || "").trim();
        const tram = toNumberOrNaN(r?.Tram);
        const balanceSign = String(r?.TrnsAfAcntBlncSmblCd || "").trim();
        const bnprCntn = String(r?.BnprCntn || "").trim();
        const smry = String(r?.Smr || "").trim();

        const occurredAt = toIsoFromNhDateTime(trdd, txtm);
        const printedContent = bnprCntn || smry || "";

        if (!/^\d{8}$/.test(trdd) || !/^\d{6}$/.test(txtm)) continue;
        if (!Number.isFinite(tram) || tram <= 0) continue;

        if (onlyDepositEnabled) {
          if (balanceSign) {
            if (balanceSign !== "+") continue;
          } else if (!allowUnknownDirection) {
            continue;
          }
        }

        const externalId = `nh:InquireTransactionHistory:${trdd}${txtm}:${
          tuno || ""
        }:${tram}`;

        await upsertBankTransaction({
          externalId,
          tranAmt: tram,
          printedContent,
          occurredAt,
          raw: {
            source: "NH",
            api: "InquireTransactionHistory",
            request: body,
            response: result?.raw,
            rec: r,
          },
        });

        inserted += 1;

        if (occurredAt) {
          const t = new Date(String(occurredAt)).getTime();
          if (Number.isFinite(t) && t >= maxOccurredAtMs) {
            if (
              t > maxOccurredAtMs ||
              String(externalId) > String(maxExternalId)
            ) {
              maxOccurredAtMs = t;
              maxExternalId = String(externalId);
            }
          }
        }
      }

      const iqtcnt = Number.isFinite(Number(result?.iqtcnt))
        ? Number(result.iqtcnt)
        : rec.length;
      if (rec.length === 0) break;
      if (iqtcnt < dmcnt) break;
    }

    if (maxOccurredAtMs > 0) {
      await BankPollingState.updateOne(
        { key },
        {
          $set: {
            lastOccurredAt: new Date(maxOccurredAtMs),
            lastExternalId: String(maxExternalId || ""),
          },
        }
      );
    }

    return { skipped: false, inserted };
  } finally {
    await releaseLock({ key, owner });
  }
}
