// related files:
// - web/backend/rules.md
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/requests/common.review.helpers.js
import mongoose from "mongoose";

// GL 직집계 모드에서 동시 차감(overspend) 경합을 직렬화하기 위한 경량 락 문서.
// - 잔액 값은 저장하지 않는다.
// - businessAnchorId 당 1문서(unique)만 두고, spend 트랜잭션마다 version을 증가시킨다.
// - 동일 앵커 동시 트랜잭션은 write conflict를 유도해 Mongo 재시도/직렬화를 보장한다.
const creditBalanceGuardSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      unique: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model("CreditBalanceGuard", creditBalanceGuardSchema);
