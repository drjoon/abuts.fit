import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: 'web/backend/local.env' });

async function main(){
  await mongoose.connect(process.env.MONGODB_URI_TEST);
  const db = mongoose.connection.db;
  const patient = '이원재4647';
  const tooth = '47';

  // find non-sample target
  const target = await db.collection('requests').findOne({ 'caseInfos.patientName': patient, 'caseInfos.tooth': tooth, source: { $ne: 'manufacturer_sample' } });
  console.log('found target', target ? target.requestId : null);
  if (target){
    await db.collection('requests').updateOne({ _id: target._id },{ $set: { manufacturerStage: '추적관리', 'caseInfos.reviewByStage.tracking.status': 'PENDING', 'caseInfos.reviewByStage.tracking.updatedAt': new Date() } });
    console.log('updated target to 추적관리');
  }

  // delete sample copies
  const del = await db.collection('requests').deleteMany({ 'caseInfos.patientName': patient, 'caseInfos.tooth': tooth, source: 'manufacturer_sample' });
  console.log('deleted samples count', del.deletedCount);

  const final = await db.collection('requests').find({ 'caseInfos.patientName': patient, 'caseInfos.tooth': tooth }).project({ requestId:1, source:1, manufacturerStage:1, updatedAt:1, 'caseInfos.camFile.filePath':1, 'caseInfos.ncFile.filePath':1, 'caseInfos.reviewByStage':1 }).toArray();
  console.log('final docs', JSON.stringify(final, null, 2));

  await mongoose.disconnect();
}

main().catch(e=>{ console.error(e); process.exit(1); });
