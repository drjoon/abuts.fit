// 기공소 AI 디자인 — 내면 파라미터 입력칸과 단면 그림. 프리셋 창과 내면 도구가 같이 쓴다.
// related files:
// - web/frontend/src/shared/practice/labDesignPresets.ts
// - web/frontend/src/shared/components/practice/LabDesignPresetDialog.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisModifyPanel.tsx

import { useEffect, useState } from "react";

import {
  clampInnerNumber,
  INNER_MATERIALS,
  methodMaterialLabel,
  type InnerField,
  type InnerMaterial,
  type InnerNumberKey,
} from "@/shared/practice/labDesignPresets";
import { cn } from "@/shared/ui/cn";

/** 설명 문장마다 줄을 바꾼다. */
export function HintLines({ text }: { text: string }) {
  const lines = text.split(/(?<=\.)\s+/).filter(Boolean);
  return (
    <>
      {lines.map((line, index) => (
        <span key={index}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </>
  );
}

function format(field: InnerField, value: number) {
  return value.toFixed(field.digits);
}

/** 숫자칸. 입력 중에는 친 글자를 두고, 숫자가 되면 범위 안으로 올린다. */
export function InnerNumberInput({
  field,
  value,
  disabled,
  onChange,
  onFocus,
  label,
}: {
  field: InnerField;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onFocus?: () => void;
  label: string;
}) {
  const [draft, setDraft] = useState(() => format(field, value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(format(field, value));
  }, [editing, field, value]);

  return (
    <label
      className={cn(
        "flex h-7 min-w-0 items-center rounded-md border bg-background pr-1.5 focus-within:ring-1 focus-within:ring-ring",
        disabled && "opacity-50",
      )}
    >
      <input
        type="number"
        inputMode="decimal"
        className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-right text-[11px] tabular-nums outline-none [appearance:textfield]"
        min={field.min}
        max={field.max}
        step={field.step}
        disabled={disabled}
        value={draft}
        aria-label={label}
        onFocus={() => {
          setEditing(true);
          onFocus?.();
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() !== "" && Number.isFinite(next)) {
            onChange(clampInnerNumber(field.key, next));
          }
        }}
      />
      <span className="shrink-0 text-[10px] text-muted-foreground">{field.unit}</span>
    </label>
  );
}

/** 가공 방식과 재료를 한 목록에서 고른다. 재료가 방식을 정한다. */
export function InnerMaterialSelect({
  value,
  onChange,
  label,
}: {
  value: InnerMaterial;
  onChange: (material: InnerMaterial) => void;
  label: string;
}) {
  return (
    <select
      className="h-7 w-full min-w-0 rounded-md border bg-background px-1 text-[11px]"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as InnerMaterial)}
    >
      {INNER_MATERIALS.map((row) => (
        <option key={row.id} value={row.id}>
          {methodMaterialLabel(row.id)}
        </option>
      ))}
    </select>
  );
}

const TONE = {
  die: "#cbd5e1",
  crown: "#e2e8f0",
  crownEdge: "#94a3b8",
  gap: "#7dd3fc",
  extra: "#2dd4bf",
  seal: "#facc15",
  mark: "#0284c7",
};

/**
 * 크라운 단면. 입력칸에 커서가 있으면 그 파라미터 자리를 진하게 칠한다.
 * 비율은 설명용이다.
 */
export function InnerParamsDiagram({ focus }: { focus: InnerNumberKey | null }) {
  const dim = (key: InnerNumberKey | InnerNumberKey[]) => {
    if (!focus) return 1;
    return (Array.isArray(key) ? key : [key]).includes(focus) ? 1 : 0.25;
  };
  const on = (key: InnerNumberKey) => focus === key;
  return (
    <svg viewBox="0 0 220 230" className="h-auto w-full" role="img" aria-label="내면 파라미터 단면">
      <g opacity={dim("toolRadiusMm")}>
        <rect x="18" y="14" width="46" height="18" rx="3" fill="#64748b" />
        <rect x="64" y="19" width="92" height="8" fill="#94a3b8" />
        <circle cx="160" cy="23" r="6" fill="none" stroke={TONE.mark} strokeWidth={on("toolRadiusMm") ? 2 : 1.2} />
        <text x="172" y="27" fontSize="10" fill={TONE.mark}>R</text>
      </g>

      <path
        d="M40 200 L40 118 Q40 62 110 58 Q180 62 180 118 L180 200 Z"
        fill={TONE.crown}
        stroke={TONE.crownEdge}
        opacity={dim(["minThicknessMm", "marginWidthMm", "marginAngleDeg"])}
      />
      <path
        d="M58 200 L60 124 Q62 84 110 80 Q158 84 160 124 L162 200 Z"
        fill={TONE.gap}
        opacity={dim(["cementGapMm", "sealGapMm", "sealHeightMm"])}
      />
      <path
        d="M78 104 Q110 92 142 104 L140 114 Q110 104 80 114 Z"
        fill={TONE.extra}
        opacity={dim("extraGapMm")}
      />
      <path
        d="M64 200 L66 128 Q68 92 110 88 Q152 92 154 128 L156 200 Z"
        fill={TONE.die}
        stroke="#94a3b8"
        strokeWidth="0.8"
      />
      <rect
        x="56"
        y="178"
        width="10"
        height="22"
        fill={TONE.seal}
        opacity={dim(["sealGapMm", "sealHeightMm"])}
      />
      <rect
        x="154"
        y="178"
        width="10"
        height="22"
        fill={TONE.seal}
        opacity={dim(["sealGapMm", "sealHeightMm"])}
      />
      {on("sealHeightMm") ? (
        <g stroke={TONE.mark} strokeWidth="1.2">
          <line x1="172" y1="178" x2="172" y2="200" />
          <line x1="168" y1="178" x2="176" y2="178" />
          <line x1="168" y1="200" x2="176" y2="200" />
        </g>
      ) : null}
      {on("minThicknessMm") ? (
        <line x1="110" y1="58" x2="110" y2="80" stroke={TONE.mark} strokeWidth="1.5" />
      ) : null}
      {on("marginWidthMm") || on("marginAngleDeg") ? (
        <g stroke={TONE.mark} strokeWidth="1.5" fill="none">
          <line x1="40" y1="203" x2="58" y2="203" />
          {on("marginAngleDeg") ? <path d="M40 186 A14 14 0 0 1 54 200" /> : null}
        </g>
      ) : null}
      <line x1="20" y1="200" x2="200" y2="200" stroke="#475569" strokeWidth="1" />

      <g fontSize="9" fill="#334155">
        <text x="112" y="140" textAnchor="middle">지대치</text>
        <text x="8" y="222">
          <tspan fill={TONE.gap}>■</tspan> 시멘트 갭
          <tspan dx="6" fill={TONE.extra}>■</tspan> 추가 갭
          <tspan dx="6" fill={TONE.seal}>■</tspan> 마진 실
        </text>
      </g>
    </svg>
  );
}
