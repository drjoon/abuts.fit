import fs from "node:fs";
import mongoose from "mongoose";
import "../../bootstrap/env.js";
import * as m from "./_mongo.js";
await mongoose.connect(m.getMongoUri());
const col = mongoose.connection.db.collection("requests");
const a = JSON.parse(fs.readFileSync("../../.tmp-abuts-align/cuff-recheck.json","utf8"));
const docs = await col.find({requestId:{$in:a.map(x=>x.requestId)}}).project({requestId:1,"caseInfos.cuffBlend.status":1}).toArray();
const st = Object.fromEntries(docs.map(d=>[d.requestId,d.caseInfos?.cuffBlend?.status||"none"]));
const g={};
for(const f of a){const k=st[f.requestId]+"|"+f.status+"|"+f.stage+"|"+(f.reason||"").slice(0,30);g[k]=(g[k]||0)+1}
console.log(g);
console.log(a.filter(f=>st[f.requestId]==="none").map(f=>f.requestId+" "+f.stage+" "+f.status+" "+f.reason).join("\n"));
process.exit();
