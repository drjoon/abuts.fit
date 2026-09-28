// related files:
// - web/backend/services/abutmentStl/cuffBlend.service.js (proposeCuffRedesignForRequest → caseInfos.cuffProposal)
// - web/backend/controllers/requests/common.files.controller.js (cuff-proposal/accept·decline)
// - web/frontend/src/features/requests/components/RequestDetailDialog.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";

export type CuffProposalCurve = {
  angleDeg?: number | null;
  zA?: number | null;
  zTop?: number | null;
  finishLineZ?: number | null;
  before?: number[][] | null;
  after?: number[][] | null;
};

export type CuffProposal = {
  status?: "proposed" | "accepted" | "declined" | "applied-by-manufacturer" | string;
  maxCuffAngleDegBefore?: number | null;
  maxAngleDegAfter?: number | null;
  curve?: CuffProposalCurve | null;
  decidedAt?: string | null;
};

const W = 320;
const H = 300;
const PAD = 16;

/** 옆모습 곡선(가로 r, 세로 z, 같은 축척). 회색=현재, 파랑=제안. */
export function CuffProfileChart({ curve }: { curve: CuffProposalCurve }) {
  const before = (curve.before || []).filter((p) => p.length >= 2);
  const after = (curve.after || []).filter((p) => p.length >= 2);
  const pts = [...before, ...after];
  if (pts.length < 2) return null;
  const rMin = Math.min(...pts.map((p) => p[0]));
  const rMax = Math.max(...pts.map((p) => p[0]));
  const zMin = Math.min(...pts.map((p) => p[1]));
  const zMax = Math.max(...pts.map((p) => p[1]));
  const span = Math.max(rMax - rMin, zMax - zMin) || 1;
  const scale = (Math.min(W, H) - PAD * 2) / span;
  const x = (r: number) => PAD + (r - rMin) * scale;
  const y = (z: number) => H - PAD - (z - zMin) * scale;
  const path = (list: number[][]) =>
    list.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const hLine = (z: number | null | undefined, color: string) =>
    Number.isFinite(z) ? (
      <line x1={PAD} x2={W - PAD} y1={y(z as number)} y2={y(z as number)} stroke={color} strokeDasharray="4 4" strokeWidth={1} />
    ) : null;

  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[320px]" role="img" aria-label="커프 옆모습 곡선 비교">
        <rect x={0} y={0} width={W} height={H} fill="white" />
        {hLine(curve.zA, "#16a34a")}
        {hLine(curve.zTop, "#ea580c")}
        <path d={path(before)} fill="none" stroke="#a3a3a3" strokeWidth={3} strokeLinejoin="round" />
        <path d={path(after)} fill="none" stroke="#2563eb" strokeWidth={1.75} strokeLinejoin="round" />
      </svg>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-neutral-400" />
          현재 디자인
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-blue-600" />
          제안
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-4 border-t border-dashed border-green-600" />
          커넥션 상단
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-4 border-t border-dashed border-orange-600" />
          피니시라인 −0.2mm
        </span>
      </div>
    </div>
  );
}

type Props = {
  requestMongoId: string;
  proposal: CuffProposal;
  /** 수락/거절 후 서버가 돌려준 의뢰 문서 */
  onDecided: (request: any, decision: "accepted" | "declined") => void;
};

export function CuffProposalPanel({ requestMongoId, proposal, onDecided }: Props) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const before = Number(proposal.maxCuffAngleDegBefore);
  const after = Number(proposal.maxAngleDegAfter);

  const decide = async (decision: "accept" | "decline") => {
    if (busy) return;
    setBusy(decision);
    try {
      const res = await apiFetch<{ success?: boolean; message?: string; data?: { request?: any } }>({
        path: `/api/requests/${encodeURIComponent(requestMongoId)}/cuff-proposal/${decision}`,
        method: "POST",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "처리하지 못했습니다.");
      }
      onDecided(res.data.data?.request, decision === "accept" ? "accepted" : "declined");
      toast({
        title: decision === "accept" ? "커프 형상을 바꿨습니다" : "기존 디자인을 유지합니다",
        description: decision === "accept" ? "프리뷰에서 수정된 모델을 확인하세요." : undefined,
        duration: 3000,
      });
    } catch (err) {
      toast({
        title: "처리 실패",
        description: err instanceof Error ? err.message : "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-primary-muted bg-primary-soft/40 px-4 py-3.5">
      <div className="text-sm font-semibold tracking-tight text-primary-strong">커프 형상 수정 제안</div>
      <p className="text-sm leading-relaxed text-slate-700">
        피니시라인 아래 커프가
        {Number.isFinite(before) ? ` ${Math.round(before)}°까지` : ""} 누워 있어 가공 공구가 닿기 어렵습니다.
        <br />
        커넥션 위부터 피니시라인 아래 0.2mm까지만 부드러운 곡면으로 바꾸고, 피니시라인과 커넥션은 그대로 둡니다.
        {Number.isFinite(after) ? (
          <>
            <br />
            바꾼 뒤 가장 누운 곳은 {Math.round(after)}°입니다.
          </>
        ) : null}
      </p>
      {proposal.curve ? <CuffProfileChart curve={proposal.curve} /> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void decide("decline")}>
          {busy === "decline" ? "처리 중…" : "그대로 두기"}
        </Button>
        <Button size="sm" disabled={Boolean(busy)} onClick={() => void decide("accept")}>
          {busy === "accept" ? "바꾸는 중…" : "바꾸기"}
        </Button>
      </div>
    </div>
  );
}
