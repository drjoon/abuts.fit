// related files:
// - web/backend/services/labDemoCredit.service.js
// - web/backend/controllers/businesses/business.demoMode.util.js
import mongoose from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  aggregateLabDemoSettlementByPractice,
  aggregatePracticeLabCredits,
  classifyPracticeCreditOwner,
  computeLabDemoSettlementCredit,
} from "../../services/labDemoCredit.service.js";
import {
  DEMO_MODE_DURATION_DAYS,
  getDemoOrderBlock,
} from "../../controllers/businesses/business.demoMode.util.js";

const oid = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

describe("classifyPracticeCreditOwner", () => {
  const prime = "64a000000000000000000001";
  const partner = "64a000000000000000000099";
  const base = { targetLabAnchorId: prime, assigneeLabAnchorId: partner };

  test("cooperation: assignee direct, prime pass-through ignored", () => {
    const ptx = { ...base, assigneeKind: "cooperation" };
    expect(
      classifyPracticeCreditOwner({ ownerId: partner, ptx }),
    ).toBe("direct");
    expect(
      classifyPracticeCreditOwner({
        ownerId: prime,
        ptx,
        ownerIsInternalLab: true,
      }),
    ).toBe("ignore");
  });

  test("subcontract: prime (Abuts) approves, payee ignored", () => {
    const ptx = { ...base, assigneeKind: "subcontract" };
    expect(
      classifyPracticeCreditOwner({
        ownerId: prime,
        ptx,
        ownerIsInternalLab: true,
      }),
    ).toBe("abuts");
    expect(
      classifyPracticeCreditOwner({ ownerId: partner, ptx }),
    ).toBe("ignore");
  });

  test("self-performed: internalLab is abuts, external lab is direct", () => {
    const ptx = { targetLabAnchorId: prime };
    expect(
      classifyPracticeCreditOwner({
        ownerId: prime,
        ptx,
        ownerIsInternalLab: true,
      }),
    ).toBe("abuts");
    expect(classifyPracticeCreditOwner({ ownerId: prime, ptx })).toBe("direct");
  });
});

describe("getDemoOrderBlock", () => {
  async function makePractice(patch) {
    const id = oid();
    await BusinessAnchor.collection.insertOne({
      _id: id,
      name: "t-practice",
      businessType: "requestor",
      requestorKind: "practice",
      businessNumberNormalized: String(Math.random()).slice(2, 12),
      demoMode: true,
      demoModeStartedAt: new Date(),
      demoModeExitedAt: null,
      conversionPendingAt: null,
      ...patch,
    });
    return id;
  }

  test("active demo is not blocked", async () => {
    const id = await makePractice({});
    expect(await getDemoOrderBlock(id)).toBeNull();
  });

  test("expired demo is blocked as demo_expired", async () => {
    const id = await makePractice({
      demoModeStartedAt: new Date(Date.now() - (DEMO_MODE_DURATION_DAYS + 1) * DAY),
    });
    expect((await getDemoOrderBlock(id))?.reason).toBe("demo_expired");
  });

  test("conversion pending is blocked", async () => {
    const id = await makePractice({ conversionPendingAt: new Date() });
    expect((await getDemoOrderBlock(id))?.reason).toBe("conversion_pending");
  });

  test("converted (exited) practice is not blocked", async () => {
    const id = await makePractice({
      demoMode: false,
      demoModeExitedAt: new Date(),
      demoModeStartedAt: new Date(Date.now() - 200 * DAY),
    });
    expect(await getDemoOrderBlock(id)).toBeNull();
  });
});

describe("lab demo credit aggregation", () => {
  let n = 0;
  async function anchor(fields) {
    const id = oid();
    await BusinessAnchor.collection.insertOne({
      _id: id,
      name: fields.name || "anchor",
      businessNumberNormalized: `9${Date.now()}${n++}`,
      ...fields,
    });
    return id;
  }
  async function ptx(fields) {
    const id = oid();
    await PracticeTransfer.collection.insertOne({
      _id: id,
      transferId: `t-${id}`,
      practiceUserId: oid(),
      ...fields,
    });
    return id;
  }
  async function credit(ownerId, refId, amount) {
    await LedgerLine.collection.insertOne({
      _id: oid(),
      journalId: `j-${oid()}`,
      lineNo: 1,
      businessAnchorId: ownerId,
      accountCode: "LAB_SETTLEMENT_CREDIT",
      ownerRole: "requestor",
      ownerId,
      amount,
      amountExcludingVat: amount,
      occurredAt: new Date(),
      refType: "PRACTICE_TRANSFER",
      refId,
    });
  }

  test("splits by cooperation / subcontract / demo status", async () => {
    const demoPractice = await anchor({
      businessType: "requestor",
      requestorKind: "practice",
      demoMode: true,
      demoModeExitedAt: null,
    });
    const realPractice = await anchor({
      businessType: "requestor",
      requestorKind: "practice",
      demoMode: false,
    });
    const abuts = await anchor({ businessType: "internalLab" });
    const coopLab = await anchor({ businessType: "requestor", requestorKind: "lab" });
    const subLab = await anchor({ businessType: "requestor", requestorKind: "lab" });

    const coop = await ptx({
      practiceBusinessAnchorId: demoPractice,
      targetLabAnchorId: abuts,
      assigneeLabAnchorId: coopLab,
      assigneeKind: "cooperation",
    });
    const sub = await ptx({
      practiceBusinessAnchorId: demoPractice,
      targetLabAnchorId: abuts,
      assigneeLabAnchorId: subLab,
      assigneeKind: "subcontract",
    });
    const self = await ptx({
      practiceBusinessAnchorId: demoPractice,
      targetLabAnchorId: abuts,
    });
    const real = await ptx({
      practiceBusinessAnchorId: realPractice,
      targetLabAnchorId: abuts,
      assigneeLabAnchorId: coopLab,
      assigneeKind: "cooperation",
    });

    await credit(coopLab, coop, 8000);
    await credit(abuts, coop, 0);
    await credit(abuts, sub, 1000);
    await credit(subLab, sub, 9000);
    await credit(abuts, self, 5000);
    await credit(coopLab, real, 7777);

    // 협력 기공소: 데모 치과분만 (실사용 치과분 제외)
    expect(await computeLabDemoSettlementCredit(coopLab)).toBe(8000);
    // 하청 기공소: 어벗츠가 지급하므로 데모 크레딧 없음
    expect(await computeLabDemoSettlementCredit(subLab)).toBe(0);
    // 어벗츠기공소: 하청 매출 + 자체
    expect(await computeLabDemoSettlementCredit(abuts)).toBe(6000);
    const byPractice = await aggregateLabDemoSettlementByPractice(abuts);
    expect(byPractice).toHaveLength(1);
    expect(String(byPractice[0].practiceAnchorId)).toBe(String(demoPractice));

    // 치과 입장 전환 행: 협력 기공소 + 어벗츠(승인 필요), 하청 기공소 없음
    const rows = await aggregatePracticeLabCredits(demoPractice);
    const byLab = new Map(rows.map((r) => [String(r.labAnchorId), r]));
    expect(byLab.size).toBe(2);
    expect(byLab.get(String(coopLab)).amount).toBe(8000);
    expect(byLab.get(String(coopLab)).isAbutsLab).toBe(false);
    expect(byLab.get(String(abuts)).amount).toBe(6000);
    expect(byLab.get(String(abuts)).isAbutsLab).toBe(true);
    expect(byLab.has(String(subLab))).toBe(false);
  });
});
