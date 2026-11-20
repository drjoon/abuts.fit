// 커스텀어벗 디자인 화면의 소통 패널. 치과·기공소가 같은 컴포넌트를 쓴다.
// 뷰어 위에 떠 있고, 헤더로 옮기며, 가장자리로 크기를 바꾼다. 최소 가로는 260px.
// 귀퉁이·다른 패널(큐브 등) 근처에서 놓으면 붙는다. 입력은 가로 전체, 전송·첨부는 아랫줄.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/features/chat/components/ChatComposer.tsx

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref, type RefObject } from "react";
import { ChevronDown, Loader2, MessageSquare, Paintbrush, Paperclip } from "lucide-react";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import {
  useBackgroundTempUpload,
  type ChatMessageAttachment,
} from "@/shared/hooks/useBackgroundTempUpload";
import type { ChatMessage } from "@/shared/hooks/useChatRooms";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";

/** 크기 조절 하한. 사용자가 지정한 최소 가로. */
const MIN_W = 260;
const MIN_H = 220;
/** 작업영역 가장자리·패널 사이 여백(귀퉁이 스냅과 동일). */
export const VIEWER_PANEL_EDGE = 12;
/** 이 거리 안이면 귀퉁이·다른 패널에 붙인다. */
const SNAP = 72;
const EDGE = VIEWER_PANEL_EDGE;

type Corner = "nw" | "ne" | "sw" | "se";
type FrameBox = { x: number; y: number; w: number; h: number; corner: Corner | null };
export type ViewerResizeEdge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export const VIEWER_RESIZE_HANDLES: { edge: ViewerResizeEdge; className: string }[] = [
  { edge: "n", className: "left-2 right-2 top-0 h-1.5 cursor-ns-resize" },
  { edge: "s", className: "bottom-0 left-2 right-2 h-1.5 cursor-ns-resize" },
  { edge: "w", className: "bottom-2 left-0 top-2 w-1.5 cursor-ew-resize" },
  { edge: "e", className: "bottom-2 right-0 top-2 w-1.5 cursor-ew-resize" },
  { edge: "nw", className: "left-0 top-0 h-3 w-3 cursor-nwse-resize" },
  { edge: "ne", className: "right-0 top-0 h-3 w-3 cursor-nesw-resize" },
  { edge: "sw", className: "bottom-0 left-0 h-3 w-3 cursor-nesw-resize" },
  { edge: "se", className: "bottom-0 right-0 h-3 w-3 cursor-nwse-resize" },
];

function cornerPoint(
  corner: Corner,
  boundsW: number,
  boundsH: number,
  width: number,
  height: number,
) {
  const right = Math.max(EDGE, boundsW - width - EDGE);
  const bottom = Math.max(EDGE, boundsH - height - EDGE);
  if (corner === "nw") return { x: EDGE, y: EDGE };
  if (corner === "ne") return { x: right, y: EDGE };
  if (corner === "sw") return { x: EDGE, y: bottom };
  return { x: right, y: bottom };
}

type LocalRect = { x: number; y: number; w: number; h: number };

function clampInBounds(
  x: number,
  y: number,
  boundsW: number,
  boundsH: number,
  width: number,
  height: number,
) {
  const maxX = Math.max(EDGE, boundsW - width - EDGE);
  const maxY = Math.max(EDGE, boundsH - height - EDGE);
  return {
    x: Math.min(Math.max(x, EDGE), maxX),
    y: Math.min(Math.max(y, EDGE), maxY),
  };
}

export function readPeerRects(
  bounds: DOMRect,
  peers: readonly RefObject<HTMLElement | null>[],
  self: HTMLElement | null,
): LocalRect[] {
  const out: LocalRect[] = [];
  for (const ref of peers) {
    const el = ref.current;
    if (!el || el === self) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({
      x: r.left - bounds.left,
      y: r.top - bounds.top,
      w: r.width,
      h: r.height,
    });
  }
  return out;
}

export function placeViewerPanel(
  x: number,
  y: number,
  boundsW: number,
  boundsH: number,
  width: number,
  height: number,
  snap: boolean,
  peers: LocalRect[],
): Pick<FrameBox, "x" | "y" | "corner"> {
  const base = clampInBounds(x, y, boundsW, boundsH, width, height);
  if (!snap) return { x: base.x, y: base.y, corner: null };

  type SnapTarget = { x: number; y: number; corner: Corner | null; dist: number };
  const targets: SnapTarget[] = [];

  for (const corner of ["nw", "ne", "sw", "se"] as const) {
    const point = cornerPoint(corner, boundsW, boundsH, width, height);
    targets.push({
      ...point,
      corner,
      dist: Math.hypot(base.x - point.x, base.y - point.y),
    });
  }

  const pushPeer = (tx: number, ty: number) => {
    const clamped = clampInBounds(tx, ty, boundsW, boundsH, width, height);
    targets.push({
      x: clamped.x,
      y: clamped.y,
      corner: null,
      dist: Math.hypot(base.x - clamped.x, base.y - clamped.y),
    });
  };

  const overlapsPeer = (tx: number, ty: number) =>
    peers.some(
      (peer) =>
        tx < peer.x + peer.w - 1 &&
        tx + width > peer.x + 1 &&
        ty < peer.y + peer.h - 1 &&
        ty + height > peer.y + 1,
    );

  for (const peer of peers) {
    const peerRight = peer.x + peer.w;
    const peerBottom = peer.y + peer.h;
    const candidates = [
      // 같은 변 맞춤 — 겹치면 아래에서 버린다
      [peer.x, base.y],
      [peerRight - width, base.y],
      [base.x, peer.y],
      [base.x, peerBottom - height],
      // 이웃 배치 — 창 가장자리와 같은 EDGE
      [peer.x, peerBottom + EDGE],
      [peerRight - width, peerBottom + EDGE],
      [peerRight + EDGE, peer.y],
      [peerRight + EDGE, peerBottom - height],
      [peer.x - width - EDGE, peer.y],
      [peer.x - width - EDGE, peerBottom - height],
      [peer.x, peer.y - height - EDGE],
      [peerRight - width, peer.y - height - EDGE],
    ];
    for (const [tx, ty] of candidates) {
      if (overlapsPeer(tx, ty)) continue;
      pushPeer(tx, ty);
    }
  }

  let best: SnapTarget | null = null;
  for (const target of targets) {
    if (target.corner == null && overlapsPeer(target.x, target.y)) continue;
    if (target.dist <= SNAP && (!best || target.dist < best.dist)) best = target;
  }
  if (!best) return { x: base.x, y: base.y, corner: null };
  return { x: best.x, y: best.y, corner: best.corner };
}

type Props = {
  boundsRef: RefObject<HTMLElement | null>;
  /** 작업영역 안 다른 패널 — 드롭 시 변·스택 정렬에 스냅 */
  snapPeerRefs?: readonly RefObject<HTMLElement | null>[];
  /** 다른 패널이 이 프레임에 스냅할 때 쓴다. */
  panelRef?: RefObject<HTMLElement | null>;
  title: string;
  peerName: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  paintCount: number;
  paintOn: boolean;
  onTogglePaint: () => void;
  loading: boolean;
  messages: readonly ChatMessage[];
  authUserId: string;
  draft: string;
  onDraft: (value: string) => void;
  sending: boolean;
  onSend: (attachments: ChatMessageAttachment[]) => Promise<boolean>;
  inputRef?: Ref<HTMLTextAreaElement>;
};

export function DesignShareChatPanel({
  boundsRef,
  snapPeerRefs = [],
  panelRef,
  title,
  peerName,
  collapsed,
  onToggleCollapsed,
  paintCount,
  paintOn,
  onTogglePaint,
  loading,
  messages,
  authUserId,
  draft,
  onDraft,
  sending,
  onSend,
  inputRef,
}: Props) {
  const { toast } = useToast();
  const token = useAuthStore((state) => state.token);
  const uploads = useBackgroundTempUpload({ token });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<null | { ox: number; oy: number; x: number; y: number; moved: boolean }>(null);
  const resizeRef = useRef<null | {
    edge: ViewerResizeEdge;
    x: number;
    y: number;
    l: number;
    t: number;
    w: number;
    h: number;
    moved: boolean;
    next: { x: number; y: number; w: number; h: number };
  }>(null);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState<FrameBox | null>(null);
  const [moving, setMoving] = useState(false);
  const shown = messages.slice(-20);
  const boxRef = useRef(box);
  boxRef.current = box;
  /** 펼친 높이. 접힌 막대를 끌어도 이 값은 유지한다. */
  const openHeightRef = useRef(448);
  /** 접힌 막대의 아래 변. 펼칠 때 이 변을 기준으로 위로 키운다. */
  const dockBottomRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const bounds = boundsRef.current;
    if (!bounds) return;
    const apply = () => {
      const current = boxRef.current;
      if (!current?.corner) return;
      const area = bounds.getBoundingClientRect();
      const height = frameRef.current?.offsetHeight ?? current.h;
      const next = cornerPoint(current.corner, area.width, area.height, current.w, height);
      setBox((prev) => {
        if (!prev || prev.corner !== current.corner) return prev;
        if (prev.x === next.x && prev.y === next.y) return prev;
        return { ...prev, ...next };
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bounds);
    return () => observer.disconnect();
  }, [boundsRef, box?.corner, box?.w, collapsed]);

  useLayoutEffect(() => {
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current;
    if (!bounds || !panel) return;
    if (collapsed) {
      const top = boxRef.current?.y ?? panel.getBoundingClientRect().top - bounds.top;
      dockBottomRef.current = top + panel.offsetHeight;
      return;
    }
    const h = panel.offsetHeight;
    if (h > 120) openHeightRef.current = boxRef.current?.h && boxRef.current.h > 120 ? boxRef.current.h : h;
    const bottom = dockBottomRef.current;
    dockBottomRef.current = null;
    if (bottom == null) return;
    const top = boxRef.current?.y ?? panel.getBoundingClientRect().top - bounds.top;
    const maxH = Math.max(160, bounds.height - EDGE * 2);
    const height = Math.min(Math.max(openHeightRef.current, 220), maxH);
    const nearBottom = bounds.height - bottom <= top + 48;
    let y = nearBottom ? bottom - height : top;
    y = Math.max(EDGE, Math.min(y, bounds.height - height - EDGE));
    setBox((prev) => {
      const w = prev?.w ?? panel.offsetWidth;
      const x = prev?.x ?? panel.getBoundingClientRect().left - bounds.left;
      if (prev && prev.y === y && prev.h === height && prev.w === w) return prev;
      return { x, y, w, h: height, corner: prev?.corner ?? null };
    });
  }, [boundsRef, collapsed]);

  const readBox = () => {
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current?.getBoundingClientRect();
    if (!bounds || !panel) return null;
    return {
      x: panel.left - bounds.left,
      y: panel.top - bounds.top,
      w: panel.width,
      h: panel.height,
    };
  };

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const current = readBox();
    if (!current) return;
    dragRef.current = {
      ox: event.clientX - (boundsRef.current?.getBoundingClientRect().left ?? 0) - current.x,
      oy: event.clientY - (boundsRef.current?.getBoundingClientRect().top ?? 0) - current.y,
      x: current.x,
      y: current.y,
      moved: false,
    };
    const keptH = collapsed
      ? Math.max(openHeightRef.current, boxRef.current?.h && boxRef.current.h > 120 ? boxRef.current.h : 0)
      : (boxRef.current?.h ?? current.h);
    setBox((prev) => ({
      x: current.x,
      y: current.y,
      w: current.w,
      h: keptH || current.h,
      corner: null,
    }));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHeaderPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current;
    if (!drag || !bounds || !panel) return;
    const rawX = event.clientX - bounds.left - drag.ox;
    const rawY = event.clientY - bounds.top - drag.oy;
    if (!drag.moved && Math.hypot(rawX - drag.x, rawY - drag.y) < 4) return;
    drag.moved = true;
    drag.x = rawX;
    drag.y = rawY;
    const placed = placeViewerPanel(
      rawX,
      rawY,
      bounds.width,
      bounds.height,
      panel.offsetWidth,
      panel.offsetHeight,
      false,
      [],
    );
    setMoving(true);
    setBox((prev) =>
      prev
        ? { ...prev, x: placed.x, y: placed.y, corner: null }
        : { x: placed.x, y: placed.y, w: panel.offsetWidth, h: panel.offsetHeight, corner: null },
    );
  };

  const onHeaderPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setMoving(false);
    if (!drag?.moved) return;
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current;
    if (!bounds || !panel) return;
    const peers = readPeerRects(bounds, snapPeerRefs, panel);
    const placed = placeViewerPanel(
      drag.x,
      drag.y,
      bounds.width,
      bounds.height,
      panel.offsetWidth,
      panel.offsetHeight,
      true,
      peers,
    );
    if (collapsed) dockBottomRef.current = placed.y + panel.offsetHeight;
    setBox((prev) =>
      prev
        ? { ...prev, ...placed, h: collapsed ? Math.max(prev.h, openHeightRef.current) : prev.h }
        : {
            ...placed,
            w: panel.offsetWidth,
            h: collapsed ? openHeightRef.current : panel.offsetHeight,
          },
    );
  };

  const onResizeDown = (edge: ViewerResizeEdge) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const current = readBox();
    if (!current) return;
    resizeRef.current = {
      edge,
      x: event.clientX,
      y: event.clientY,
      l: current.x,
      t: current.y,
      w: current.w,
      h: current.h,
      moved: false,
      next: { x: current.x, y: current.y, w: current.w, h: current.h },
    };
    setBox((prev) => ({
      x: current.x,
      y: current.y,
      w: current.w,
      h: prev?.h ?? current.h,
      corner: null,
    }));
    setMoving(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = resizeRef.current;
    const bounds = boundsRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;
    const maxW = Math.max(MIN_W, bounds.width - EDGE * 2);
    const maxH = Math.max(MIN_H, bounds.height - EDGE * 2);
    let left = drag.l;
    let top = drag.t;
    let width = drag.w;
    let height = drag.h;
    const growWest = drag.edge.includes("w");
    const growEast = drag.edge.includes("e");
    const growNorth = drag.edge.includes("n");
    const growSouth = drag.edge.includes("s");
    if (growEast) width = drag.w + dx;
    if (growWest) {
      width = drag.w - dx;
      left = drag.l + dx;
    }
    if (!collapsed) {
      if (growSouth) height = drag.h + dy;
      if (growNorth) {
        height = drag.h - dy;
        top = drag.t + dy;
      }
    }
    width = Math.min(Math.max(width, Math.min(MIN_W, maxW)), maxW);
    height = Math.min(Math.max(height, Math.min(MIN_H, maxH)), maxH);
    if (growWest) left = drag.l + (drag.w - width);
    if (growNorth && !collapsed) top = drag.t + (drag.h - height);
    left = Math.min(Math.max(left, EDGE), Math.max(EDGE, bounds.width - width - EDGE));
    top = Math.min(Math.max(top, EDGE), Math.max(EDGE, bounds.height - height - EDGE));
    drag.next = { x: left, y: top, w: width, h: height };
    setBox((prev) => ({
      x: left,
      y: top,
      w: width,
      h: collapsed ? (prev?.h ?? height) : height,
      corner: null,
    }));
  };

  const onResizeUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = resizeRef.current;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setMoving(false);
    if (!drag?.moved) return;
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = frameRef.current;
    if (!bounds || !panel) return;
    const peers = readPeerRects(bounds, snapPeerRefs, panel);
    const placed = placeViewerPanel(
      drag.next.x,
      drag.next.y,
      bounds.width,
      bounds.height,
      drag.next.w,
      collapsed ? (boxRef.current?.h ?? drag.next.h) : drag.next.h,
      true,
      peers,
    );
    if (!collapsed && drag.next.h > 120) openHeightRef.current = drag.next.h;
    setBox((prev) =>
      prev
        ? { ...prev, ...placed, w: drag.next.w, h: collapsed ? prev.h : drag.next.h }
        : { ...placed, w: drag.next.w, h: drag.next.h },
    );
  };

  useEffect(() => {
    if (collapsed) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [collapsed, messages]);

  const submit = () => {
    if (busy || sending) return;
    void (async () => {
      setBusy(true);
      try {
        if (uploads.hasError) {
          toast({
            title: "파일 업로드 실패",
            description: "첨부 파일을 확인한 뒤 다시 보내 주세요.",
            variant: "destructive",
          });
          return;
        }
        const attachments = await uploads.ensureChatAttachments();
        const ok = await onSend(attachments);
        if (ok) uploads.clear();
      } catch {
        toast({
          title: "파일 업로드 실패",
          description: "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    })();
  };

  const floated = box != null;
  return (
    <div
      ref={(node) => {
        frameRef.current = node;
        if (panelRef) panelRef.current = node;
      }}
      className={cn(
        "pointer-events-auto absolute z-30 flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur",
        !floated && "min-w-[260px]",
        !floated && "left-3 top-[11.5rem] w-[20rem] max-w-[calc(100%-1.5rem)]",
        !floated && !collapsed && "h-[min(28rem,calc(100%-13rem))]",
        floated && !moving && "transition-[left,top] duration-200 ease-out",
        floated && collapsed && "h-auto",
      )}
      style={
        floated
          ? {
              left: box.x,
              top: box.y,
              width: box.w,
              height: collapsed ? undefined : box.h,
            }
          : undefined
      }
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          "flex shrink-0 cursor-grab touch-none select-none items-center justify-between gap-2 px-3 py-1.5 text-xs active:cursor-grabbing",
          !collapsed && "border-b",
        )}
        title="끌어 옮기면 귀퉁이나 다른 패널에 붙습니다"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <div className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
          {paintCount > 0 ? (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary">
              페인트 {paintCount}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={cn(
              "flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[0.6875rem] font-medium transition-colors",
              paintOn
                ? "bg-primary text-primary-foreground"
                : "border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={onTogglePaint}
          >
            <Paintbrush className="h-3 w-3" />
            <span>페인트</span>
          </button>
          <button
            type="button"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? "소통 패널 펼치기" : "소통 패널 접기"}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 py-1.5 text-xs"
        >
          {loading ? (
            <p className="flex items-center gap-1.5 px-1 py-1 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>대화를 불러오는 중…</span>
            </p>
          ) : shown.length === 0 ? (
            <p className="px-1 py-1 text-muted-foreground">
              화면·페인트·대화를 같이 봅니다.
            </p>
          ) : (
            shown.map((msg) => {
              const senderId = String(msg.sender?._id || "").trim();
              const mine = Boolean(authUserId && senderId === authUserId);
              const isSystem = msg.messageKind === "system" || Boolean(msg.systemEvent);
              if (isSystem) {
                return (
                  <div
                    key={msg._id}
                    className="rounded bg-muted/70 px-2 py-1 text-[0.6875rem] text-muted-foreground"
                  >
                    {msg.content}
                  </div>
                );
              }
              const files = Array.isArray(msg.attachments) ? msg.attachments : [];
              return (
                <div
                  key={msg._id}
                  className={cn(
                    "flex items-baseline gap-1.5 leading-snug",
                    mine ? "justify-end" : "justify-start",
                  )}
                >
                  {!mine ? (
                    <span className="shrink-0 font-semibold text-muted-foreground">
                      {msg.sender?.name || peerName}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "max-w-[82%] break-words rounded-lg px-2.5 py-1",
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "border bg-muted/50 text-foreground",
                    )}
                  >
                    {msg.content ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : null}
                    {files.length > 0 ? (
                      <span className={cn("flex flex-col gap-0.5", msg.content && "mt-1")}>
                        {files.map((file) => (
                          <span
                            key={file.s3Key || file.fileName}
                            className="inline-flex min-w-0 items-center gap-1"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="truncate">{file.fileName}</span>
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {!collapsed ? (
        <ChatComposer
          draft={draft}
          onDraftChange={onDraft}
          onSend={submit}
          placeholder="메시지 입력"
          isSending={sending || busy}
          pendingUploads={uploads.items}
          onPickFiles={uploads.addFiles}
          onRemovePendingFile={uploads.removeItem}
          onRetryPendingFile={uploads.retryItem}
          sendPlacement="below"
          sendLabel="전송"
          inputRef={inputRef}
          compact
          className="space-y-1.5 px-2.5 pb-2 pt-2 sm:px-2.5 sm:pb-2 sm:pt-2"
        />
      ) : null}
      {!collapsed
        ? VIEWER_RESIZE_HANDLES.map((handle) => (
        <div
          key={handle.edge}
          role="separator"
          aria-label="소통 패널 크기"
          aria-orientation={
            handle.edge === "n" || handle.edge === "s"
              ? "horizontal"
              : handle.edge === "e" || handle.edge === "w"
                ? "vertical"
                : undefined
          }
          className={cn("absolute z-10 touch-none", handle.className)}
          onPointerDown={onResizeDown(handle.edge)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
        />
      ))
        : null}
    </div>
  );
}
