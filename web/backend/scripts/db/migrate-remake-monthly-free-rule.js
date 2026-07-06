import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";

const OLD_RULE = "remake_monthly_free_10";
const NEW_RULE = "remake_monthly_free_3";

async function migrateRemakeMonthlyFreeRule() {
  await connectDb();

  try {
    const targetQuery = { "price.rule": OLD_RULE };

    const beforeCount = await Request.countDocuments(targetQuery);
    console.log(
      `[db] migrate-remake-monthly-free-rule: found ${beforeCount} requests (${OLD_RULE})`,
    );

    if (beforeCount === 0) {
      console.log("[db] migrate-remake-monthly-free-rule: nothing to migrate");
      return;
    }

    const result = await Request.updateMany(targetQuery, {
      $set: { "price.rule": NEW_RULE },
    });

    const afterCount = await Request.countDocuments(targetQuery);

    console.log("[db] migrate-remake-monthly-free-rule done", {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      oldRuleRemaining: afterCount,
      newRuleApplied: NEW_RULE,
    });
  } finally {
    await disconnectDb();
  }
}

migrateRemakeMonthlyFreeRule().catch((error) => {
  console.error("[db] migrate-remake-monthly-free-rule failed", error);
  process.exit(1);
});
