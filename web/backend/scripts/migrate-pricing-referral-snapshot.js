/**
 * PricingReferralStatsSnapshot 마이그레이션 스크립트
 * 레거시 groupLeaderId 기반 문서를 businessId 기반으로 통합
 * 
 * 실행: node scripts/migrate-pricing-referral-snapshot.js
 */

import mongoose from 'mongoose';
import '../bootstrap/env.js';
import User from '../models/user.model.js';
import Business from '../models/business.model.js';
import PricingReferralStatsSnapshot from '../models/pricingReferralStatsSnapshot.model.js';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(mongoUri);
console.log('[Migration] Connected to MongoDB');

try {
  // 1. 레거시 groupLeaderId: null 문서 삭제
  console.log('\n[Step 1] Removing legacy documents with groupLeaderId: null...');
  const deleteResult = await PricingReferralStatsSnapshot.deleteMany({
    groupLeaderId: null,
  });
  console.log(`[Step 1] Deleted ${deleteResult.deletedCount} documents with groupLeaderId: null`);

  // 2. 모든 문서 확인
  console.log('\n[Step 2] Checking remaining documents...');
  const allDocs = await PricingReferralStatsSnapshot.find({}).lean();
  console.log(`[Step 2] Total documents: ${allDocs.length}`);

  // 3. businessId가 없는 문서 확인
  const docsWithoutBusinessId = allDocs.filter((doc) => !doc.businessId);
  if (docsWithoutBusinessId.length > 0) {
    console.log(
      `[Step 3] Found ${docsWithoutBusinessId.length} documents without businessId:`,
    );
    docsWithoutBusinessId.forEach((doc) => {
      console.log(`  - ${doc._id}: groupLeaderId=${doc.groupLeaderId}, ymd=${doc.ymd}`);
    });

    // groupLeaderId 기반 문서를 businessId 기반으로 변환
    console.log('\n[Step 3] Converting groupLeaderId-based documents to businessId-based...');
    for (const doc of docsWithoutBusinessId) {
      const leaderId = doc.groupLeaderId;
      if (!leaderId) continue;

      const leader = await User.findById(leaderId)
        .select({ businessId: 1, role: 1 })
        .lean();

      if (!leader) {
        console.log(`  - Skipping ${doc._id}: leader not found`);
        continue;
      }

      let businessId = null;
      if (String(leader.role) === 'requestor' && leader.businessId) {
        businessId = leader.businessId;
      } else if (String(leader.role) === 'salesman') {
        // salesman의 경우 leaderUserId를 businessId로 사용
        businessId = leaderId;
      }

      if (!businessId) {
        console.log(`  - Skipping ${doc._id}: no valid businessId`);
        continue;
      }

      // 기존 businessId 기반 문서가 있는지 확인
      const existingDoc = await PricingReferralStatsSnapshot.findOne({
        businessId,
        ymd: doc.ymd,
      }).lean();

      if (existingDoc) {
        // 기존 문서가 있으면 레거시 문서 삭제
        await PricingReferralStatsSnapshot.deleteOne({ _id: doc._id });
        console.log(
          `  - Deleted legacy doc ${doc._id} (businessId-based doc already exists)`,
        );
      } else {
        // 기존 문서가 없으면 businessId로 업데이트
        await PricingReferralStatsSnapshot.updateOne(
          { _id: doc._id },
          {
            $set: { businessId },
            $unset: { groupLeaderId: '' },
          },
        );
        console.log(`  - Migrated ${doc._id} to businessId=${businessId}`);
      }
    }
  }

  // 4. 최종 확인
  console.log('\n[Step 4] Final verification...');
  const finalDocs = await PricingReferralStatsSnapshot.find({}).lean();
  console.log(`[Step 4] Total documents after migration: ${finalDocs.length}`);

  const docsWithoutBusinessIdFinal = finalDocs.filter((doc) => !doc.businessId);
  if (docsWithoutBusinessIdFinal.length > 0) {
    console.warn(
      `[Warning] Still have ${docsWithoutBusinessIdFinal.length} documents without businessId`,
    );
  } else {
    console.log('[Step 4] ✓ All documents have businessId');
  }

  // 5. 인덱스 확인
  console.log('\n[Step 5] Checking indexes...');
  const collection = mongoose.connection.db.collection('pricingreferralstatssnapshots');
  const indexes = await collection.listIndexes().toArray();
  console.log('[Step 5] Current indexes:');
  indexes.forEach((idx) => {
    console.log(`  - ${JSON.stringify(idx.key)}`);
  });

  console.log('\n[Migration] ✓ Migration completed successfully');
} catch (error) {
  console.error('[Migration] Error:', error.message);
  process.exit(1);
} finally {
  await mongoose.disconnect();
}
