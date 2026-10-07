// 페인트를 켜면 뷰 위에 뜨는 도구 막대. 도구·색·굵기, 되돌리기·지우기, 이미지 저장·채팅 첨부, 끄기.
// AI 디자인과 3D·이미지 프리뷰가 같이 쓴다.
// - 2026-09-30: 중앙 하단은 되돌리기부터 둘째 줄.
// - 2026-09-30: 채팅 첨부 썸네일은 막대 위. X·드래그 순서·가로 스크롤. 「AI에게」.
// related files:
// - web/frontend/src/shared/components/practice/ViewPaintSurface.tsx
// - web/frontend/src/shared/components/PreviewAnnotateActions.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Circle,
  CircleDot,
  ImageDown,
  MoveUpRight,
  Paperclip,
  Pencil,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";

import { cn } from "@/shared/ui/cn";
import {
  VIEW_PAINT_COLORS,
  VIEW_PAINT_WIDTHS,
  viewPaintColorLabel,
  type ViewPaintHandle,
  type ViewPaintTool,
} from "@/shared/components/practice/ViewPaintSurface";

const PAINT_TOOLS: Array<{ id: ViewPaintTool; label: string; hint: string; icon: ReactNode }> = [
  { id: "pen", label: "펜", hint: "자유 곡선", icon: <Pencil /> },
  { id: "arrow", label: "화살표", hint: "끌어서 화살표", icon: <MoveUpRight /> },
  { id: "rect", label: "사각형", hint: "끌어서 사각형 · Shift 정사각형", icon: <Square /> },
  { id: "ellipse", label: "원", hint: "끌어서 원 · Shift 정원", icon: <Circle /> },
  { id: "dot", label: "점", hint: "눌러서 점", icon: <CircleDot /> },
  { id: "text", label: "글자", hint: "눌러서 글자 입력 · Enter로 확정", icon: <Type /> },
];

const WIDTH_LABEL = ["얇게", "보통", "굵게"] as const;

/** 닫히면 화면 표시만 지운다(메타데이터는 지우지 않음). `resetKey`가 바뀌어도 같다. */
export function useViewPaint({
  open,
  resetKey,
  initiallyOn = false,
}: {
  open: boolean;
  resetKey: string;
  /** 프리뷰는 끌 수 있다. AI 디자인은 기본 끔. */
  initiallyOn?: boolean;
}) {
  const paintRef = useRef<ViewPaintHandle | null>(null);
  const [paintOn, setPaintOn] = useState(initiallyOn);
  const [tool, setTool] = useState<ViewPaintTool>("pen");
  const [color, setColor] = useState<string>(VIEW_PAINT_COLORS[0]);
  const [width, setWidth] = useState<number>(VIEW_PAINT_WIDTHS[1]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (open) return;
    setPaintOn(initiallyOn);
    // 프리뷰를 닫을 때 빈 표시를 저장하면 안 된다.
    paintRef.current?.clear({ silent: true });
    setCount(0);
  }, [initiallyOn, open]);

  useEffect(() => {
    setPaintOn(initiallyOn);
    paintRef.current?.clear({ silent: true });
    setCount(0);
  }, [initiallyOn, resetKey]);

  return {
    paintRef,
    paintOn,
    setPaintOn,
    tool,
    setTool,
    color,
    setColor,
    width,
    setWidth,
    count,
    setCount,
  };
}

export type ViewPaintState = ReturnType<typeof useViewPaint>;

/** `ViewPaintSurface`에 넘길 값. */
export function viewPaintSurfaceProps(paint: ViewPaintState) {
  return {
    ref: paint.paintRef,
    enabled: paint.paintOn,
    tool: paint.tool,
    color: paint.color,
    width: paint.width,
    onShapesChange: paint.setCount,
    onEscape: () => paint.setPaintOn(false),
  };
}

const toolBtn =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";
const toolBtnOn = "bg-primary text-primary-foreground hover:bg-primary/90";
function PaintDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

export type PaintShot = { id: string; url: string; file: File };

function moveShot(shots: PaintShot[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= shots.length || to >= shots.length) return shots;
  const next = shots.slice();
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

function PaintShotStrip({
  shots,
  onShots,
  onRemove,
  onCommitOrder,
}: {
  shots: PaintShot[];
  onShots: (shots: PaintShot[]) => void;
  onRemove: (shot: PaintShot) => void;
  onCommitOrder: (shots: PaintShot[]) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  const indexAt = (clientX: number, from: number) => {
    const row = rowRef.current;
    if (!row) return from;
    const cards = [...row.querySelectorAll<HTMLElement>("[data-shot]")];
    for (let index = 0; index < cards.length; index += 1) {
      const rect = cards[index].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return index;
    }
    return Math.max(0, cards.length - 1);
  };

  const onPointerDown = (id: string) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const from = shotsRef.current.findIndex((shot) => shot.id === drag.id);
    if (from < 0) return;
    const to = indexAt(event.clientX, from);
    if (to === from) return;
    drag.moved = true;
    const next = moveShot(shotsRef.current, from, to);
    shotsRef.current = next;
    onShots(next);
  };

  return (
    <div
      ref={rowRef}
      className="pointer-events-auto flex w-max min-w-0 max-w-full items-center gap-1.5 overflow-x-auto rounded-xl border bg-background/95 p-1.5 shadow-lg backdrop-blur"
      aria-label="채팅 첨부 이미지"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {shots.map((shot, index) => (
        <div
          key={shot.id}
          data-shot
          className="relative h-14 w-14 shrink-0 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown(shot.id)}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            const drag = dragRef.current;
            dragRef.current = null;
            if (drag?.moved) onCommitOrder(shotsRef.current);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <img
            src={shot.url}
            alt={`첨부 ${index + 1}`}
            draggable={false}
            className="h-full w-full rounded-md border object-cover"
          />
          <span className="absolute left-0.5 top-0.5 rounded-full bg-white/95 px-1 text-[0.625rem] font-semibold leading-4 text-slate-900 shadow-sm">
            ({index + 1})
          </span>
          <button
            type="button"
            className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            aria-label={`${index + 1}번 첨부 지우기`}
            title={`${index + 1}번 첨부 지우기`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onRemove(shot)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ViewPaintToolbar({
  paint,
  onSaveImage,
  onAttachChat,
  onRemoveChatFile,
  onReorderChatFiles,
  onSendToAi,
  twoRow,
  className,
}: {
  paint: ViewPaintState;
  onSaveImage?: () => void;
  /**
   * 없으면 채팅 첨부를 두지 않는다. 표시가 없어도 현재 화면을 첨부한다.
   * `File`을 돌려주면 막대 위에 순번 썸네일로 쌓는다.
   */
  onAttachChat?: () => void | Promise<void | File | null>;
  /** 썸네일 X. 채팅 입력에 넣은 파일을 뺀다. */
  onRemoveChatFile?: (file: File) => void;
  /** 썸네일 순서를 채팅 첨부와 맞춘다. */
  onReorderChatFiles?: (files: File[]) => void;
  /** 현재 화면을 AI 채팅으로 넘긴다. */
  onSendToAi?: () => void;
  /** 되돌리기부터 아래 줄. 중앙 하단 페인트 막대. */
  twoRow?: boolean;
  className?: string;
}) {
  const { paintRef, tool, setTool, color, setColor, width, setWidth, count, setPaintOn } = paint;
  const [shots, setShots] = useState<PaintShot[]>([]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => {
    return () => {
      for (const shot of shotsRef.current) URL.revokeObjectURL(shot.url);
    };
  }, []);

  const appendShot = (file: File) => {
    const shot = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, url: URL.createObjectURL(file), file };
    setShots((prev) => [...prev, shot]);
  };
  const removeShot = (shot: PaintShot) => {
    URL.revokeObjectURL(shot.url);
    setShots((prev) => prev.filter((row) => row.id !== shot.id));
    onRemoveChatFile?.(shot.file);
  };

  const drawRow = (
    <>
      <div className="flex items-center gap-0.5">
        {PAINT_TOOLS.map((row) => (
          <button
            key={row.id}
            type="button"
            className={cn(toolBtn, tool === row.id && toolBtnOn)}
            aria-pressed={tool === row.id}
            aria-label={row.label}
            title={`${row.label} — ${row.hint}`}
            onClick={() => setTool(row.id)}
          >
            {row.icon}
          </button>
        ))}
      </div>
      <PaintDivider />
      <div className="flex items-center gap-1 px-0.5" role="group" aria-label="표시 색">
        {VIEW_PAINT_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={cn(
              "h-5 w-5 shrink-0 rounded-full border border-black/15",
              color === swatch && "ring-2 ring-primary ring-offset-1",
            )}
            style={{ backgroundColor: swatch }}
            aria-label={viewPaintColorLabel(swatch)}
            aria-pressed={color === swatch}
            title={viewPaintColorLabel(swatch)}
            onClick={() => setColor(swatch)}
          />
        ))}
      </div>
      <PaintDivider />
      <div className="flex items-center gap-0.5" role="group" aria-label="굵기">
        {VIEW_PAINT_WIDTHS.map((value, index) => (
          <button
            key={value}
            type="button"
            className={cn(toolBtn, width === value && "bg-muted ring-1 ring-border")}
            aria-pressed={width === value}
            aria-label={`굵기 ${WIDTH_LABEL[index]}`}
            title={`굵기 ${WIDTH_LABEL[index]}`}
            onClick={() => setWidth(value)}
          >
            <span
              className="rounded-full"
              style={{
                width: `${(value + 2) / 16}rem`,
                height: `${(value + 2) / 16}rem`,
                backgroundColor: color,
              }}
            />
          </button>
        ))}
      </div>
    </>
  );
  const actionRow = (
    <>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={toolBtn}
          disabled={count === 0}
          aria-label="되돌리기"
          title="되돌리기 (⌘/Ctrl+Z)"
          onClick={() => paintRef.current?.undo()}
        >
          <Undo2 />
        </button>
        <button
          type="button"
          className={cn(toolBtn, "text-destructive hover:bg-destructive-soft")}
          disabled={count === 0}
          aria-label="모두 지우기"
          title="모두 지우기"
          onClick={() => paintRef.current?.clear()}
        >
          <Trash2 />
        </button>
      </div>
      {onSaveImage || onAttachChat || onSendToAi ? (
        <>
          <PaintDivider />
          <div className="flex items-center gap-1">
            {onSaveImage ? (
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-foreground hover:bg-muted [&_svg]:size-3.5"
                title="표시가 입혀진 현재 화면을 PNG로 저장"
                aria-label="이미지 저장"
                onClick={onSaveImage}
              >
                <ImageDown />
                이미지 저장
              </button>
            ) : null}
            {onAttachChat ? (
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 [&_svg]:size-3.5"
                title="현재 화면(표시 포함)을 채팅에 첨부하고 위에 썸네일로 남깁니다"
                aria-label="채팅 첨부"
                onClick={() => {
                  void Promise.resolve(onAttachChat()).then((file) => {
                    if (file instanceof File) appendShot(file);
                  });
                }}
              >
                <Paperclip />
                채팅 첨부
              </button>
            ) : null}
            {onSendToAi ? (
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-md border border-primary px-2.5 text-xs font-medium text-primary hover:bg-primary-soft [&_svg]:size-3.5"
                title="현재 화면(표시 포함)을 AI 채팅에 전달합니다"
                aria-label="AI에게"
                onClick={onSendToAi}
              >
                AI에게
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      <PaintDivider />
      <button
        type="button"
        className={toolBtn}
        aria-label="페인트 끄기"
        title="페인트 끄기 (Esc) — 그린 표시는 남습니다"
        onClick={() => setPaintOn(false)}
      >
        <X />
      </button>
    </>
  );

  return (
    <div className={cn("pointer-events-none flex w-full max-w-[calc(100%-1.5rem)] flex-col items-center gap-2", className)}>
      {shots.length > 0 ? (
        <PaintShotStrip
          shots={shots}
          onShots={setShots}
          onRemove={removeShot}
          onCommitOrder={(next) => onReorderChatFiles?.(next.map((shot) => shot.file))}
        />
      ) : null}
    <div
      role="toolbar"
      aria-label="페인트 도구"
      className={cn(
        "pointer-events-auto flex max-w-full items-center justify-center rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur",
        twoRow ? "flex-col gap-1" : "flex-wrap gap-y-1",
      )}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-center">{drawRow}</div>
      <div className="flex flex-wrap items-center justify-center">
        {twoRow ? null : <PaintDivider />}
        {actionRow}
      </div>
    </div>
    </div>
  );
}
