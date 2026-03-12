import "../../bootstrap/env.js";
import mongoose from "mongoose";
import Machine from "../../models/machine.model.js";
import User from "../../models/user.model.js";

async function migrate() {
  try {
    console.log("Starting Machine manufacturer -> manufacturerBusinessId migration...");

    // 기존 manufacturer 필드가 있는 모든 Machine 문서 조회
    const machines = await Machine.find({ manufacturer: { $exists: true, $ne: null } });
    console.log(`Found ${machines.length} machines with manufacturer field`);

    let updated = 0;
    let errors = 0;

    for (const machine of machines) {
      try {
        const manufacturerId = machine.manufacturer;
        
        // User에서 business 정보 조회
        const user = await User.findById(manufacturerId).select("business").lean();
        
        if (user && user.business) {
          // manufacturerBusinessId 설정 및 manufacturer 필드 제거
          await Machine.findByIdAndUpdate(
            machine._id,
            {
              $set: { manufacturerBusinessId: user.business },
              $unset: { manufacturer: "" }
            }
          );
          updated++;
          console.log(`✓ Updated machine ${machine.uid}: ${manufacturerId} -> ${user.business}`);
        } else {
          console.warn(`⚠ User ${manufacturerId} not found or has no business for machine ${machine.uid}`);
          errors++;
        }
      } catch (e) {
        console.error(`✗ Error migrating machine ${machine.uid}:`, e.message);
        errors++;
      }
    }

    console.log(`\nMigration complete: ${updated} updated, ${errors} errors`);
    process.exit(errors > 0 ? 1 : 0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
