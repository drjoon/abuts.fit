import { connectDb, disconnectDb } from "./_mongo.js";
import mongoose from "mongoose";

const { Types } = mongoose;

async function migrateBusiness() {
  const db = mongoose.connection.db;
  const Business = db.collection("businesses");
  const BusinessAnchor = db.collection("businessanchors");
  const User = db.collection("users");

  console.log("[migrate] Starting Business → BusinessAnchor migration...");

  // 1. Business 컬렉션의 모든 문서 조회
  const businesses = await Business.find({}).toArray();
  console.log(`[migrate] Found ${businesses.length} Business documents`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const business of businesses) {
    try {
      const businessId = business._id;
      const businessAnchorId = business.businessAnchorId;

      // 2. businessAnchorId가 있으면 해당 Anchor 조회, 없으면 새로 생성
      let anchor = null;
      if (businessAnchorId) {
        anchor = await BusinessAnchor.findOne({ _id: businessAnchorId });
      }

      // 3. Anchor가 없으면 Business 데이터로 새로 생성
      if (!anchor) {
        const businessNumber = business.extracted?.businessNumber || "";
        const normalizedBusinessNumber = businessNumber.replace(/\D/g, "");

        // 기존에 같은 사업자번호로 생성된 Anchor가 있는지 확인
        if (normalizedBusinessNumber) {
          anchor = await BusinessAnchor.findOne({
            businessNumberNormalized: normalizedBusinessNumber,
          });
        }

        // 여전히 없으면 새로 생성
        if (!anchor) {
          const newAnchor = {
            _id: new Types.ObjectId(),
            businessType: business.businessType || "requestor",
            name: business.name || "",
            businessNumberNormalized: normalizedBusinessNumber || "",
            status: business.verification?.verified ? "verified" : "draft",
            primaryContactUserId: business.owner || null,
            owners: business.owners || [],
            members: business.members || [],
            joinRequests: business.joinRequests || [],
            metadata: {
              companyName: business.extracted?.companyName || "",
              representativeName: business.extracted?.representativeName || "",
              address: business.extracted?.address || "",
              addressDetail: business.extracted?.addressDetail || "",
              zipCode: business.extracted?.zipCode || "",
              phoneNumber: business.extracted?.phoneNumber || "",
              email: business.extracted?.email || "",
              businessItem: business.extracted?.businessItem || "",
              businessCategory: business.extracted?.businessCategory || "",
              startDate: business.extracted?.startDate || "",
            },
            payoutAccount: business.payoutAccount || {
              bankName: "",
              accountNumber: "",
              holderName: "",
              updatedAt: null,
            },
            payoutRates: business.payoutRates || {
              manufacturerRate: 0.65,
              baseCommissionRate: 0.05,
              salesmanDirectRate: 0.05,
              updatedAt: null,
            },
            referralMembershipAggregate: {
              referredByAnchorId: null,
              sourceBusinessId: businessId,
              status: "draft",
              updatedAt: new Date(),
            },
            createdAt: business.createdAt || new Date(),
            updatedAt: business.updatedAt || new Date(),
          };

          await BusinessAnchor.insertOne(newAnchor);
          anchor = newAnchor;
          console.log(
            `[migrate] Created new BusinessAnchor ${anchor._id} for Business ${businessId}`,
          );
        }
      }

      // 4. Business의 멤버십 데이터를 Anchor에 병합
      if (anchor) {
        const updateData = {
          $set: {},
          $addToSet: {},
        };

        // owners, members, joinRequests 병합
        if (business.owners && business.owners.length > 0) {
          updateData.$addToSet.owners = { $each: business.owners };
        }
        if (business.members && business.members.length > 0) {
          updateData.$addToSet.members = { $each: business.members };
        }
        if (business.joinRequests && business.joinRequests.length > 0) {
          for (const jr of business.joinRequests) {
            const exists = await BusinessAnchor.findOne({
              _id: anchor._id,
              "joinRequests.user": jr.user,
            });
            if (!exists) {
              await BusinessAnchor.updateOne(
                { _id: anchor._id },
                { $push: { joinRequests: jr } },
              );
            }
          }
        }

        // primaryContactUserId 설정 (없으면)
        if (!anchor.primaryContactUserId && business.owner) {
          updateData.$set.primaryContactUserId = business.owner;
        }

        if (Object.keys(updateData.$set).length > 0) {
          await BusinessAnchor.updateOne({ _id: anchor._id }, updateData);
        }

        // 5. User의 businessId를 businessAnchorId로 업데이트
        await User.updateMany(
          { businessId: businessId },
          {
            $set: { businessAnchorId: anchor._id },
            $unset: { businessId: "" },
          },
        );

        migratedCount++;
        console.log(
          `[migrate] Migrated Business ${businessId} → BusinessAnchor ${anchor._id}`,
        );
      } else {
        skippedCount++;
        console.log(`[migrate] Skipped Business ${businessId} (no anchor)`);
      }
    } catch (error) {
      errorCount++;
      console.error(
        `[migrate] Error migrating Business ${business._id}:`,
        error.message,
      );
    }
  }

  console.log(`[migrate] Migration complete:`);
  console.log(`  - Migrated: ${migratedCount}`);
  console.log(`  - Skipped: ${skippedCount}`);
  console.log(`  - Errors: ${errorCount}`);

  // 6. Business 컬렉션 백업 후 삭제 (선택사항)
  console.log(
    "[migrate] Business collection preserved. To delete, run: db.businesses.drop()",
  );
}

async function run() {
  try {
    await connectDb();
    await migrateBusiness();
    console.log("[migrate] Migration completed successfully");
  } catch (error) {
    console.error("[migrate] Migration failed:", error);
    throw error;
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
