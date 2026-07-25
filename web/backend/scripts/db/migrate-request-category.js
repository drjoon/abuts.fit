import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";

// related files:
// - web/backend/models/request.model.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts

const REQUEST_CATEGORY = {
  ORDER: "order",
  RND_SAMPLE: "rnd_sample",
  COPIED_SAMPLE: "copied_sample",
};

function buildCategoryFilter(category) {
  if (category === REQUEST_CATEGORY.RND_SAMPLE) {
    return {
      source: "manufacturer_sample",
      "rnd.doneAt": { $ne: null },
    };
  }

  if (category === REQUEST_CATEGORY.COPIED_SAMPLE) {
    return {
      source: "manufacturer_sample",
      "rnd.doneAt": null,
    };
  }

  return {
    source: { $ne: "manufacturer_sample" },
  };
}

async function migrateRequestCategory() {
  await connectDb();

  try {
    const before = {
      order: await Request.countDocuments({ requestCategory: REQUEST_CATEGORY.ORDER }),
      rndSample: await Request.countDocuments({ requestCategory: REQUEST_CATEGORY.RND_SAMPLE }),
      copiedSample: await Request.countDocuments({ requestCategory: REQUEST_CATEGORY.COPIED_SAMPLE }),
      missing: await Request.countDocuments({ requestCategory: { $exists: false } }),
      manufacturerSampleTotal: await Request.countDocuments({ source: "manufacturer_sample" }),
      total: await Request.countDocuments({}),
    };

    console.log("[db] migrate-request-category: before", before);

    const [rndResult, copiedResult, orderResult] = await Promise.all([
      Request.updateMany(buildCategoryFilter(REQUEST_CATEGORY.RND_SAMPLE), {
        $set: { requestCategory: REQUEST_CATEGORY.RND_SAMPLE },
      }),
      Request.updateMany(buildCategoryFilter(REQUEST_CATEGORY.COPIED_SAMPLE), {
        $set: { requestCategory: REQUEST_CATEGORY.COPIED_SAMPLE },
      }),
      Request.updateMany(buildCategoryFilter(REQUEST_CATEGORY.ORDER), {
        $set: { requestCategory: REQUEST_CATEGORY.ORDER },
      }),
    ]);

    const after = {
      order: await Request.countDocuments({ requestCategory: REQUEST_CATEGORY.ORDER }),
      rndSample: await Request.countDocuments({ requestCategory: REQUEST_CATEGORY.RND_SAMPLE }),
      copiedSample: await Request.countDocuments({ requestCategory: REQUEST_CATEGORY.COPIED_SAMPLE }),
      missing: await Request.countDocuments({ requestCategory: { $exists: false } }),
      manufacturerSampleTotal: await Request.countDocuments({ source: "manufacturer_sample" }),
      total: await Request.countDocuments({}),
    };

    console.log("[db] migrate-request-category: done", {
      updatedRndSample: rndResult.modifiedCount,
      updatedCopiedSample: copiedResult.modifiedCount,
      updatedOrder: orderResult.modifiedCount,
      after,
    });
  } finally {
    await disconnectDb();
  }
}

migrateRequestCategory().catch((error) => {
  console.error("[db] migrate-request-category failed", error);
  process.exit(1);
});
