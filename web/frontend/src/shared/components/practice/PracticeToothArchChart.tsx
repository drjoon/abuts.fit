import { cn } from "@/shared/ui/cn";

// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts

/** FDI dentist-view: patient's right on the left of the chart */
export const UPPER_ARCH_TEETH = [
  "18",
  "17",
  "16",
  "15",
  "14",
  "13",
  "12",
  "11",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
] as const;

export const LOWER_ARCH_TEETH = [
  "48",
  "47",
  "46",
  "45",
  "44",
  "43",
  "42",
  "41",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
] as const;

type ArchMode = "upper" | "lower";

type ToothGeom = {
  id: string;
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
};

export type ArchToothVisual = {
  prosthesisType?: string;
  bridgeLinkedTeeth?: readonly string[];
};

const toothWidthFor = (fdi: string) => {
  const ones = Number(fdi[1]);
  if (ones >= 6) return 22;
  if (ones >= 4) return 17;
  if (ones === 3) return 15;
  return 13;
};

const toothHeightFor = (fdi: string) => {
  const ones = Number(fdi[1]);
  if (ones >= 6) return 28;
  if (ones >= 4) return 26;
  return 24;
};

/** Place 16 teeth along an open-mouth arch (∩ upper / ∪ lower). */
const buildArchGeometry = (
  teeth: readonly string[],
  mode: ArchMode,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): ToothGeom[] => {
  const n = teeth.length;
  return teeth.map((id, index) => {
    const t = Math.PI - (index / (n - 1)) * Math.PI;
    const x = cx + rx * Math.cos(t);
    const y = mode === "upper" ? cy + ry * Math.sin(t) : cy - ry * Math.sin(t);
    const dx = -rx * Math.sin(t);
    const dy = mode === "upper" ? ry * Math.cos(t) : -ry * Math.cos(t);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      id,
      x,
      y,
      angle,
      width: toothWidthFor(id),
      height: toothHeightFor(id),
    };
  });
};

const UPPER_GEOM = buildArchGeometry(UPPER_ARCH_TEETH, "upper", 280, 78, 248, 58);
const LOWER_GEOM = buildArchGeometry(LOWER_ARCH_TEETH, "lower", 280, 212, 248, 58);
const GEOM_BY_ID = new Map<string, ToothGeom>(
  [...UPPER_GEOM, ...LOWER_GEOM].map((tooth) => [tooth.id, tooth]),
);

/** Simple tooth silhouette: crown toward mouth opening (+y in local space). */
const toothPath = (w: number, h: number) => {
  const hw = w / 2;
  const hh = h / 2;
  const neck = w * 0.32;
  return [
    `M ${-hw * 0.92} ${-hh}`,
    `Q ${-hw} ${-hh * 0.35} ${-neck} ${hh * 0.15}`,
    `Q ${-hw * 0.55} ${hh} 0 ${hh}`,
    `Q ${hw * 0.55} ${hh} ${neck} ${hh * 0.15}`,
    `Q ${hw} ${-hh * 0.35} ${hw * 0.92} ${-hh}`,
    `Q 0 ${-hh * 0.72} ${-hw * 0.92} ${-hh}`,
    "Z",
  ].join(" ");
};

const TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  크라운: { fill: "#38bdf8", stroke: "#0369a1" },
  브리지: { fill: "#34d399", stroke: "#047857" },
  Pontic: { fill: "#a3e635", stroke: "#4d7c0f" },
  인레이: { fill: "#c4b5fd", stroke: "#6d28d9" },
};

const colorForType = (prosthesisType?: string) => {
  const key = String(prosthesisType || "").trim();
  return TYPE_COLORS[key] || { fill: "#0ea5e9", stroke: "#0369a1" };
};

export type PracticeToothArchChartProps = {
  selectedTeeth: ReadonlySet<string> | readonly string[];
  onToggleTooth: (toothNumber: string) => void;
  /** Optional visuals for selected teeth (type tint + bridge connectors) */
  toothVisuals?: ReadonlyMap<string, ArchToothVisual> | Record<string, ArchToothVisual>;
  className?: string;
};

export function PracticeToothArchChart({
  selectedTeeth,
  onToggleTooth,
  toothVisuals,
  className,
}: PracticeToothArchChartProps) {
  const selected =
    selectedTeeth instanceof Set
      ? selectedTeeth
      : new Set(
          Array.from(selectedTeeth)
            .map((v) => String(v || "").trim())
            .filter((v) => /^[1-4][1-8]$/.test(v)),
        );

  const visuals =
    toothVisuals instanceof Map
      ? toothVisuals
      : new Map(Object.entries(toothVisuals || {}));

  const bridgeSegments: Array<{ a: string; b: string }> = [];
  const seen = new Set<string>();
  for (const [tooth, visual] of visuals) {
    const links = Array.isArray(visual.bridgeLinkedTeeth) ? visual.bridgeLinkedTeeth : [];
    for (const linked of links) {
      if (!selected.has(tooth) || !selected.has(linked)) continue;
      const key = [tooth, linked].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      bridgeSegments.push({ a: tooth, b: linked });
    }
  }

  const renderTooth = (tooth: ToothGeom, mode: ArchMode) => {
    const isSelected = selected.has(tooth.id);
    const visual = visuals.get(tooth.id);
    const colors = isSelected ? colorForType(visual?.prosthesisType) : null;
    // Lower arch: flip local Y so crown points toward the mouth opening (up)
    const flip = mode === "lower" ? " scale(1,-1)" : "";

    return (
      <g
        key={tooth.id}
        transform={`translate(${tooth.x} ${tooth.y})`}
        className="cursor-pointer"
        onClick={() => onToggleTooth(tooth.id)}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`치아 ${tooth.id}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleTooth(tooth.id);
          }
        }}
      >
        <title>
          {tooth.id}
          {visual?.prosthesisType ? ` · ${visual.prosthesisType}` : ""}
        </title>
        <g transform={`rotate(${tooth.angle})${flip}`}>
          <path
            d={toothPath(tooth.width, tooth.height)}
            fill={colors ? colors.fill : "#ffffff"}
            stroke={colors ? colors.stroke : "#94a3b8"}
            strokeWidth={1.4}
          />
        </g>
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={isSelected ? "#ffffff" : "#334155"}
          fontSize={10}
          fontWeight={600}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {tooth.id}
        </text>
      </g>
    );
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/80 via-white to-sky-50/40 px-2 py-2",
        className,
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
        <span>상악 ∩ · 하악 ∪</span>
        <span className="text-slate-400">치아를 눌러 선택 · FDI</span>
      </div>
      <svg
        viewBox="0 0 560 290"
        className="mx-auto h-auto w-full max-w-[36rem]"
        role="img"
        aria-label="치아 아치 선택 차트"
      >
        {/* soft gum / arch guides */}
        <path
          d="M 32 78 Q 280 168 528 78"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={18}
          strokeLinecap="round"
        />
        <path
          d="M 32 212 Q 280 122 528 212"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={18}
          strokeLinecap="round"
        />

        {/* midline */}
        <line
          x1={280}
          y1={28}
          x2={280}
          y2={262}
          stroke="#cbd5e1"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <text x={268} y={22} textAnchor="end" fill="#94a3b8" fontSize={9}>
          R
        </text>
        <text x={292} y={22} textAnchor="start" fill="#94a3b8" fontSize={9}>
          L
        </text>

        <text x={280} y={148} textAnchor="middle" fill="#94a3b8" fontSize={10}>
          입을 벌린 형태
        </text>

        {bridgeSegments.map(({ a, b }) => {
          const ga = GEOM_BY_ID.get(a);
          const gb = GEOM_BY_ID.get(b);
          if (!ga || !gb) return null;
          return (
            <line
              key={`${a}-${b}`}
              x1={ga.x}
              y1={ga.y}
              x2={gb.x}
              y2={gb.y}
              stroke="#b45309"
              strokeWidth={5}
              strokeLinecap="round"
              opacity={0.85}
            />
          );
        })}

        {UPPER_GEOM.map((tooth) => renderTooth(tooth, "upper"))}
        {LOWER_GEOM.map((tooth) => renderTooth(tooth, "lower"))}
      </svg>
    </div>
  );
}
