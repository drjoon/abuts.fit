/**
 * PricingReferralStatsSnapshot 인덱스 정리 스크립트
 * 레거시 인덱스 제거 및 올바른 인덱스만 유지
 * 
 * 실행: node scripts/cleanup-pricing-referral-indexes.js
 */

import mongoose from 'mongoose';
import '../bootstrap/env.js';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(mongoUri);
console.log('[Cleanup] Connected to MongoDB');

try {
  const db = mongoose.connection.db;
  const collection = db.collection('pricingreferralstatssnapshots');

  // 1. 현재 인덱스 확인
  console.log('\n[Step 1] Current indexes:');
  const currentIndexes = await collection.listIndexes().toArray();
  currentIndexes.forEach((idx) => {
    console.log(`  - ${JSON.stringify(idx.key)}`);
  });

  // 2. 레거시 인덱스 삭제
  console.log('\n[Step 2] Removing legacy indexes...');
  const legacyIndexes = [
    'ownerUserId_1',
    'groupLeaderId_1',
    'ymd_1',
    'groupLeaderId_1_ymd_1',
    'ownerUserId_1_ymd_1',
    'businessId_1',
    'leaderUserId_1',
  ];

  for (const indexName of legacyIndexes) {
    try {
      await collection.dropIndex(indexName);
      console.log(`  ✓ Dropped index: ${indexName}`);
    } catch (error) {
      if (error.message.includes('index not found')) {
        console.log(`  - Index not found: ${indexName}`);
      } else {
        console.warn(`  ! Error dropping ${indexName}: ${error.message}`);
      }
    }
  }

  // 3. 올바른 인덱스만 유지
  console.log('\n[Step 3] Creating correct indexes...');
  await collection.createIndex({ businessId: 1, ymd: 1 }, { unique: true });
  console.log('  ✓ Created unique index: { businessId: 1, ymd: 1 }');

  // 4. 최종 인덱스 확인
  console.log('\n[Step 4] Final indexes:');
  const finalIndexes = await collection.listIndexes().toArray();
  finalIndexes.forEach((idx) => {
    console.log(`  - ${JSON.stringify(idx.key)}`);
  });

  console.log('\n[Cleanup] ✓ Index cleanup completed successfully');
} catch (error) {
  console.error('[Cleanup] Error:', error.message);
  process.exit(1);
} finally {
  await mongoose.disconnect();
}
