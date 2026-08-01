// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
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
}) {
  assertEventType(eventType);
  assertLines(lines);

  const existing = await getJournalByIdempotencyKey({ idempotencyKey, session });
  if (existing?.journalId) {
    return {
      posted: false,
      idempotent: true,
      journalId: existing.journalId,
    };
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
        session: ownSession ? null : txSession,
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
