import mongoose from "mongoose";
import CreditLedger from "../models/creditLedger.model.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../local.env") });

const businessAnchorId = "69cb428b62191de7d4f75ca1"; // 향기로운치과

async function debugAggregation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    const result = await CreditLedger.aggregate([
      {
        $match: {
          businessAnchorId: new mongoose.Types.ObjectId(businessAnchorId),
        },
      },
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

    console.log("\n=== 집계 결과 ===");
    console.log(JSON.stringify(result, null, 2));

    if (result.length > 0) {
      const item = result[0];
      const chargedPaid = Number(item.chargedPaid || 0);
      const chargedBonusRequest = Number(item.chargedBonusRequest || 0);
      const chargedBonusShipping = Number(item.chargedBonusShipping || 0);
      const adjustSum = Number(item.adjustSum || 0);
      const spentTotal = Number(item.spentTotal || 0);
      const spentPaidRaw = Number(item.spentPaidSum || 0);
      const spentBonusRequestRaw = Number(item.spentBonusRequestSum || 0);
      const spentBonusShippingRaw = Number(item.spentBonusShippingSum || 0);

      console.log("\n=== 계산 ===");
      console.log(`chargedPaid: ${chargedPaid}`);
      console.log(`chargedBonusRequest: ${chargedBonusRequest}`);
      console.log(`chargedBonusShipping: ${chargedBonusShipping}`);
      console.log(`adjustSum: ${adjustSum}`);
      console.log(`spentTotal: ${spentTotal}`);
      console.log(`spentPaidRaw: ${spentPaidRaw}`);
      console.log(`spentBonusRequestRaw: ${spentBonusRequestRaw}`);
      console.log(`spentBonusShippingRaw: ${spentBonusShippingRaw}`);

      const spentBonusTotal = spentBonusRequestRaw + spentBonusShippingRaw;
      console.log(`\nspentBonusTotal: ${spentBonusTotal}`);
      console.log(
        `spentPaidRaw + spentBonusTotal: ${spentPaidRaw + spentBonusTotal}`,
      );
      console.log(`Match check: ${Math.round(spentPaidRaw + spentBonusTotal) === Math.round(spentTotal)}`);

      if (
        Math.round(spentPaidRaw + spentBonusTotal) !== Math.round(spentTotal)
      ) {
        console.log("\n=== Fallback 로직 실행 ===");
        const totalBonus = chargedBonusRequest + chargedBonusShipping;
        const spentBonus = Math.min(totalBonus, spentTotal);
        const spentPaid = spentTotal - spentBonus;

        console.log(`totalBonus: ${totalBonus}`);
        console.log(`spentBonus: ${spentBonus}`);
        console.log(`spentPaid: ${spentPaid}`);

        let spentBonusRequest, spentBonusShipping;
        if (totalBonus > 0) {
          spentBonusRequest = spentBonus * (chargedBonusRequest / totalBonus);
          spentBonusShipping =
            spentBonus * (chargedBonusShipping / totalBonus);
        } else {
          spentBonusRequest = 0;
          spentBonusShipping = 0;
        }

        console.log(`spentBonusRequest: ${spentBonusRequest}`);
        console.log(`spentBonusShipping: ${spentBonusShipping}`);

        const paidCredit = chargedPaid + adjustSum - spentPaid;
        const bonusRequestCredit = chargedBonusRequest - spentBonusRequest;
        const bonusShippingCredit = chargedBonusShipping - spentBonusShipping;

        console.log(`\n=== 최종 잔액 ===`);
        console.log(`paidCredit: ${paidCredit}`);
        console.log(`bonusRequestCredit: ${bonusRequestCredit}`);
        console.log(`bonusShippingCredit: ${bonusShippingCredit}`);

        console.log(`\n=== 프론트엔드 표시 값 ===`);
        console.log(`충전 - 무료·의뢰: ${Math.max(0, chargedBonusRequest)}`);
        console.log(`충전 - 무료·배송: ${Math.max(0, chargedBonusShipping)}`);
        console.log(`사용 - 무료·의뢰: ${Math.max(0, spentBonusRequest)}`);
        console.log(`사용 - 무료·배송: ${Math.max(0, spentBonusShipping)}`);
      }
    }

    await mongoose.disconnect();
    console.log("\nMongoDB disconnected");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugAggregation();
