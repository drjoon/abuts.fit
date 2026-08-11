// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/ui/semanticStatus.ts
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import {
  getMachineStatusDotClass as getSemanticMachineDot,
} from "@/shared/ui/semanticStatus";

export type MachineStatusLevel = "ok" | "warn" | "alarm" | "idle" | "unknown";

export const deriveMachineStatusLevel = (
  status?: string | null,
): MachineStatusLevel => {
  const s = String(status || "").trim().toUpperCase();
  if (!s) return "unknown";
  if (["ALARM", "ERROR", "FAULT"].some((k) => s.includes(k))) return "alarm";
  if (["WARN", "WARNING"].some((k) => s.includes(k))) return "warn";
  if (["RUN", "RUNNING", "ONLINE", "OK"].some((k) => s.includes(k))) return "ok";
  if (["STOP", "IDLE", "READY"].some((k) => s.includes(k))) return "idle";
  return "unknown";
};

export const getMachineStatusDotClass = (status?: string | null) => {
  return getSemanticMachineDot(deriveMachineStatusLevel(status));
};

export const getMachineStatusLabel = (status?: string | null) => {
  const level = deriveMachineStatusLevel(status);
  switch (level) {
    case "ok":
      return "가공중";
    case "alarm":
      return "알람";
    case "warn":
      return "주의";
    case "idle":
      return "중단중";
    default:
      return "대기";
  }
};
