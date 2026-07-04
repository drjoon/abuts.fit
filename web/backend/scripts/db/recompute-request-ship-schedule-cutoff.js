#!/usr/bin/env node
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { calculateInitialProductionSchedule } from "../../controllers/requests/production.utils.js";
import {
  normalizeKoreanBusinessDay,
  toKstYmd,
} from "../../controllers/requests/utils.js";

const TARGET_STAGES = ["의뢰", "CAM", "가공", "세척.패킹"];

function parseArgs() {
  const args = process.argv.slice(2);
  const has = (flag) => args.includes(flag);
  const getValue = (prefix, fallback = "") => {
    const item = args.find((v) => String(v || "").startsWith(prefix));
    if (!item) return fallback;
    return String(item.slice(prefix.length) || "").trim();
  };

  const limitRaw = Number(getValue("--limit=", "0"));
  const requestId = getValue("--request-id=", "");

  return {
    apply: has("--apply"),
    verbose: has("--verbose"),
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 0,
    requestId,
  };
}

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(value?._id || value?.id || value).trim();
  }
  return String(value || "").trim();
}

function resolveAnchorId(row) {
  const fromRequest = toIdString(row?.businessAnchorId);
  if (fromRequest) return fromRequest;
  const fromRequestor = toIdString(row?.requestor?.businessAnchorId);
  if (fromRequestor) return fromRequestor;
  return "";
}

function resolveRequestedAt(row) {
  const requestedAt = row?.originalShipping?.requestedAt || row?.createdAt;
  if (!requestedAt) return null;
  const d = new Date(requestedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function pickScheduleSetPayload(nextSchedule) {
  const out = {
    "productionSchedule.scheduledCamStart": nextSchedule?.scheduledCamStart || null,
    "productionSchedule.scheduledCamComplete":
      nextSchedule?.scheduledCamComplete || null,
    "productionSchedule.scheduledMachiningStart":
      nextSchedule?.scheduledMachiningStart || null,
    "productionSchedule.scheduledMachiningComplete":
      nextSchedule?.scheduledMachiningComplete || null,
    "productionSchedule.scheduledBatchProcessing":
      nextSchedule?.scheduledBatchProcessing || null,
    "productionSchedule.scheduledPickupRequest":
      nextSchedule?.scheduledPickupRequest || null,
    "productionSchedule.scheduledShipPickup":
      nextSchedule?.scheduledShipPickup || null,
  };

  if (typeof nextSchedule?.diameter === "number") {
    out["productionSchedule.diameter"] = nextSchedule.diameter;
  }
  if (typeof nextSchedule?.diameterGroup === "string") {
    out["productionSchedule.diameterGroup"] = nextSchedule.diameterGroup;
  }

  return out;
}

async function run() {
  const args = parseArgs();
  await connectDb();

  try {
    const query = {
      manufacturerStage: { $in: TARGET_STAGES },
    };

    if (args.requestId) {
      query.requestId = args.requestId;
    }

    const finder = Request.find(query)
      .populate("requestor", "businessAnchorId")
      .select({
        requestId: 1,
        manufacturerStage: 1,
        businessAnchorId: 1,
        requestor: 1,
        createdAt: 1,
        caseInfos: 1,
        originalShipping: 1,
        productionSchedule: 1,
        timeline: 1,
      })
      .sort({ createdAt: 1 });

    if (args.limit > 0) {
      finder.limit(args.limit);
    }

    const rows = await finder.lean();

    const anchorIdSet = new Set();
    for (const row of rows) {
      const anchorId = resolveAnchorId(row);
      if (anchorId && mongoose.Types.ObjectId.isValid(anchorId)) {
        anchorIdSet.add(anchorId);
      }
    }

    const anchorIds = Array.from(anchorIdSet).map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    const anchors = anchorIds.length
      ? await BusinessAnchor.find({ _id: { $in: anchorIds } })
          .select({ "shippingPolicy.weeklyBatchDays": 1 })
          .lean()
      : [];

    const weeklyBatchDaysByAnchorId = new Map(
      anchors.map((a) => {
        const key = toIdString(a?._id);
        const days = Array.isArray(a?.shippingPolicy?.weeklyBatchDays)
          ? a.shippingPolicy.weeklyBatchDays
              .map((d) => String(d || "").trim())
              .filter((d) => ["mon", "tue", "wed", "thu", "fri"].includes(d))
          : [];
        return [key, days];
      }),
    );

    let skippedNoAnchor = 0;
    let skippedNoBatchDays = 0;
    let skippedNoRequestedAt = 0;
    let unchanged = 0;
    let changed = 0;

    const updateOps = [];
    const preview = [];

    for (const row of rows) {
      const requestId = String(row?.requestId || "").trim() || "(unknown)";
      const anchorId = resolveAnchorId(row);
      if (!anchorId) {
        skippedNoAnchor += 1;
        continue;
      }

      const weeklyBatchDays = weeklyBatchDaysByAnchorId.get(anchorId) || [];
      if (!weeklyBatchDays.length) {
        skippedNoBatchDays += 1;
        continue;
      }

      const requestedAt = resolveRequestedAt(row);
      if (!requestedAt) {
        skippedNoRequestedAt += 1;
        continue;
      }

      const maxDiameter = row?.caseInfos?.maxDiameter;
      const nextSchedule = await calculateInitialProductionSchedule({
        maxDiameter,
        requestedAt,
        weeklyBatchDays,
      });

      const nextPickupYmdRaw = nextSchedule?.scheduledShipPickup
        ? toKstYmd(nextSchedule.scheduledShipPickup)
        : null;
      const nextPickupYmd = nextPickupYmdRaw
        ? await normalizeKoreanBusinessDay({ ymd: nextPickupYmdRaw })
        : null;

      if (!nextPickupYmd) {
        unchanged += 1;
        continue;
      }

      const prevTimelineYmd = String(row?.timeline?.estimatedShipYmd || "").trim();
      const prevPickupYmd = row?.productionSchedule?.scheduledShipPickup
        ? toKstYmd(row.productionSchedule.scheduledShipPickup)
        : "";

      const isChanged =
        prevTimelineYmd !== nextPickupYmd || prevPickupYmd !== nextPickupYmd;

      if (!isChanged) {
        unchanged += 1;
        continue;
      }

      changed += 1;
      const setPayload = {
        ...pickScheduleSetPayload(nextSchedule),
        "timeline.originalEstimatedShipYmd": nextPickupYmd,
        "timeline.nextEstimatedShipYmd": nextPickupYmd,
        "timeline.estimatedShipYmd": nextPickupYmd,
      };

      updateOps.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: setPayload },
        },
      });

      if (preview.length < 30) {
        preview.push({
          requestId,
          stage: row?.manufacturerStage || "",
          weeklyBatchDays,
          prevTimelineYmd: prevTimelineYmd || null,
          prevPickupYmd: prevPickupYmd || null,
          nextYmd: nextPickupYmd,
        });
      }

      if (args.verbose) {
        console.log("[change]", {
          requestId,
          stage: row?.manufacturerStage || "",
          prevTimelineYmd: prevTimelineYmd || null,
          prevPickupYmd: prevPickupYmd || null,
          nextYmd: nextPickupYmd,
        });
      }
    }

    console.log("[db] recompute-request-ship-schedule-cutoff summary", {
      mode: args.apply ? "apply" : "dry-run",
      targetStages: TARGET_STAGES,
      inputCount: rows.length,
      changed,
      unchanged,
      skippedNoAnchor,
      skippedNoBatchDays,
      skippedNoRequestedAt,
      previewCount: preview.length,
    });
    console.log("[db] preview", preview);

    if (!args.apply) {
      console.log(
        "[db] dry-run complete. Re-run with --apply to persist updates.",
      );
      return;
    }

    if (!updateOps.length) {
      console.log("[db] nothing to update.");
      return;
    }

    const CHUNK_SIZE = 200;
    let modifiedTotal = 0;
    for (let i = 0; i < updateOps.length; i += CHUNK_SIZE) {
      const chunk = updateOps.slice(i, i + CHUNK_SIZE);
      const res = await Request.bulkWrite(chunk, { ordered: false });
      modifiedTotal += Number(res?.modifiedCount || 0);
      console.log("[db] bulk chunk", {
        chunkIndex: Math.floor(i / CHUNK_SIZE) + 1,
        chunkSize: chunk.length,
        modifiedCount: Number(res?.modifiedCount || 0),
      });
    }

    console.log("[db] apply complete", {
      requestedUpdates: updateOps.length,
      modifiedTotal,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[db] recompute-request-ship-schedule-cutoff failed", error);
  process.exit(1);
});
