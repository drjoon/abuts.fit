// related files:
// - web/backend/services/integrations/threeShape/client.js
// - web/backend/services/integrations/threeShape/createPracticeTransferFromExternalIngest.js
// - web/backend/models/scannerIntegration.model.js
import BusinessAnchor from "../../../models/businessAnchor.model.js";
import ScannerIntegration from "../../../models/scannerIntegration.model.js";
import { decryptScannerCredentials } from "../../../utils/scannerIntegrationCrypto.js";
import {
  ackThreeShapeCase,
  downloadThreeShapeCaseAssets,
  listNewThreeShapeCases,
} from "./client.js";
import { createPracticeTransferFromExternalIngest } from "./createPracticeTransferFromExternalIngest.js";

/**
 * Sync one lab's 3Shape inbox into PracticeTransfer.
 * @param {{ businessAnchorId: string, force?: boolean }} args
 */
export async function syncThreeShapeLabInbox({
  businessAnchorId,
  force = false,
} = {}) {
  const anchorId = String(businessAnchorId || "").trim();
  if (!anchorId) {
    return { ok: false, reason: "missing_anchor" };
  }

  const integration = await ScannerIntegration.findOne({
    businessAnchorId: anchorId,
    provider: "3shape",
  }).select("+credentialsCipher");

  if (!integration) {
    return { ok: false, reason: "not_connected" };
  }
  if (integration.status !== "connected" && !force) {
    return {
      ok: false,
      reason: "status_not_connected",
      status: integration.status,
    };
  }
  if (!integration.credentialsCipher) {
    return { ok: false, reason: "missing_credentials" };
  }

  let credentials;
  try {
    credentials = decryptScannerCredentials(integration.credentialsCipher);
  } catch (error) {
    integration.status = "error";
    integration.lastError = String(error?.message || "decrypt_failed");
    await integration.save();
    return { ok: false, reason: "decrypt_failed", error: integration.lastError };
  }

  const lab = await BusinessAnchor.findById(anchorId).select({ name: 1 }).lean();
  const labName = String(lab?.name || "").trim();

  try {
    const cases = await listNewThreeShapeCases({
      credentials,
      since: integration.lastSyncAt,
    });

    const results = [];
    for (const row of cases) {
      const externalCaseId = String(row?.externalCaseId || "").trim();
      if (!externalCaseId) continue;

      let assets = Array.isArray(row?.assets) ? row.assets : [];
      if (!assets.length) {
        assets = await downloadThreeShapeCaseAssets({
          credentials,
          externalCaseId,
          caseRow: row,
        });
      }

      const ingest = await createPracticeTransferFromExternalIngest({
        labAnchorId: anchorId,
        labName,
        externalCaseId,
        externalPractice: row?.practice || {},
        transferMemo: row?.memo || "",
        assets,
      });

      if (ingest.created) {
        try {
          await ackThreeShapeCase({ credentials, externalCaseId });
        } catch (ackErr) {
          // Non-fatal: case already ingested.
          console.warn(
            "[3shape] ack failed",
            externalCaseId,
            ackErr?.message || ackErr,
          );
        }
      }

      results.push({
        externalCaseId,
        created: Boolean(ingest.created),
        duplicate: Boolean(ingest.duplicate),
        transferId: String(ingest.transfer?.transferId || ""),
      });
    }

    integration.lastSyncAt = new Date();
    integration.lastError = "";
    if (integration.status === "error") {
      integration.status = "connected";
    }
    await integration.save();

    return {
      ok: true,
      imported: results.filter((r) => r.created).length,
      duplicates: results.filter((r) => r.duplicate).length,
      results,
    };
  } catch (error) {
    integration.status = "error";
    integration.lastError = String(error?.message || "sync_failed").slice(0, 500);
    await integration.save();
    return {
      ok: false,
      reason: "sync_failed",
      error: integration.lastError,
    };
  }
}

/**
 * Sync all connected 3Shape integrations.
 */
export async function syncAllConnectedThreeShapeInboxes() {
  const rows = await ScannerIntegration.find({
    provider: "3shape",
    status: "connected",
  })
    .select({ businessAnchorId: 1 })
    .lean();

  const out = [];
  for (const row of rows) {
    const result = await syncThreeShapeLabInbox({
      businessAnchorId: String(row.businessAnchorId),
    });
    out.push({
      businessAnchorId: String(row.businessAnchorId),
      ...result,
    });
  }
  return out;
}
