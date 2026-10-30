// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachineQueueCard.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/CncPlaylistDrawer.tsx
// - web/backend/controllers/cnc/machiningBridge.js
// change-log:
// - 2026-10-31: 자동가공이 건너뛰는 건(오류·아노 X·NC 이상)을 Next Up에 남기고 표시한다.
import { isCamGenerationOverlayPending } from "@/pages/manufacturer/worksheet/custom_abutment/utils/regenerationPending";
import { humanAlarmText } from "../machiningAlertIncident";
import type { QueueItem } from "../types";

const BLOCKING_NC_FLAGS = new Set([
  "nc_suspiciously_small",
  "nc_no_coordinates",
]);

export type AutoMachiningHoldKind = "error" | "anodizing_off" | "nc_invalid";

export type AutoMachiningHold = {
  kind: AutoMachiningHoldKind;
  label: string;
};

function readNcFlags(item?: QueueItem | null): string[] {
  const flags = (item as { caseInfos?: { ncFile?: { analysis?: { flags?: unknown } } } })
    ?.caseInfos?.ncFile?.analysis?.flags;
  return Array.isArray(flags) ? flags.map((flag) => String(flag || "").trim()) : [];
}

function hasQueueNc(item?: QueueItem | null): boolean {
  return Boolean(
    String(item?.ncFile?.s3Key || "").trim() ||
      String(item?.ncFile?.filePath || "").trim() ||
      String(
        (item as { caseInfos?: { ncFile?: { s3Key?: string; filePath?: string } } })
          ?.caseInfos?.ncFile?.s3Key || "",
      ).trim() ||
      String(
        (item as { caseInfos?: { ncFile?: { filePath?: string } } })?.caseInfos
          ?.ncFile?.filePath || "",
      ).trim(),
  );
}

export function resolveAutoMachiningHold(
  item?: QueueItem | null,
): AutoMachiningHold | null {
  if (!item) return null;

  const err = item.machiningError;
  if (err) {
    const reason = humanAlarmText([err.message, err.errorCode]);
    return {
      kind: "error",
      label:
        !reason || reason === "가공 오류" ? "오류" : `오류 · ${reason}`,
    };
  }

  if (readNcFlags(item).some((flag) => BLOCKING_NC_FLAGS.has(flag))) {
    return { kind: "nc_invalid", label: "NC 확인" };
  }

  if (
    (item as { caseInfos?: { anodizingEnabled?: boolean } })?.caseInfos
      ?.anodizingEnabled === false
  ) {
    return { kind: "anodizing_off", label: "아노 X" };
  }

  return null;
}

export function isQueueItemAutoStartEligible(item?: QueueItem | null): boolean {
  if (!item) return false;
  if (!String(item.requestId || "").trim()) return false;
  if (resolveAutoMachiningHold(item)) return false;
  if (!hasQueueNc(item)) return false;
  const ncPreloadStatus = String(
    item.ncPreload?.status ||
      (item.productionSchedule as { ncPreload?: { status?: string } } | undefined)
        ?.ncPreload?.status ||
      "",
  ).trim();
  return !isCamGenerationOverlayPending({
    requestId: String(item.requestId || ""),
    hasNc: true,
    ncPreloadStatus,
  });
}

export function autoMachiningHoldCardClass(hold?: AutoMachiningHold | null): string {
  if (!hold) return "border-slate-200";
  if (hold.kind === "error") return "border-destructive bg-destructive-soft";
  return "border-amber-400 bg-amber-50";
}
