// related files:
// - web/backend/controllers/requests/mailbox.utils.js
// - web/backend/rules.md
import mongoose from "mongoose";

/**
 * 동일 businessAnchor의 우편함 동시 할당 레이스를 막기 위한 짧은 TTL 예약 슬롯.
 *
 * - lot-capture / review-status가 병렬로 돌 때, 아직 request 문서에
 *   mailboxAddress가 커밋되기 전에도 같은 주소를 재사용할 수 있게 한다.
 * - updatedAt 기준 TTL로 만료되어, 활성 점유가 사라진 뒤 첫 빈칸 재할당 정책을 해치지 않는다.
 */
// 동시 할당 핸드오프용. 짧게 유지해 첫 빈칸 재할당 정책을 해치지 않는다.
const MAILBOX_ANCHOR_SLOT_TTL_SECONDS = 90;

const mailboxAnchorSlotSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    mailboxAddress: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    updatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

mailboxAnchorSlotSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: MAILBOX_ANCHOR_SLOT_TTL_SECONDS },
);
mailboxAnchorSlotSchema.index({ mailboxAddress: 1 });

const MailboxAnchorSlot =
  mongoose.models.MailboxAnchorSlot ||
  mongoose.model("MailboxAnchorSlot", mailboxAnchorSlotSchema);

export default MailboxAnchorSlot;
export { MAILBOX_ANCHOR_SLOT_TTL_SECONDS };
