// related files:
// - web/backend/modules/webhooks/webhook.routes.js
// - web/backend/services/integrations/threeShape/syncLabInbox.js
import ScannerIntegration from "../../models/scannerIntegration.model.js";
import { syncThreeShapeLabInbox } from "../../services/integrations/threeShape/syncLabInbox.js";

function assertWebhookSecret(req) {
  const secret = String(process.env.THREE_SHAPE_WEBHOOK_SECRET || "").trim();
  const provided = String(req.headers["x-webhook-secret"] || "").trim();

  if (process.env.NODE_ENV === "production") {
    if (!secret || provided !== secret) {
      return false;
    }
    return true;
  }

  // Non-prod: if secret configured, require match; else allow.
  if (secret && provided !== secret) return false;
  return true;
}

/**
 * POST /api/webhooks/3shape
 * Partner payload shape is TBD; accept accountId/email/caseId hints and sync the lab.
 */
export async function handleThreeShapeWebhook(req, res) {
  try {
    if (!assertWebhookSecret(req)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized webhook",
      });
    }

    const body = req.body || {};
    const accountId = String(
      body.accountId || body.externalAccountId || body.labAccountId || "",
    ).trim();
    const email = String(
      body.accountEmail || body.email || body.labEmail || "",
    )
      .trim()
      .toLowerCase();
    const businessAnchorId = String(body.businessAnchorId || "").trim();

    const filter = { provider: "3shape", status: "connected" };
    if (businessAnchorId) {
      filter.businessAnchorId = businessAnchorId;
    } else if (accountId) {
      filter.externalAccountId = accountId;
    } else if (email) {
      filter.externalAccountEmail = email;
    } else {
      return res.status(400).json({
        success: false,
        message: "accountId, email, or businessAnchorId가 필요합니다.",
      });
    }

    const integration = await ScannerIntegration.findOne(filter)
      .select({ businessAnchorId: 1 })
      .lean();

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: "연결된 3Shape 계정을 찾을 수 없습니다.",
      });
    }

    const result = await syncThreeShapeLabInbox({
      businessAnchorId: String(integration.businessAnchorId),
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "3Shape webhook 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}
