import mongoose from "mongoose";
import "../../bootstrap/env.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    requestId: "",
    mailboxAddress: "",
    patientName: "",
    tooth: "",
    limit: 30,
  };
  for (const arg of args) {
    const s = String(arg || "").trim();
    if (!s) continue;
    if (s.startsWith("requestId=")) out.requestId = s.slice(10).trim();
    else if (s.startsWith("mailboxAddress=")) out.mailboxAddress = s.slice(15).trim();
    else if (s.startsWith("patientName=")) out.patientName = s.slice(12).trim();
    else if (s.startsWith("tooth=")) out.tooth = s.slice(6).trim();
    else if (s.startsWith("limit=")) out.limit = Number(s.slice(6)) || 30;
  }
  return out;
}

function normId(v) {
  return String(v || "").trim() || null;
}

async function anchorNameById(anchorId) {
  const id = normId(anchorId);
  if (!id) return null;
  const a = await BusinessAnchor.findById(id).select({ name: 1, metadata: 1 }).lean();
  if (!a) return null;
  return String(a.name || a?.metadata?.companyName || "").trim() || id;
}

async function main() {
  const { requestId, mailboxAddress, patientName, tooth, limit } = parseArgs();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI/MONGO_URI not set");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });

  const query = {};
  if (requestId) query.requestId = requestId;
  if (mailboxAddress) query.mailboxAddress = mailboxAddress;
  if (patientName) query["caseInfos.patientName"] = { $regex: patientName, $options: "i" };
  if (tooth) query["caseInfos.tooth"] = { $regex: tooth, $options: "i" };

  const targets = await Request.find(Object.keys(query).length ? query : { manufacturerStage: { $in: ["세척.패킹", "포장.발송"] } })
    .select({
      requestId: 1,
      manufacturerStage: 1,
      mailboxAddress: 1,
      businessAnchorId: 1,
      requestor: 1,
      caseInfos: 1,
      lotNumber: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  console.log("[inspect] targets count=", targets.length);

  for (const t of targets) {
    const reqBizId = normId(t.businessAnchorId);
    const reqUser = t.requestor ? await User.findById(t.requestor).select({ name: 1, business: 1, businessAnchorId: 1 }).lean() : null;
    const reqUserBizId = normId(reqUser?.businessAnchorId);

    const reqBizName = await anchorNameById(reqBizId);
    const reqUserBizName = await anchorNameById(reqUserBizId);

    console.log("\n[target]", {
      _id: normId(t._id),
      requestId: t.requestId,
      stage: t.manufacturerStage,
      mailboxAddress: t.mailboxAddress || null,
      clinicName: t.caseInfos?.clinicName || null,
      patientName: t.caseInfos?.patientName || null,
      tooth: t.caseInfos?.tooth || null,
      lotNumber: t.lotNumber?.value || null,
      request_businessAnchorId: reqBizId,
      request_businessAnchorName: reqBizName,
      requestor_userId: normId(reqUser?._id),
      requestor_userName: reqUser?.name || null,
      requestor_userBusiness: reqUser?.business || null,
      requestor_businessAnchorId: reqUserBizId,
      requestor_businessAnchorName: reqUserBizName,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    });

    const addr = String(t.mailboxAddress || "").trim();
    if (!addr) continue;

    const occupants = await Request.find({
      manufacturerStage: { $in: ["세척.패킹", "포장.발송"] },
      mailboxAddress: addr,
    })
      .select({ requestId: 1, manufacturerStage: 1, mailboxAddress: 1, businessAnchorId: 1, requestor: 1, caseInfos: 1, lotNumber: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    console.log(`[occupants:${addr}]`, occupants.length);
    for (const row of occupants) {
      const rowReqBizId = normId(row.businessAnchorId);
      const rowReqUser = row.requestor ? await User.findById(row.requestor).select({ name: 1, business: 1, businessAnchorId: 1 }).lean() : null;
      const rowReqUserBizId = normId(rowReqUser?.businessAnchorId);
      console.log(" -", {
        requestId: row.requestId,
        stage: row.manufacturerStage,
        clinicName: row.caseInfos?.clinicName || null,
        patientName: row.caseInfos?.patientName || null,
        tooth: row.caseInfos?.tooth || null,
        lot: row.lotNumber?.value || null,
        request_businessAnchorId: rowReqBizId,
        requestor_businessAnchorId: rowReqUserBizId,
        requestor_userBusiness: rowReqUser?.business || null,
      });
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("[inspect-mailbox-assignment] failed", e);
  process.exit(1);
});
