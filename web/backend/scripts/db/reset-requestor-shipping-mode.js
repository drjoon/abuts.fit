#!/usr/bin/env node
// related files:
// - web/backend/services/requestorShipping.service.js
// 2026-10-13: 런칭 전 모든 의뢰자를 택배(normal)로 되돌린다. 딜리버리 업체 계약 후 딜러·영업팀·관리자가 지정.
// 실행: ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/reset-requestor-shipping-mode.js
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

await connectDb();
console.log("dbName:", mongoose.connection.name);
try {
  const res = await BusinessAnchor.updateMany(
    { "shippingPolicy.defaultShippingMode": "express" },
    { $set: { "shippingPolicy.defaultShippingMode": "normal" } },
  );
  console.log("reset to normal:", res.modifiedCount);
} finally {
  await disconnectDb();
}
