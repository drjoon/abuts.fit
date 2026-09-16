// related files:
// - web/backend/services/healStuckCompletedMachining.service.js
// - web/backend/rules.md
// change-log:
// - 2026-09-16: CNC 완료+가공 stuck 일괄 힐 스크립트.
import { connectDb, disconnectDb } from "./_mongo.js";
import { healAllStuckCompletedMachiningRequests } from "../../services/healStuckCompletedMachining.service.js";

await connectDb();
const result = await healAllStuckCompletedMachiningRequests({
  limit: 100,
  source: "scripts/db/heal-stuck-completed-machining",
});
console.log(JSON.stringify(result, null, 2));
await disconnectDb();
