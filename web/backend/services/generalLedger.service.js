// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/requestCreditHold.service.js
// change-log:
// - 2026-09-03: postGeneralLedgerJournals — 같은 ClientSession에서 insertMany 병렬 금지
//   (NoSuchTransaction/txn number mismatch). journal→line 순차 + TransientTransaction 1회 재시도.
// - 2026-08-21: postGeneralLedgerJournals — journal/line insertMany 병렬.
// - 2026-08-19: 배송비 보류 형제 조회는 getJournalsByIdempotencyKeys로 1회.
// - 2026-08-19: 신규 의뢰 제출 보류는 postGeneralLedgerJournals로 저널·라인을 insertMany 1회.
import crypto from "crypto";
import mongoose from "mongoose";
import LedgerJournal, {
  LEDGER_JOURNAL_EVENT_TYPES,
} from "../models/ledgerJournal.model.js";
import LedgerLine, {
  LEDGER_LINE_ACCOUNT_CODES,
  LEDGER_OWNER_ROLES,
} from "../models/ledgerLine.model.js";

function isValidObjectId(value) {
  const raw = String(value || "").trim();
  return raw && mongoose.Types.ObjectId.isValid(raw);
}

function toObjectId(value) {
  if (!isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function assertEventType(eventType) {
  if (!LEDGER_JOURNAL_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Unsupported eventType: ${eventType}`);
  }
}

function assertLines(lines) {
  if (!Array.isArray(lines) || lines.length <= 0) {
    throw new Error("Ledger lines are required.");
  }

  for (const line of lines) {
    if (!LEDGER_LINE_ACCOUNT_CODES.includes(String(line?.accountCode || ""))) {
      throw new Error(`Unsupported accountCode: ${String(line?.accountCode || "")}`);
    }
    if (!LEDGER_OWNER_ROLES.includes(String(line?.ownerRole || ""))) {
      throw new Error(`Unsupported ownerRole: ${String(line?.ownerRole || "")}`);
    }
    if (!isValidObjectId(line?.ownerId)) {
      throw new Error("Ledger line ownerId is required and must be ObjectId.");
    }
    if (!Number.isFinite(Number(line?.amount))) {
      throw new Error("Ledger line amount must be a finite number.");
    }
  }
}

function buildJournalDoc({
  journalId,
  idempotencyKey,
  eventType,
  businessAnchorId,
  refType,
  refId,
  stageFrom,
  stageTo,
  occurredAt,
  createdBy,
  meta,
}) {
  const anchorId = toObjectId(businessAnchorId);
  if (!anchorId) {
    throw new Error("businessAnchorId is required and must be ObjectId.");
  }

  const resolvedJournalId = String(journalId || "").trim() || crypto.randomUUID();
  const resolvedIdempotencyKey = String(idempotencyKey || "").trim();
  if (!resolvedIdempotencyKey) {
    throw new Error("idempotencyKey is required.");
  }

  return {
    journalId: resolvedJournalId,
    idempotencyKey: resolvedIdempotencyKey,
    eventType,
    businessAnchorId: anchorId,
    refType: String(refType || "").trim(),
    refId: toObjectId(refId),
    stageFrom: String(stageFrom || "").trim(),
    stageTo: String(stageTo || "").trim(),
    occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    createdBy: toObjectId(createdBy),
    status: "POSTED",
    meta: meta || null,
  };
}

function buildLineDocs({ lines, journalDoc }) {
  const occurredAt = journalDoc.occurredAt || new Date();
  const businessAnchorId = journalDoc.businessAnchorId;

  return lines.map((line, idx) => ({
    journalId: journalDoc.journalId,
    lineNo: idx + 1,
    businessAnchorId,
    accountCode: String(line.accountCode),
    ownerRole: String(line.ownerRole),
    ownerId: toObjectId(line.ownerId),
    amount: Number(line.amount || 0),
    amountExcludingVat:
      line.amountExcludingVat === null || line.amountExcludingVat === undefined
        ? null
        : Number(line.amountExcludingVat),
    vatAmount:
      line.vatAmount === null || line.vatAmount === undefined
        ? 0
        : Number(line.vatAmount),
    amountIncludingVat:
      line.amountIncludingVat === null || line.amountIncludingVat === undefined
        ? null
        : Number(line.amountIncludingVat),
    creditKind: line.creditKind || null,
    occurredAt,
    refType: String(line.refType || journalDoc.refType || "").trim(),
    refId: toObjectId(line.refId || journalDoc.refId),
    meta: line.meta || null,
  }));
}

export async function getJournalByIdempotencyKey({ idempotencyKey, session }) {
  const key = String(idempotencyKey || "").trim();
  if (!key) return null;

  return LedgerJournal.findOne({ idempotencyKey: key })
    .session(session || null)
    .lean();
}

export async function getJournalsByIdempotencyKeys({
  idempotencyKeys = [],
  session = null,
}) {
  const keys = [
    ...new Set(
      (Array.isArray(idempotencyKeys) ? idempotencyKeys : [])
        .map((key) => String(key || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!keys.length) return new Map();

  const rows = await LedgerJournal.find({ idempotencyKey: { $in: keys } })
    .session(session || null)
    .lean();
  const byKey = new Map();
  for (const row of rows || []) {
    const key = String(row?.idempotencyKey || "").trim();
    if (!key || byKey.has(key)) continue;
    byKey.set(key, row);
  }
  return byKey;
}

export async function postGeneralLedgerJournal({
  journalId,
  idempotencyKey,
  eventType,
  businessAnchorId,
  refType = "",
  refId = null,
  stageFrom = "",
  stageTo = "",
  occurredAt = null,
  createdBy = null,
  meta = null,
  lines = [],
  session = null,
  /** caller가 이미 조회했을 때 중복 find 생략(11000으로 경합 처리) */
  skipIdempotencyLookup = false,
}) {
  assertEventType(eventType);
  assertLines(lines);

  if (!skipIdempotencyLookup) {
    const existing = await getJournalByIdempotencyKey({ idempotencyKey, session });
    if (existing?.journalId) {
      return {
        posted: false,
        idempotent: true,
        journalId: existing.journalId,
      };
    }

    // 트랜잭션 스냅샷 가시성 보강:
    // 외부 session 트랜잭션에서는 "트랜잭션 시작 이후"에 커밋된 저널이 snapshot에 안 보일 수 있다.
    // 중복 insert(11000)로 트랜잭션이 불필요하게 깨지지 않도록, 최신 committed view를 한 번 더 확인한다.
    if (session) {
      const latestCommitted = await getJournalByIdempotencyKey({
        idempotencyKey,
        session: null,
      });
      if (latestCommitted?.journalId) {
        return {
          posted: false,
          idempotent: true,
          journalId: latestCommitted.journalId,
        };
      }
    }
  }

  const journalDoc = buildJournalDoc({
    journalId,
    idempotencyKey,
    eventType,
    businessAnchorId,
    refType,
    refId,
    stageFrom,
    stageTo,
    occurredAt,
    createdBy,
    meta,
  });
  const lineDocs = buildLineDocs({ lines, journalDoc });

  const ownSession = !session;
  const txSession = session || (await mongoose.startSession());

  try {
    if (ownSession) txSession.startTransaction();

    await LedgerJournal.create([journalDoc], { session: txSession });
    await LedgerLine.insertMany(lineDocs, { session: txSession, ordered: true });

    if (ownSession) await txSession.commitTransaction();

    return {
      posted: true,
      idempotent: false,
      journalId: journalDoc.journalId,
    };
  } catch (error) {
    if (ownSession) {
      await txSession.abortTransaction().catch(() => null);
    }

    if (Number(error?.code || 0) === 11000) {
      const concurrentExisting = await getJournalByIdempotencyKey({
        idempotencyKey,
        session: null,
      });
      if (concurrentExisting?.journalId) {
        return {
          posted: false,
          idempotent: true,
          journalId: concurrentExisting.journalId,
        };
      }
    }

    throw error;
  } finally {
    if (ownSession) {
      await txSession.endSession().catch(() => null);
    }
  }
}

/**
 * 같은 트랜잭션에서 여러 저널을 insertMany로 기록한다.
 * 신규 의뢰 제출 보류처럼 방금 만든 ref에 대해 선행 idempotency 조회를 생략한다.
 *
 * NOTE: Mongo ClientSession은 동시 사용 불가 — journal/line insertMany를
 * Promise.all로 돌리면 txn number mismatch(NoSuchTransaction)가 난다.
 */
export async function postGeneralLedgerJournals({
  entries = [],
  session = null,
}) {
  const list = (Array.isArray(entries) ? entries : []).filter(Boolean);
  if (!list.length) return [];

  const journalDocs = [];
  const lineDocs = [];
  for (const entry of list) {
    assertEventType(entry.eventType);
    assertLines(entry.lines);
    const journalDoc = buildJournalDoc(entry);
    journalDocs.push(journalDoc);
    lineDocs.push(...buildLineDocs({ lines: entry.lines, journalDoc }));
  }

  const runOnce = async () => {
    const ownSession = !session;
    const txSession = session || (await mongoose.startSession());

    try {
      if (ownSession) txSession.startTransaction();

      // 같은 session에서는 반드시 순차 (병렬 시 TransientTransactionError)
      await LedgerJournal.insertMany(journalDocs, {
        session: txSession,
        ordered: true,
      });
      await LedgerLine.insertMany(lineDocs, {
        session: txSession,
        ordered: true,
      });

      if (ownSession) await txSession.commitTransaction();

      return journalDocs.map((journalDoc) => ({
        posted: true,
        idempotent: false,
        journalId: journalDoc.journalId,
      }));
    } catch (error) {
      if (ownSession) {
        await txSession.abortTransaction().catch(() => null);
      }
      throw error;
    } finally {
      if (ownSession) {
        await txSession.endSession().catch(() => null);
      }
    }
  };

  try {
    return await runOnce();
  } catch (error) {
    const labels = error?.errorLabelSet;
    const isTransient =
      (labels && typeof labels.has === "function" && labels.has("TransientTransactionError")) ||
      Number(error?.code || 0) === 251 ||
      String(error?.codeName || "") === "NoSuchTransaction";
    // 호출측이 session을 넘긴 경우 재시도하면 바깥 txn과 꼬이므로 ownSession 경로만.
    if (!session && isTransient) {
      console.warn(
        "[postGeneralLedgerJournals] TransientTransactionError — retry once",
        error?.message || error,
      );
      return await runOnce();
    }
    throw error;
  }
}

export async function deleteGeneralLedgerCommitJournal({
  journalId,
  expectedEventTypes = ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
  session = null,
}) {
  const id = String(journalId || "").trim();
  if (!id) {
    return { deleted: false, reason: "invalid_journal_id" };
  }

  const ownSession = !session;
  const txSession = session || (await mongoose.startSession());

  try {
    if (ownSession) txSession.startTransaction();

    const journal = await LedgerJournal.findOne({ journalId: id })
      .session(txSession)
      .lean();

    if (!journal?.journalId) {
      if (ownSession) await txSession.commitTransaction();
      return { deleted: false, reason: "not_found" };
    }

    if (
      Array.isArray(expectedEventTypes) &&
      expectedEventTypes.length > 0 &&
      !expectedEventTypes.includes(String(journal.eventType || ""))
    ) {
      if (ownSession) await txSession.commitTransaction();
      return {
        deleted: false,
        reason: "event_type_mismatch",
        eventType: String(journal.eventType || ""),
      };
    }

    await LedgerLine.deleteMany({ journalId: id }, { session: txSession });
    await LedgerJournal.deleteOne({ journalId: id }, { session: txSession });

    if (ownSession) await txSession.commitTransaction();

    return { deleted: true, journalId: id };
  } catch (error) {
    if (ownSession) {
      await txSession.abortTransaction().catch(() => null);
    }
    throw error;
  } finally {
    if (ownSession) {
      await txSession.endSession().catch(() => null);
    }
  }
}
