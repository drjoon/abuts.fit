/**
 * 기공의뢰수신 — 협력 · 하청 표시/숨김.
 * 원청(직접 수행) 토글은 두지 않는다. 직접 수행 건은 항상 목록에 남긴다.
 * 기본은 협력·하청 모두 표시. 클릭하면 해당 구분만 캘린더·목록에서 뺀다.
 * 협력·하청 건은 목록·캘린더·상세에 역할 뱃지. 원청 직접 수행은 뱃지 없음.
 * - 2026-09-27: 보철 업로드 작업완료 「완료」뱃지. 판정은 isPracticeRecentFinishedBadgeStatus.
 * - 2026-09-27: 상단 필터 왼쪽 협력·하청. 원청 토글 없음. 미배정 하청은 알림.
 * - 2026-09-27: 원청·하청 양쪽 목록·상세에 협력/하청 뱃지.
 */
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";

export type LabReceiveRoleFilterKey = "prime" | "cooperation" | "subcontract";

export const LAB_RECEIVE_ROLE_FILTERS: ReadonlyArray<{
  key: LabReceiveRoleFilterKey;
  label: string;
  hint: string;
}> = [
  {
    key: "prime",
    label: "원청",
    hint: "어벗츠기공소가 직접 수행하는 의뢰입니다.",
  },
  {
    key: "cooperation",
    label: "협력",
    hint: "치과가 지정한 협력 기공소가 수행하는 의뢰입니다.",
  },
  {
    key: "subcontract",
    label: "하청",
    hint: "하청 풀에 열었거나 하청으로 넘긴 의뢰입니다.",
  },
];

export function labReceiveRoleOfTransfer(transfer: {
  assigneeKind?: string | null;
  matchingMode?: string | null;
  autoMatch?: {
    openPool?: boolean | null;
    subcontracted?: boolean | null;
  } | null;
}): LabReceiveRoleFilterKey {
  const kind = String(transfer.assigneeKind || "").trim();
  if (kind === "cooperation") return "cooperation";
  if (kind === "subcontract" || isUnclaimedSubcontractPoolTransfer(transfer)) return "subcontract";
  return "prime";
}

/** 수행 기공소 배정 전. 하청 풀만 연 상태. 레거시 자동매칭 공개 풀은 제외. */
export function isUnclaimedSubcontractPoolTransfer(transfer: {
  assigneeKind?: string | null;
  matchingMode?: string | null;
  autoMatch?: {
    openPool?: boolean | null;
    subcontracted?: boolean | null;
  } | null;
}): boolean {
  if (String(transfer.assigneeKind || "").trim() === "subcontract") return false;
  if (transfer.autoMatch?.subcontracted) return false;
  return (
    Boolean(transfer.autoMatch?.openPool) &&
    String(transfer.matchingMode || "").trim() !== "auto"
  );
}

export type LabReceiveRoleMarker = {
  role: "cooperation" | "subcontract";
  label: "협력" | "하청";
  /** 원청 화면=수행 기공소, 수행 기공소 화면=원청(어벗츠기공소) */
  peer: string;
  hint: string;
};

/** 목록·상세 뱃지. 원청이 직접 수행하는 건은 null. */
export function resolveLabReceiveRoleMarker(
  transfer: {
    assigneeKind?: string | null;
    assigneeLabName?: string | null;
    targetLabName?: string | null;
    matchingMode?: string | null;
    autoMatch?: {
      openPool?: boolean | null;
      subcontracted?: boolean | null;
    } | null;
  },
  opts: { viewerIsPrime: boolean },
): LabReceiveRoleMarker | null {
  const kind = String(transfer.assigneeKind || "").trim();
  const poolOpen = isUnclaimedSubcontractPoolTransfer(transfer);
  const roleKind =
    kind === "cooperation" || kind === "subcontract"
      ? kind
      : poolOpen || transfer.autoMatch?.subcontracted
        ? "subcontract"
        : null;
  if (!roleKind) return null;
  const label = roleKind === "cooperation" ? "협력" : "하청";
  const assignee = String(transfer.assigneeLabName || "").trim();
  const prime = String(transfer.targetLabName || "").trim() || "어벗츠기공소";
  if (opts.viewerIsPrime) {
    return {
      role: roleKind,
      label,
      peer: assignee,
      hint:
        roleKind === "subcontract"
          ? poolOpen
            ? "하청 풀에 연 의뢰입니다."
            : assignee
              ? `${assignee}에 하청으로 넘긴 의뢰입니다.`
              : "하청으로 넘긴 의뢰입니다."
          : assignee
            ? `협력 기공소 ${assignee}가 수행하는 의뢰입니다.`
            : "협력 기공소가 수행하는 의뢰입니다.",
    };
  }
  return {
    role: roleKind,
    label,
    peer: prime,
    hint:
      roleKind === "subcontract"
        ? poolOpen
          ? `${prime} 하청 풀에 들어온 의뢰입니다.`
          : `${prime}에서 하청으로 받은 의뢰입니다.`
        : `${prime} 협력으로 받은 의뢰입니다.`,
  };
}

/** 목록·채팅 「완료」. 판정은 isPracticeRecentFinishedBadgeStatus. */
export function PracticeCalendarFinishedBadge({
  size = "row",
}: {
  size?: "chip" | "row" | "detail";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded font-semibold leading-none",
        "bg-amber-200 text-amber-950 ring-1 ring-inset ring-amber-500/80",
        size === "chip" && "mt-px h-3.5 px-1 text-[9px]",
        size === "row" && "mt-px h-4 px-1 text-[10px]",
        size === "detail" && "h-5 px-1.5 text-[11px]",
      )}
      title="보철을 올려 작업이 완료된 의뢰입니다."
      aria-label="완료"
    >
      완료
    </span>
  );
}

export function LabReceiveRoleBadge({
  marker,
  size = "row",
  showPeer = false,
  className,
}: {
  marker: LabReceiveRoleMarker;
  size?: "chip" | "row" | "detail";
  showPeer?: boolean;
  className?: string;
}) {
  const text =
    showPeer && marker.peer ? `${marker.label} · ${marker.peer}` : marker.label;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded font-semibold leading-none",
        showPeer ? "max-w-[14rem]" : "max-w-[4.5rem]",
        size === "chip" && "mt-px h-3.5 px-1 text-[9px]",
        size === "row" && "mt-px h-4 px-1 text-[10px]",
        size === "detail" && "h-5 px-1.5 text-[11px]",
        marker.role === "subcontract"
          ? "bg-violet-100 text-violet-950 ring-1 ring-inset ring-violet-300"
          : "bg-teal-100 text-teal-950 ring-1 ring-inset ring-teal-300",
        className,
      )}
      title={marker.hint}
      aria-label={marker.hint}
    >
      <span className="truncate">{text}</span>
    </span>
  );
}

type LabReceiveRoleFilterButtonsProps = {
  visible: Record<LabReceiveRoleFilterKey, boolean>;
  counts: Record<LabReceiveRoleFilterKey, number>;
  onToggle: (key: LabReceiveRoleFilterKey) => void;
  /** 기본은 협력·하청. 원청 토글은 쓰지 않는다. */
  keys?: readonly LabReceiveRoleFilterKey[];
  compact?: boolean;
};

export function LabReceiveRoleFilterButtons({
  visible,
  counts,
  onToggle,
  keys = ["cooperation", "subcontract"],
  compact = false,
}: LabReceiveRoleFilterButtonsProps) {
  const items = LAB_RECEIVE_ROLE_FILTERS.filter((item) => keys.includes(item.key));
  if (!items.length) return null;
  return (
    <div
      className="mr-4 flex shrink-0 items-center gap-1"
      role="group"
      aria-label="협력·하청 표시"
    >
      {items.map((item) => {
        const shown = visible[item.key] !== false;
        const count = Math.max(0, Number(counts[item.key] || 0));
        const action = shown ? "숨기기" : "표시하기";
        return (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-full"
                aria-pressed={shown}
                aria-label={`${item.label} ${count}건 ${action}`}
                onClick={() => onToggle(item.key)}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer whitespace-nowrap",
                    compact ? "h-8 gap-1 px-2 text-xs" : "h-8 px-2.5 text-xs",
                    shown
                      ? "border-foreground/25 bg-foreground/5 text-foreground"
                      : "border-dashed text-muted-foreground opacity-60",
                  )}
                >
                  {item.label} {count}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {shown ? `${item.label} 숨기기` : `${item.label} 표시하기`}
              <br />
              {item.hint}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
