const mongoose = require("mongoose");
const MONGODB_URI = "mongodb+srv://drjoon:REDACTED@cluster0.jihfv0j.mongodb.net/abuts_fit_test?retryWrites=true&w=majority";

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const Request = mongoose.model("Request", require("./web/backend/models/request.model.js").schema || mongoose.Schema({}, { strict: false, collection: "requests" }));
    const doc = await Request.findOne({ "lotNumber.value": "CA260312-AAE" });
    if (doc) {
      console.log("Found request:", doc.requestId);
      console.log(JSON.stringify(doc.caseInfos, null, 2));
    } else {
      console.log("Not found");
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
