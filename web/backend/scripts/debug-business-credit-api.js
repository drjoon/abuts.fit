import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeBusinessNumber } from "../utils/businessAnchor.utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../local.env") });

const businessAnchorId = "69cb428b62191de7d4f75ca1"; // 향기로운치과

async function debugBusinessCreditApi() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    // adminGetBusinessCredits 로직 재현
    const orgs = await BusinessAnchor.find({
      _id: new mongoose.Types.ObjectId(businessAnchorId),
    })
      .select({
        _id: 1,
        name: 1,
        businessType: 1,
        businessAnchorId: 1,
        metadata: 1,
        primaryContactUserId: 1,
      })
      .lean();

    console.log("\n=== BusinessAnchor ===");
    console.log(JSON.stringify(orgs, null, 2));

    const orgAnchorIds = orgs
      .map((org) => String(org._id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const ledgerData = await CreditLedger.aggregate([
      { $match: { businessAnchorId: { $in: orgAnchorIds } } },
      {
        $group: {
          _id: "$businessAnchorId",
          chargedPaid: {
            $sum: {
              $cond: [
                { $in: ["$type", ["CHARGE", "REFUND"]] },
                { $max: [{ $abs: "$amount" }, 0] },
                0,
              ],
            },
          },
          chargedBonusRequest: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "BONUS"] },
                    { $ne: ["$refType", "FREE_SHIPPING_CREDIT"] },
                  ],
                },
                { $max: ["$amount", 0] },
                0,
              ],
            },
          },
          chargedBonusShipping: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "BONUS"] },
                    { $eq: ["$refType", "FREE_SHIPPING_CREDIT"] },
                  ],
                },
                { $max: ["$amount", 0] },
                0,
              ],
            },
          },
          adjustSum: {
            $sum: {
              $cond: [{ $eq: ["$type", "ADJUST"] }, "$amount", 0],
            },
          },
          spentTotal: {
            $sum: {
              $cond: [{ $eq: ["$type", "SPEND"] }, { $abs: "$amount" }, 0],
            },
          },
          spentPaidSum: {
            $sum: {
              $cond: [
                { $eq: ["$type", "SPEND"] },
                { $ifNull: ["$spentPaidAmount", 0] },
                0,
              ],
            },
          },
          spentBonusRequestSum: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "SPEND"] },
                    { $ne: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
                { $ifNull: ["$spentBonusAmount", 0] },
                0,
              ],
            },
          },
          spentBonusShippingSum: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "SPEND"] },
                    { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
                { $ifNull: ["$spentBonusAmount", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    console.log("\n=== Ledger Aggregation ===");
    console.log(JSON.stringify(ledgerData, null, 2));

    const balanceMap = {};
    ledgerData.forEach((item) => {
      const chargedPaid = Number(item.chargedPaid || 0);
      const chargedBonusRequest = Number(item.chargedBonusRequest || 0);
      const chargedBonusShipping = Number(item.chargedBonusShipping || 0);
      const adjustSum = Number(item.adjustSum || 0);
      const spentTotal = Number(item.spentTotal || 0);
      const spentPaidRaw = Number(item.spentPaidSum || 0);
      const spentBonusRequestRaw = Number(item.spentBonusRequestSum || 0);
      const spentBonusShippingRaw = Number(item.spentBonusShippingSum || 0);

      const spentBonusTotal = spentBonusRequestRaw + spentBonusShippingRaw;
      let spentPaid, spentBonusRequest, spentBonusShipping;

      console.log("\n=== Balance Calculation ===");
      console.log(`chargedBonusRequest: ${chargedBonusRequest}`);
      console.log(`chargedBonusShipping: ${chargedBonusShipping}`);
      console.log(`spentTotal: ${spentTotal}`);
      console.log(`spentPaidRaw: ${spentPaidRaw}`);
      console.log(`spentBonusRequestRaw: ${spentBonusRequestRaw}`);
      console.log(`spentBonusShippingRaw: ${spentBonusShippingRaw}`);
      console.log(`spentBonusTotal: ${spentBonusTotal}`);
      console.log(
        `Match: ${Math.round(spentPaidRaw + spentBonusTotal)} === ${Math.round(spentTotal)} ? ${Math.round(spentPaidRaw + spentBonusTotal) === Math.round(spentTotal)}`,
      );

      if (
        Math.round(spentPaidRaw + spentBonusTotal) === Math.round(spentTotal)
      ) {
        spentPaid = spentPaidRaw;
        spentBonusRequest = spentBonusRequestRaw;
        spentBonusShipping = spentBonusShippingRaw;
        console.log("Using stored values");
      } else {
        console.log("Using fallback calculation");
        const totalBonus = chargedBonusRequest + chargedBonusShipping;
        const spentBonus = Math.min(totalBonus, spentTotal);
        spentPaid = spentTotal - spentBonus;

        if (totalBonus > 0) {
          spentBonusRequest = spentBonus * (chargedBonusRequest / totalBonus);
          spentBonusShipping = spentBonus * (chargedBonusShipping / totalBonus);
        } else {
          spentBonusRequest = 0;
          spentBonusShipping = 0;
        }

        console.log(`totalBonus: ${totalBonus}`);
        console.log(`spentBonus: ${spentBonus}`);
        console.log(`spentPaid: ${spentPaid}`);
        console.log(`spentBonusRequest: ${spentBonusRequest}`);
        console.log(`spentBonusShipping: ${spentBonusShipping}`);
      }

      const paidCredit = chargedPaid + adjustSum - spentPaid;
      const bonusRequestCredit = chargedBonusRequest - spentBonusRequest;
      const bonusShippingCredit = chargedBonusShipping - spentBonusShipping;

      console.log("\n=== Final Balance ===");
      console.log(`paidCredit: ${paidCredit}`);
      console.log(`bonusRequestCredit: ${bonusRequestCredit}`);
      console.log(`bonusShippingCredit: ${bonusShippingCredit}`);

      balanceMap[String(item._id)] = {
        balance: Math.max(
          0,
          paidCredit + bonusRequestCredit + bonusShippingCredit,
        ),
        paidCredit: Math.max(0, paidCredit),
        bonusRequestCredit: Math.max(0, bonusRequestCredit),
        bonusShippingCredit: Math.max(0, bonusShippingCredit),
        spentAmount: Math.max(0, spentTotal),
        chargedPaidAmount: Math.max(0, chargedPaid),
        chargedBonusRequestAmount: Math.max(0, chargedBonusRequest),
        chargedBonusShippingAmount: Math.max(0, chargedBonusShipping),
        spentPaidAmount: Math.max(0, spentPaid),
        spentBonusRequestAmount: Math.max(0, spentBonusRequest),
        spentBonusShippingAmount: Math.max(0, spentBonusShipping),
      };
    });

    console.log("\n=== Balance Map ===");
    console.log(JSON.stringify(balanceMap, null, 2));

    const result = orgs.map((org) => {
      const anchorId = String(org._id);
      const balanceInfo = balanceMap[anchorId] || {};

      return {
        _id: org._id,
        businessAnchorId: anchorId,
        businessType: String(org.businessType || "").trim(),
        name: org.name,
        ...balanceInfo,
      };
    });

    console.log("\n=== Final Result ===");
    console.log(JSON.stringify(result, null, 2));

    await mongoose.disconnect();
    console.log("\nMongoDB disconnected");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugBusinessCreditApi();
