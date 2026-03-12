const mongoose = require("mongoose");
const MONGODB_URI = "mongodb+srv://drjoon:REDACTED@cluster0.jihfv0j.mongodb.net/abuts_fit_test?retryWrites=true&w=majority";

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const Request = mongoose.model("Request", require("./web/backend/models/request.model.js").schema || mongoose.Schema({}, { strict: false, collection: "requests" }));
    
    // update CA260312-AAE
    const result = await Request.updateOne(
      { "lotNumber.value": "CA260312-AAE" },
      { $set: { "caseInfos.totalLength": 8.9, "caseInfos.taperAngle": 4.1 } }
    );
    console.log("Updated CA260312-AAE:", result.modifiedCount);

    // check others
    const others = await Request.find({ "lotNumber.value": { $in: ["CA260312-AAF", "CA260312-AAH"] } });
    for (const doc of others) {
      console.log(`Found ${doc.lotNumber.value}: maxD=${doc.caseInfos.maxDiameter}, length=${doc.caseInfos.totalLength}, angle=${doc.caseInfos.taperAngle}`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
