// related files:
// - web/backend/models/heldSms.model.js
// - web/backend/services/heldSms.service.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/HeldSmsCard.tsx
import HeldSms from "../../models/heldSms.model.js";
import { listHeldSms } from "../../services/heldSms.service.js";
import { sendPopbillXMS } from "../../utils/popbill.util.js";

const SENDING_STALE_MS = 2 * 60 * 1000;

export async function adminListHeldSms(_req, res) {
  try {
    const data = await listHeldSms();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보류 문자를 불러오지 못했습니다.",
    });
  }
}

export async function adminSendHeldSms(req, res) {
  try {
    const id = String(req.params?.id || "");
    const staleBefore = new Date(Date.now() - SENDING_STALE_MS);
    const claimed = await HeldSms.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { status: "held" },
          { status: "sending", updatedAt: { $lt: staleBefore } },
        ],
      },
      { $set: { status: "sending" } },
      { new: true },
    ).lean();
    if (!claimed) {
      return res.status(409).json({
        success: false,
        message: "이미 처리된 문자입니다.",
      });
    }

    try {
      const { receiptNum, method } = await sendPopbillXMS({
        subject: claimed.subject || "알림",
        items: (claimed.recipients || []).map((row) => ({
          phone: row.phone,
          name: row.name || "",
          content: row.content,
        })),
        bypassGuard: true,
      });
      await HeldSms.updateOne(
        { _id: claimed._id },
        {
          $set: {
            status: "sent",
            sentAt: new Date(),
            sentBy: req.user?._id || null,
            receiptNum: receiptNum || "",
          },
        },
      );
      return res.status(200).json({
        success: true,
        message: "문자를 보냈습니다.",
        data: { receiptNum, method },
      });
    } catch (sendError) {
      await HeldSms.updateOne({ _id: claimed._id }, { $set: { status: "held" } });
      return res.status(500).json({
        success: false,
        message: "문자 발송에 실패했습니다.",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문자 발송에 실패했습니다.",
    });
  }
}

export async function adminDismissHeldSms(req, res) {
  try {
    const id = String(req.params?.id || "");
    const updated = await HeldSms.findOneAndUpdate(
      { _id: id, status: "held" },
      { $set: { status: "dismissed" } },
      { new: true },
    ).lean();
    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "이미 처리된 문자입니다.",
      });
    }
    return res.status(200).json({ success: true, message: "보류를 지웠습니다." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보류를 지우지 못했습니다.",
    });
  }
}
