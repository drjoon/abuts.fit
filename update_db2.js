const mongoose = require("mongoose");
const MONGODB_URI = "mongodb+srv://drjoon:REDACTED@cluster0.jihfv0j.mongodb.net/abuts_fit_test?retryWrites=true&w=majority";

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const Request = mongoose.model("Request", require("./web/backend/models/request.model.js").schema || mongoose.Schema({}, { strict: false, collection: "requests" }));
    
    // update CA260312-AAF, AAH
    let r1 = await Request.updateOne(
      { "lotNumber.value": "CA260312-AAF" },
      { $set: { "caseInfos.totalLength": 9.2, "caseInfos.taperAngle": 3.8 } }
    );
    let r2 = await Request.updateOne(
      { "lotNumber.value": "CA260312-AAH" },
      { $set: { "caseInfos.totalLength": 8.5, "caseInfos.taperAngle": 4.5 } }
    );
    
    console.log("Updated AAF:", r1.modifiedCount);
    console.log("Updated AAH:", r2.modifiedCount);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
