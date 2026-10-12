// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useMachiningBoard.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningAlertModal.tsx
// change-log:
// - 2026-10-13: 같은 가공 중단의 tick·fail·alarm 알림을 한 건으로 합친다.
import type {
  MachiningAlarmDetail,
  MachiningAlertItem,
} from "./components/MachiningAlertModal";

const INCIDENT_WINDOW_MS = 60_000;

export function normalizeAlarmDetails(raw: unknown): MachiningAlarmDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((alarm: any) => ({
    headType:
      alarm?.headType != null
        ? Number(alarm.headType)
        : alarm?.headtype != null
          ? Number(alarm.headtype)
          : null,
    type: alarm?.type != null ? String(alarm.type) : "",
    no: alarm?.no != null ? String(alarm.no) : "",
    message: String(alarm?.message || "").trim(),
    displayText: String(alarm?.displayText || alarm?.message || "").trim(),
    source: String(alarm?.source || "").trim(),
  }));
}

function looksLikeAlarmJson(value: string): boolean {
  const text = value.trim();
  return text.startsWith("[") || text.startsWith("{");
}

function alarmsFromText(value: string): MachiningAlarmDetail[] {
  const text = String(value || "").trim();
  if (!text.startsWith("[")) return [];
  try {
    return normalizeAlarmDetails(JSON.parse(text));
  } catch {
    return [];
  }
}

export function readAlarmDetails(raw: unknown): MachiningAlarmDetail[] {
  if (Array.isArray(raw)) return normalizeAlarmDetails(raw);
  return alarmsFromText(String(raw || ""));
}

function isStatusOnlyAlarm(alarm: MachiningAlarmDetail): boolean {
  const source = String(alarm.source || "");
  if (source.startsWith("MachineStatusType.")) return true;
  const type = String(alarm.type ?? "").trim();
  const no = String(alarm.no ?? "").trim();
  return type === "-1" && (no === "-1" || no === "0");
}

function isConcreteAlarm(alarm: MachiningAlarmDetail): boolean {
  if (isStatusOnlyAlarm(alarm)) return false;
  const type = Number(alarm.type);
  const no = Number(alarm.no);
  return Number.isFinite(type) && Number.isFinite(no) && type >= 0 && no >= 0;
}

export function combineAlarmDetails(
  alarms: MachiningAlarmDetail[],
): MachiningAlarmDetail[] {
  const concrete = alarms.filter(isConcreteAlarm);
  const pool = concrete.length ? concrete : alarms;
  const seen = new Set<string>();
  const out: MachiningAlarmDetail[] = [];
  for (const alarm of pool) {
    const key = [
      alarm.headType ?? "",
      alarm.type ?? "",
      alarm.no ?? "",
      alarm.source || "",
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alarm);
  }
  return out.slice(0, 12);
}

function alarmSummary(alarms: MachiningAlarmDetail[]): string {
  return alarms
    .map((alarm) => String(alarm.displayText || alarm.message || "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
}

export function isMaterialExhaustedAlarmText(value: unknown): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  const upper = text.toUpperCase();
  if (upper.includes("CNC_ALARM_MATERIAL_EXHAUST")) return true;
  if (upper.includes("TYPE=15") && upper.includes("NO=1051")) return true;
  if (/TYPE\s*=\s*15/.test(upper) && /NO\s*=\s*1051/.test(upper)) return true;
  return (
    text.includes("소재") &&
    (text.includes("교체") || text.includes("소진") || text.includes("부족"))
  );
}

export function humanAlarmText(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    if (looksLikeAlarmJson(text)) continue;
    if (text === "ALARM" || text === "FAILED") continue;
    return text;
  }
  return "";
}

function parseTime(raw: string | undefined): number {
  const time = new Date(String(raw || "")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sameIncident(a: MachiningAlertItem, b: MachiningAlertItem): boolean {
  if (String(a.machineId || "").trim() !== String(b.machineId || "").trim()) {
    return false;
  }
  const ridA = String(a.requestId || "").trim();
  const ridB = String(b.requestId || "").trim();
  const jobA = String(a.jobId || "").trim();
  const jobB = String(b.jobId || "").trim();
  if (ridA && ridB && ridA !== ridB) return false;
  if (jobA && jobB && jobA !== jobB) return false;
  const requestMatch = Boolean(ridA && ridB && ridA === ridB);
  const jobMatch = Boolean(jobA && jobB && jobA === jobB);
  if (!requestMatch && !jobMatch) return false;
  const timeA = parseTime(a.updatedAt);
  const timeB = parseTime(b.updatedAt);
  if (!timeA || !timeB) return true;
  return Math.abs(timeA - timeB) <= INCIDENT_WINDOW_MS;
}

function mergeIncident(
  primary: MachiningAlertItem,
  extra: MachiningAlertItem,
): MachiningAlertItem {
  const alarms = combineAlarmDetails([
    ...(primary.alarms || []),
    ...(extra.alarms || []),
    ...alarmsFromText(primary.reason || ""),
    ...alarmsFromText(extra.reason || ""),
    ...alarmsFromText(primary.message || ""),
    ...alarmsFromText(extra.message || ""),
  ]);
  const summary = alarmSummary(alarms);
  const reason = humanAlarmText([
    primary.reason,
    extra.reason,
    primary.message,
    extra.message,
    summary,
  ]);
  const alarmText =
    summary ||
    humanAlarmText([
      primary.alarmText,
      extra.alarmText,
      primary.message,
      extra.message,
    ]) ||
    "CNC 알람";
  const timeA = parseTime(primary.updatedAt);
  const timeB = parseTime(extra.updatedAt);
  const updatedAt =
    timeA && timeB
      ? timeA <= timeB
        ? primary.updatedAt
        : extra.updatedAt
      : primary.updatedAt || extra.updatedAt;
  return {
    machineId: primary.machineId || extra.machineId,
    requestId: primary.requestId || extra.requestId || null,
    jobId: primary.jobId || extra.jobId || null,
    errorCode: primary.errorCode || extra.errorCode || null,
    message: humanAlarmText([primary.message, extra.message, reason]) || alarmText,
    alarmText,
    reason: reason || undefined,
    alarms,
    source:
      primary.source === "live" || extra.source === "live"
        ? "live"
        : primary.source || extra.source,
    updatedAt,
    count: 1,
  };
}

export function collapseMachiningAlerts(
  list: MachiningAlertItem[],
): MachiningAlertItem[] {
  const out: MachiningAlertItem[] = [];
  for (const item of list) {
    const normalized = mergeIncident(item, {
      ...item,
      alarms: item.alarms || [],
    });
    const index = out.findIndex((existing) => sameIncident(existing, normalized));
    if (index === -1) {
      out.push(normalized);
      continue;
    }
    out[index] = mergeIncident(out[index], normalized);
  }
  return out;
}
