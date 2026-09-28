// related files:
// - web/backend/services/practiceTransferBilling.service.js (releasePracticeTransferLabShare)

import { Types } from "mongoose";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import {
  readPracticeToLabSettlementBlock,
  releasePracticeTransferLabShare,
} from "../../services/practiceTransferBilling.service.js";

const makeTransfer = (billing, extra = {}) => ({
  _id: new Types.ObjectId(),
  practiceBusinessAnchorId: new Types.ObjectId(),
  targetLabAnchorId: new Types.ObjectId(),
  toothWorks: [],
  billing,
  ...extra,
});

const insertLabHold = (transfer, amount) =>
  LedgerJournal.create({
    journalId: `test-hold-${String(transfer._id)}`,
    idempotencyKey: `practice_transfer:${String(transfer._id)}:hold_lab`,
    eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
    businessAnchorId: transfer.practiceBusinessAnchorId,
    refType: "PRACTICE_TRANSFER",
    refId: transfer._id,
    occurredAt: new Date(),
    meta: { amount },
  });

describe("releasePracticeTransferLabShare zero hold", () => {
  test("zero lab fee without HOLD journal settles as zero_lab_fee", async () => {
    const result = await releasePracticeTransferLabShare({
      transfer: makeTransfer({ labFeeTotal: 0, heldLabTotal: 0, heldTotal: 0 }),
    });
    expect(result.released).toBe(false);
    expect(result.reason).toBe("zero_lab_fee");
  });

  test("held lab share with missing HOLD journal stays no_hold", async () => {
    const result = await releasePracticeTransferLabShare({
      transfer: makeTransfer({ labFeeTotal: 0, heldLabTotal: 50000, heldTotal: 50000 }),
    });
    expect(result.released).toBe(false);
    expect(result.reason).toBe("no_hold");
  });
});

describe("releasePracticeTransferLabShare prosthesis upload gate", () => {
  test("prosthesis-only transfer is not settled before the design file upload", async () => {
    const transfer = makeTransfer(
      {
        labFeeTotal: 60000,
        heldLabTotal: 60000,
        heldTotal: 60000,
        requireLabProsthesisUpload: true,
      },
      {
        toothWorks: [{ toothNumber: "16", prosthesisType: "크라운" }],
        resultFiles: [],
      },
    );
    await insertLabHold(transfer, 60000);
    const result = await releasePracticeTransferLabShare({ transfer });
    expect(result.released).toBe(false);
    expect(result.reason).toBe("awaiting_prosthesis_upload");
  });

  const cooperation = ({ requireLabProsthesisUpload, toothWorks, extra = {} }) => {
    const prime = new Types.ObjectId();
    return makeTransfer(
      { requireLabProsthesisUpload },
      {
        targetLabAnchorId: prime,
        assigneeLabAnchorId: new Types.ObjectId(),
        assigneeKind: "cooperation",
        toothWorks,
        resultFiles: [],
        ...extra,
      },
    );
  };

  test("practice opted out of prosthesis files: prosthesis-only settles at work start", async () => {
    const transfer = cooperation({
      requireLabProsthesisUpload: false,
      toothWorks: [{ toothNumber: "16", prosthesisType: "크라운" }],
    });
    expect(await readPracticeToLabSettlementBlock(transfer)).toBeNull();
  });

  test("practice opted out: CA settles once abutment STL is uploaded, without prosthesis", async () => {
    const toothWorks = [
      { toothNumber: "16", prosthesisType: "크라운", customAbutment: true },
    ];
    const waiting = cooperation({ requireLabProsthesisUpload: false, toothWorks });
    expect(await readPracticeToLabSettlementBlock(waiting)).toBe(
      "awaiting_abutment_design_stl",
    );
    const uploaded = cooperation({
      requireLabProsthesisUpload: false,
      toothWorks,
      extra: {
        production: {
          designFiles: [{ tooth: "16", file: { s3Key: "k", originalName: "16.stl" } }],
        },
      },
    });
    expect(await readPracticeToLabSettlementBlock(uploaded)).toBeNull();
  });

  test("practice wants prosthesis files: cooperation lab waits for upload", async () => {
    const transfer = cooperation({
      requireLabProsthesisUpload: true,
      toothWorks: [{ toothNumber: "16", prosthesisType: "크라운" }],
    });
    expect(await readPracticeToLabSettlementBlock(transfer)).toBe(
      "awaiting_prosthesis_upload",
    );
  });
});
