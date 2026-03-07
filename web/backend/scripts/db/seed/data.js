import CreditLedger from "../../../models/creditLedger.model.js";
import Request from "../../../models/request.model.js";
import SalesmanLedger from "../../../models/salesmanLedger.model.js";
import ShippingPackage from "../../../models/shippingPackage.model.js";
import User from "../../../models/user.model.js";
import {
  createObjectId,
  generateRequestId,
  pick,
  randInt,
  toKstYmd,
} from "./utils.js";

async function ensureFundingForOrganization({ organizationId, userId, uniqueKey }) {
  const chargeKey = `seed:charge:${uniqueKey}`;
  const bonusKey = `seed:bonus:${uniqueKey}`;

  const existingCharge = await CreditLedger.findOne({ uniqueKey: chargeKey });
  if (!existingCharge) {
    await CreditLedger.create({
      organizationId,
      userId,
      type: "CHARGE",
      amount: 3000000,
      refType: "SEED_DEPOSIT",
      refId: null,
      uniqueKey: chargeKey,
    });
  }

  const existingBonus = await CreditLedger.findOne({ uniqueKey: bonusKey });
  if (!existingBonus) {
    await CreditLedger.create({
      organizationId,
      userId,
      type: "BONUS",
      amount: 30000,
      refType: "SEED_BONUS",
      refId: null,
      uniqueKey: bonusKey,
    });
  }
}

export async function seedRequestData({ count = 50 } = {}) {
  const requestorUsers = await User.find({
    role: "requestor",
    active: true,
    organizationId: { $ne: null },
  })
    .sort({ email: 1 })
    .lean();

  const requestors = requestorUsers.filter(
    (user) => user.requestorRole === "owner" || !user.requestorRole,
  );
  const requestorPool = requestors.length ? requestors : requestorUsers;
  if (!requestorPool.length) {
    throw new Error("seed-data를 실행하려면 먼저 requestor 계정을 생성해야 합니다.");
  }

  const salesmen = await User.find({ role: "salesman", active: true }).lean();
  const salesmenById = new Map(salesmen.map((user) => [String(user._id), user]));
  const lastNDays = 20;
  const generatedRequestIds = new Set();
  const requestDocs = [];
  const creditLedgerDocs = [];
  const salesmanLedgerDocs = [];
  const shippingPackageDocs = [];
  const completedByOrg = new Map();
  const orgFunding = new Map();

  for (const requestor of requestorPool) {
    await ensureFundingForOrganization({
      organizationId: requestor.organizationId,
      userId: requestor._id,
      uniqueKey: requestor.email,
    });
    orgFunding.set(String(requestor.organizationId), {
      remainingPaid: 3000000,
      remainingBonus: 30000,
    });
  }

  for (let index = 0; index < count; index += 1) {
    const owner = pick(requestorPool);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - randInt(0, lastNDays));

    const approvedAt = owner.approvedAt ? new Date(owner.approvedAt) : null;
    const isNewUser =
      approvedAt &&
      createdAt < new Date(approvedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
    const amount = isNewUser ? 10000 : 15000;
    const isCompleted = Math.random() < 0.8;
    const status = isCompleted
      ? "완료"
      : pick(["의뢰", "CAM", "가공", "세척.패킹", "포장.발송"]);
    const manufacturerStage = (() => {
      if (isCompleted) return "추적관리";
      if (status === "의뢰") return "의뢰";
      if (status === "CAM") return "CAM";
      if (status === "가공") return "가공";
      if (status === "세척.패킹") return "세척.패킹";
      if (status === "포장.발송") return "포장.발송";
      return "의뢰";
    })();

    const orgKey = String(owner.organizationId);
    const funding = orgFunding.get(orgKey) || {
      remainingPaid: 3000000,
      remainingBonus: 30000,
    };
    const fromBonus = Math.min(Math.max(0, funding.remainingBonus), amount);
    const paidAmount = amount - fromBonus;
    const bonusAmount = fromBonus;

    const requestObjectId = createObjectId();
    const requestId = generateRequestId(createdAt, generatedRequestIds);
    const requestDoc = {
      _id: requestObjectId,
      requestId,
      requestorOrganizationId: owner.organizationId,
      requestor: owner._id,
      manufacturer: null,
      caseInfos: {
        clinicName: `seed 치과 ${randInt(1, 20)}`,
        patientName: `환자${index + 1}`,
        tooth: pick(["11", "12", "21", "22", "31", "41"]),
        implantManufacturer: pick(["OSSTEM", "STRAUMANN", "DIO"]),
        implantBrand: pick(["TS", "BLT", "UFII"]),
        implantFamily: pick(["Regular", "Mini"]),
        implantType: pick(["Hex", "Non-Hex"]),
        reviewByStage: {
          shipping: {
            status: isCompleted ? "APPROVED" : "PENDING",
            updatedAt: createdAt,
            updatedBy: owner._id,
            reason: "",
          },
        },
      },
      status,
      manufacturerStage,
      createdAt,
      updatedAt: createdAt,
    };

    if (isCompleted) {
      requestDoc.price = {
        amount,
        baseAmount: amount,
        discountAmount: 0,
        currency: "KRW",
        rule: isNewUser ? "new_user_90days_fixed_10000" : "base_price",
        paidAmount,
        bonusAmount,
      };

      funding.remainingBonus -= bonusAmount;
      funding.remainingPaid -= paidAmount;
      creditLedgerDocs.push({
        organizationId: owner.organizationId,
        userId: owner._id,
        type: "SPEND",
        amount: -amount,
        spentPaidAmount: paidAmount,
        spentBonusAmount: bonusAmount,
        refType: "SEED_REQUEST",
        refId: requestObjectId,
        uniqueKey: `seed:spend:${owner.email}:${String(requestObjectId)}`,
      });

      const bucket = completedByOrg.get(orgKey) || [];
      bucket.push(requestDoc);
      completedByOrg.set(orgKey, bucket);

      const directSalesman = owner.referredByUserId
        ? salesmenById.get(String(owner.referredByUserId))
        : null;
      if (directSalesman && paidAmount > 0) {
        const earnAmount = Math.round(paidAmount * 0.05);
        if (earnAmount > 0) {
          salesmanLedgerDocs.push({
            salesmanId: directSalesman._id,
            type: "EARN",
            amount: earnAmount,
            refType: "SEED_REQUEST",
            refId: requestObjectId,
            uniqueKey: `seed:salesman:earn:direct:${String(directSalesman._id)}:${String(requestObjectId)}`,
          });
        }

        const indirectSalesman = directSalesman.referredByUserId
          ? salesmenById.get(String(directSalesman.referredByUserId))
          : null;
        if (indirectSalesman) {
          const level1Amount = Math.round(paidAmount * 0.025);
          if (level1Amount > 0) {
            salesmanLedgerDocs.push({
              salesmanId: indirectSalesman._id,
              type: "EARN",
              amount: level1Amount,
              refType: "SEED_REQUEST_LEVEL1",
              refId: requestObjectId,
              uniqueKey: `seed:salesman:earn:level1:${String(indirectSalesman._id)}:${String(requestObjectId)}`,
            });
          }
        }
      }
    }

    orgFunding.set(orgKey, funding);
    requestDocs.push(requestDoc);
  }

  for (const [orgKey, docs] of completedByOrg.entries()) {
    const organizationRequests = [...docs];
    let cursor = 0;
    let pkgIndex = 0;
    while (cursor < organizationRequests.length) {
      const remaining = organizationRequests.length - cursor;
      const chunkSize = Math.min(randInt(3, 20), Math.max(1, remaining));
      const chunk = organizationRequests.slice(cursor, cursor + chunkSize);
      cursor += chunkSize;
      pkgIndex += 1;

      const shipDate = new Date();
      shipDate.setDate(
        shipDate.getDate() - Math.min(lastNDays, pkgIndex + randInt(0, 3)),
      );
      const packageId = createObjectId();
      const organizationId = chunk[0]?.requestorOrganizationId || orgKey;
      const userId = chunk[0]?.requestor;
      shippingPackageDocs.push({
        _id: packageId,
        organizationId,
        shipDateYmd: `${toKstYmd(shipDate)}-p${pkgIndex}`,
        requestIds: chunk.map((doc) => doc._id),
        shippingFeeSupply: 3500,
        shippingFeeVat: 0,
        createdBy: userId,
        createdAt: shipDate,
        updatedAt: shipDate,
      });

      chunk.forEach((doc) => {
        doc.shippingPackageId = packageId;
      });

      creditLedgerDocs.push({
        organizationId,
        userId,
        type: "SPEND",
        amount: -3500,
        spentPaidAmount: 3500,
        spentBonusAmount: 0,
        refType: "SHIPPING_FEE",
        refId: packageId,
        uniqueKey: `seed:shipping-fee:${String(organizationId)}:${String(packageId)}`,
      });
    }
  }

  if (requestDocs.length) {
    await Request.insertMany(requestDocs, { ordered: false });
  }
  if (shippingPackageDocs.length) {
    await ShippingPackage.insertMany(shippingPackageDocs, { ordered: false });
  }
  if (creditLedgerDocs.length) {
    await CreditLedger.insertMany(creditLedgerDocs, { ordered: false });
  }
  if (salesmanLedgerDocs.length) {
    await SalesmanLedger.insertMany(salesmanLedgerDocs, { ordered: false });
  }

  return {
    requestCount: requestDocs.length,
    shippingPackageCount: shippingPackageDocs.length,
    creditLedgerCount: creditLedgerDocs.length,
    salesmanLedgerCount: salesmanLedgerDocs.length,
    requestorCount: requestorPool.length,
  };
}
