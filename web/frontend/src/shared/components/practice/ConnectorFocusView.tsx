// 기공소 AI 보철 — 커넥터 단면 보기. 양쪽 치아 인접면 위에 단면 윤곽과 조절점을 둔다.

import { useRef } from "react";

import type { ConnectorSectionShot } from "@/shared/components/practice/OralScanOverlayViewer";
import {
  clampConnectorShift,
  connectorIsWeak,
  connectorOutline,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import { cn } from "@/shared/ui/cn";

type Props = {
  shot: ConnectorSectionShot | null;
  link: { from: string; to: string };
  edit: ToothDesignEdit;
  /** 조립된 브리지는 분리하기 전까지 옮기지 않는다. */
  locked: boolean;
  onShift: (shiftXMm: number, shiftYMm: number) => void;
};

const TICK_MM = 2.5;

export function ConnectorFocusView({ shot, link, edit, locked, onShift }: Props) {
  const connector = edit.connector;
  const weak = connectorIsWeak(edit, [link.from, link.to]);

  return (
    <div className="pointer-events-auto flex overflow-hidden rounded-lg border bg-background/95 shadow-sm">
      {shot ? (
        shot.sides.map((side, index) => (
          <SectionPane
            key={side.tooth}
            className={index > 0 ? "border-l" : undefined}
            tooth={side.tooth}
            image={side.image}
            mirrored={side.mirrored}
            halfMm={shot.halfMm}
            connector={connector}
            weak={weak}
            locked={locked}
            onShift={onShift}
          />
        ))
      ) : (
        <p className="px-4 py-6 text-xs text-muted-foreground">
          치아 위치를 잡는 중입니다.
          <br />
          양쪽 치아를 생성하면 단면이 보입니다.
        </p>
      )}
    </div>
  );
}

function SectionPane({
  className,
  tooth,
  image,
  mirrored,
  halfMm,
  connector,
  weak,
  locked,
  onShift,
}: {
  className?: string;
  tooth: string;
  image: string;
  mirrored: boolean;
  halfMm: number;
  connector: ToothDesignEdit["connector"];
  weak: boolean;
  locked: boolean;
  onShift: (shiftXMm: number, shiftYMm: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const sign = mirrored ? -1 : 1;
  const cx = sign * connector.shiftXMm;
  const cy = -connector.shiftYMm;
  const ticks: number[] = [];
  for (let mm = -Math.floor(halfMm / TICK_MM) * TICK_MM; mm <= halfMm; mm += TICK_MM) {
    ticks.push(Math.round(mm * 10) / 10);
  }

  const moveTo = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 * halfMm - halfMm;
    const y = ((clientY - rect.top) / Math.max(rect.height, 1)) * 2 * halfMm - halfMm;
    onShift(
      Math.round(clampConnectorShift(sign * x) * 10) / 10,
      Math.round(clampConnectorShift(-y) * 10) / 10,
    );
  };

  return (
    <div className={cn("relative", className)}>
      <span className="absolute right-2 top-1.5 z-10 text-sm font-semibold tabular-nums text-foreground">
        {tooth}
      </span>
      <img
        src={image}
        alt={`${tooth}번 인접면`}
        className="block h-48 w-48 select-none"
        draggable={false}
      />
      <svg
        ref={svgRef}
        viewBox={`${-halfMm} ${-halfMm} ${halfMm * 2} ${halfMm * 2}`}
        className={cn(
          "absolute inset-0 h-full w-full touch-none",
          locked ? "cursor-not-allowed" : "cursor-crosshair",
        )}
        onPointerDown={(event) => {
          if (locked || event.button !== 0) return;
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveTo(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          moveTo(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        aria-label={`${tooth}번 커넥터 위치`}
      >
        {ticks.map((mm) => (
          <g key={mm} className="text-slate-500">
            <line
              x1={mm}
              x2={mm}
              y1={halfMm}
              y2={halfMm - halfMm * 0.04}
              stroke="currentColor"
              strokeWidth={halfMm * 0.006}
            />
            <line
              x1={-halfMm}
              x2={-halfMm + halfMm * 0.04}
              y1={mm}
              y2={mm}
              stroke="currentColor"
              strokeWidth={halfMm * 0.006}
            />
            {mm !== 0 ? (
              <>
                <text
                  x={mm}
                  y={halfMm - halfMm * 0.06}
                  fontSize={halfMm * 0.07}
                  textAnchor="middle"
                  fill="currentColor"
                >
                  {sign * mm}
                </text>
                <text
                  x={-halfMm + halfMm * 0.06}
                  y={mm + halfMm * 0.025}
                  fontSize={halfMm * 0.07}
                  fill="currentColor"
                >
                  {-mm}
                </text>
              </>
            ) : null}
          </g>
        ))}
        {connector.linked ? (
          <>
            <polygon
              points={connectorOutline(connector.shape)
                .map(
                  ([x, y]) =>
                    `${cx + sign * x * connector.transverseMm},${cy - y * connector.verticalMm}`,
                )
                .join(" ")}
              fill={weak ? "rgba(219,51,46,0.12)" : "rgba(99,102,241,0.08)"}
              stroke={weak ? "rgb(219,51,46)" : "rgb(99,102,241)"}
              strokeWidth={halfMm * 0.012}
            />
            <circle
              cx={cx}
              cy={cy}
              r={halfMm * 0.03}
              fill="rgb(234,179,8)"
              stroke="rgb(22,101,52)"
              strokeWidth={halfMm * 0.008}
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}
