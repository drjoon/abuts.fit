const mongoose = require("mongoose");
const MONGODB_URI = "mongodb+srv://drjoon:REDACTED@cluster0.jihfv0j.mongodb.net/abuts_fit_test?retryWrites=true&w=majority";

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const Request = mongoose.model("Request", require("./web/backend/models/request.model.js").schema || mongoose.Schema({}, { strict: false, collection: "requests" }));
    
    const docs = await Request.find({ "lotNumber.value": { $in: ["CA260312-AAE", "CA260312-AAF", "CA260312-AAH"] } });
    for (const doc of docs) {
      console.log(`[${doc.lotNumber.value}] AAA(taper): ${doc.caseInfos.taperAngle}, DDD(maxD): ${doc.caseInfos.maxDiameter}, LLL(len): ${doc.caseInfos.totalLength}`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
