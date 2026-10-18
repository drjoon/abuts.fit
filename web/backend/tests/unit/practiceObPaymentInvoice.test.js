// related files:
// - web/backend/services/practiceObPaymentInvoice.service.js
// - web/backend/services/practiceObBilling.service.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";
import { aggregatePracticeMonthUsage } from "../../services/practiceObBilling.service.js";
import {
  allocateAbutsPaymentInvoice,
  issuePracticeObPaymentInvoices,
} from "../../services/practiceObPaymentInvoice.service.js";

describe("allocateAbutsPaymentInvoice", () => {
  test("스토어와 커스텀어벗을 이체액 그대로 나눈다", () => {
    expect(
      allocateAbutsPaymentInvoice(145_000, {
        storeSupplyAmount: 18_182,
        storeVatAmount: 1_818,
        storeTotalAmount: 20_000,
        abutmentAmount: 125_000,
      }),
    ).toEqual({
      storeSupply: 18_182,
      storeVat: 1_818,
      storeTotal: 20_000,
      abutment: 125_000,
    });
  });
});

describe("issuePracticeObPaymentInvoices", () => {
  test("이체 성공분만큼 스토어는 어벗츠, 기공서비스는 기공소 위수탁으로 만든다", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "6111111111",
      businessType: "requestor",
      requestorKind: "practice",
      practiceHasInHouseLab: false,
      name: "후불치과",
      metadata: { companyName: "후불치과" },
    });
    const lab = await BusinessAnchor.create({
      businessNumberNormalized: "6222222222",
      businessType: "requestor",
      requestorKind: "lab",
      name: "수행기공소",
      metadata: { companyName: "수행기공소" },
    });
    const optedOut = await BusinessAnchor.create({
      businessNumberNormalized: "6333333333",
      businessType: "requestor",
      requestorKind: "lab",
      name: "직접발행기공소",
      metadata: { companyName: "직접발행기공소" },
      taxInvoice: { trusteeIssueEnabled: false },
    });

    const settlementId = new Types.ObjectId();
    const split = {
      storeSupplyAmount: 18_182,
      storeVatAmount: 1_818,
      storeTotalAmount: 20_000,
      abutmentAmount: 30_000,
    };
    const settlement = {
      _id: settlementId,
      practiceAnchorId: practice._id,
      yearMonth: "2026-09",
      lines: [
        {
          payeeKind: "direct_lab",
          payeeAnchorId: lab._id,
          amount: 100_000,
          transferStatus: "SUCCESS",
        },
        {
          payeeKind: "direct_lab",
          payeeAnchorId: optedOut._id,
          amount: 40_000,
          transferStatus: "SUCCESS",
        },
        {
          payeeKind: "abuts_corp",
          amount: 50_000,
          transferStatus: "SUCCESS",
        },
      ],
    };

    const first = await issuePracticeObPaymentInvoices({
      settlement,
      invoiceSplit: split,
      now: new Date("2026-10-05T00:00:00+09:00"),
    });
    expect(first.created).toBe(3);
    expect(first.skippedOptOut).toBe(1);

    const drafts = await TaxInvoiceDraft.find({
      businessAnchorId: practice._id,
    }).lean();
    const labDraft = drafts.find((d) => d.direction === "LAB_TO_PRACTICE");
    const storeDraft = drafts.find(
      (d) => d.direction === "ABUTS_TO_CUSTOMER" && d.taxType === "과세",
    );
    const abutmentDraft = drafts.find(
      (d) => d.direction === "ABUTS_TO_CUSTOMER" && d.taxType === "면세",
    );
    expect(labDraft).toMatchObject({
      issuanceMode: "TRUSTEE",
      sellerAnchorId: lab._id,
      supplyAmount: 100_000,
      vatAmount: 0,
      itemName: "기공서비스(면세 계산서)",
    });
    expect(storeDraft).toMatchObject({
      issuanceMode: "SELF",
      supplyAmount: 18_182,
      vatAmount: 1_818,
      totalAmount: 20_000,
    });
    expect(abutmentDraft).toMatchObject({
      issuanceMode: "SELF",
      supplyAmount: 30_000,
      vatAmount: 0,
    });

    const second = await issuePracticeObPaymentInvoices({
      settlement,
      invoiceSplit: split,
      now: new Date("2026-10-05T00:00:00+09:00"),
    });
    expect(second.created).toBe(0);
    expect(second.skippedExisting).toBe(3);
  });
});

describe("aggregatePracticeMonthUsage prepaid custom abutment", () => {
  test("기공실 있는 치과의 어벗츠 커스텀어벗 주문은 OB 이체액에 넣지 않는다", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "6444444444",
      businessType: "requestor",
      requestorKind: "practice",
      practiceHasInHouseLab: true,
      name: "기공실치과",
    });
    const lab = await BusinessAnchor.create({
      businessNumberNormalized: "6555555555",
      businessType: "requestor",
      requestorKind: "lab",
      name: "기공소",
    });
    const createdAt = new Date("2026-09-15T10:00:00+09:00");
    const userId = new Types.ObjectId();
    await PracticeTransfer.create({
      transferId: "ptx-inhouse-1",
      practiceUserId: userId,
      practiceBusinessAnchorId: practice._id,
      targetLabAnchorId: lab._id,
      status: "active",
      createdAt,
      billing: { labFeeTotal: 80_000, abutmentTotal: 15_000 },
    });
    await Request.create({
      businessAnchorId: practice._id,
      requestor: userId,
      requestCategory: "order",
      manufacturerStage: "준비",
      createdAt,
      price: { amount: 45_000, paidAmount: 45_000 },
    });

    const usage = await aggregatePracticeMonthUsage({
      practiceAnchorId: practice._id,
      yearMonth: "2026-09",
    });
    expect(usage.directLabTotal).toBe(80_000);
    expect(usage.abutmentAmount).toBe(15_000);
    expect(usage.abutsCorpTotal).toBe(15_000);
  });
});
