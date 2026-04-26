/**
 * useCncToolSlots.tsx
 *
 * CNC 공구 슬롯 메타데이터 + 가공 통계를 관리하는 훅.
 *
 * 주요 기능:
 *  1. GetToolSlots / GetToolStats 호출로 초기 데이터 로드
 *  2. BeginToolRemoval  — 공구 해제 요청 (mounted → removing)
 *  3. CompleteToolReplacement — 교체 완료 확인 (removing → mounted)
 *  4. UpdateToolSlotMeta — 공구 이름/타입/메모 수정
 *  5. 슬롯별 health level 산출 (useCount / configCount 기반 + replacementStatus)
 *  6. 가공 통계(machiningStats) 표시 헬퍼
 */
import { useCallback, useState } from "react";

// 공구 타입 레이블 맵
export const TOOL_TYPE_LABELS: Record<string, string> = {
  drill: "드릴",
  mill: "밀링",
  reamer: "리머",
  other: "기타",
};

export type ReplacementStatus = "mounted" | "removing" | "removed";

export interface ToolSlot {
  toolNum: number;
  toolName: string;
  toolType: "drill" | "mill" | "reamer" | "other";
  toolNote: string;
  replacementStatus: ReplacementStatus;
  removalRequestedAt: string | null;
  removalRequestedByName: string;
  lastReplacedAt: string | null;
  lastReplacedByName: string;
}

export interface DailyBucket {
  ymd: string;
  count: number;
  seconds: number;
}

export interface MachiningStatEntry {
  toolNum: number;
  totalJobCount: number;
  totalMachiningSeconds: number;
  currentJobCount: number;
  currentMachiningSeconds: number;
  lastJobAt: string | null;
  dailyBuckets: DailyBucket[];
}

interface UseCncToolSlotsParams {
  workUid: string;
  callRaw: (uid: string, dataType: string, payload?: any) => Promise<any>;
  ensureCncWriteAllowed: () => Promise<boolean>;
  setError: (msg: string | null) => void;
}

/** 초(second)를 "HH:MM" 또는 "M분 S초" 형식으로 변환 */
export function formatSeconds(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return "0초";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

export const useCncToolSlots = ({
  workUid,
  callRaw,
  ensureCncWriteAllowed,
  setError,
}: UseCncToolSlotsParams) => {
  const [toolSlots, setToolSlots] = useState<ToolSlot[]>([]);
  const [machiningStats, setMachiningStats] = useState<MachiningStatEntry[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  /** 슬롯 + 통계 데이터를 백엔드에서 불러온다 */
  const loadToolSlots = useCallback(async () => {
    if (!workUid) return;
    setLoading(true);
    try {
      const res = await callRaw(workUid, "GetToolSlots");
      const slots: ToolSlot[] = Array.isArray(res?.data?.toolSlots)
        ? res.data.toolSlots
        : [];
      const stats: MachiningStatEntry[] = Array.isArray(
        res?.data?.machiningStats,
      )
        ? res.data.machiningStats
        : [];
      setToolSlots(slots);
      setMachiningStats(stats);
    } catch (e: any) {
      setError(e?.message ?? "공구 슬롯 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [workUid, callRaw, setError]);

  /**
   * BeginToolRemoval — 공구 해제 요청.
   * 슬롯 상태를 removing으로 전환한다.
   * 이후 작업자는 장비에서 실제 공구를 물리적으로 제거하고,
   * CompleteToolReplacement로 교체 완료를 확인한다.
   */
  const beginToolRemoval = useCallback(
    async (toolNum: number) => {
      if (!workUid) return false;
      const ok = await ensureCncWriteAllowed();
      if (!ok) return false;
      try {
        const res = await callRaw(workUid, "BeginToolRemoval", { toolNum });
        const nextSlots: ToolSlot[] = Array.isArray(res?.data?.toolSlots)
          ? res.data.toolSlots
          : [];
        // 서버에서 내려준 슬롯으로 전체 갱신
        setToolSlots(nextSlots);
        return true;
      } catch (e: any) {
        setError(e?.message ?? "공구 해제 요청 중 오류가 발생했습니다.");
        return false;
      }
    },
    [workUid, callRaw, ensureCncWriteAllowed, setError],
  );

  /**
   * CompleteToolReplacement — 교체 완료 확인.
   * 슬롯 상태를 mounted로 전환하고, useCount를 0으로 리셋하며,
   * 현재 장착 이후 가공 통계(currentJobCount 등)를 리셋한다.
   *
   * @param payload.toolNum - 교체 완료한 슬롯 번호
   * @param payload.kind    - "normal" | "abnormal"
   * @param payload.note    - 교체 메모
   * @param payload.newConfigCount - 새 설정값 (null이면 기존 유지)
   * @param payload.toolName / toolType / toolNote - 공구 메타 업데이트 (선택)
   */
  const completeToolReplacement = useCallback(
    async (payload: {
      toolNum: number;
      kind?: "normal" | "abnormal";
      note?: string;
      newConfigCount?: number | null;
      predictedReplacementUseCount?: number;
      toolName?: string;
      toolType?: string;
      toolNote?: string;
    }) => {
      if (!workUid) return null;
      const ok = await ensureCncWriteAllowed();
      if (!ok) return null;
      try {
        const res = await callRaw(workUid, "CompleteToolReplacement", payload);
        const nextSlots: ToolSlot[] = Array.isArray(res?.data?.toolSlots)
          ? res.data.toolSlots
          : [];
        const nextStats: MachiningStatEntry[] = Array.isArray(
          res?.data?.machiningStats,
        )
          ? res.data.machiningStats
          : [];
        setToolSlots(nextSlots);
        setMachiningStats(nextStats);
        return res?.data ?? null;
      } catch (e: any) {
        setError(e?.message ?? "공구 교체 완료 처리 중 오류가 발생했습니다.");
        return null;
      }
    },
    [workUid, callRaw, ensureCncWriteAllowed, setError],
  );

  /**
   * addToolSlot — 신규 공구 슬롯 등록 (작업자가 처음 공구를 등록할 때).
   *
   * 1) UpdateToolLife: 해당 toolNum 행을 useCount=0, configCount=N으로 시드한다.
   * 2) UpdateToolSlotMeta: 공구 이름/타입/메모를 등록한다.
   * 3) loadToolSlots: 슬롯 목록을 다시 불러온다.
   * 4) (호출자가) GetToolLifeInfo로 toolLifeRows를 다시 로드해 모달을 갱신.
   *
   * @returns true 성공 / false 실패
   */
  const addToolSlot = useCallback(
    async (payload: {
      toolNum: number;
      toolName?: string;
      toolType?: string;
      toolNote?: string;
      configCount?: number;
    }) => {
      if (!workUid) return false;
      const ok = await ensureCncWriteAllowed();
      if (!ok) return false;
      try {
        const toolNum = Number(payload.toolNum);
        if (!Number.isFinite(toolNum) || toolNum < 1) {
          throw new Error("toolNum은 1 이상의 정수여야 합니다.");
        }
        const configCount = Math.max(0, Number(payload.configCount ?? 0) || 0);
        // 1) 공구 수명 행 시드 (mergeRowsByKey가 toolNum 기준 upsert)
        await callRaw(workUid, "UpdateToolLife", [
          {
            toolNum,
            useCount: 0,
            configCount,
            warningCount: 0,
            use: true,
          },
        ]);
        // 2) 슬롯 메타 등록 (toolName / toolType / toolNote)
        await callRaw(workUid, "UpdateToolSlotMeta", {
          toolNum,
          toolName: payload.toolName,
          toolType: payload.toolType,
          toolNote: payload.toolNote,
        });
        // 3) 슬롯 목록 재로드
        await loadToolSlots();
        return true;
      } catch (e: any) {
        setError(e?.message ?? "공구 등록 중 오류가 발생했습니다.");
        return false;
      }
    },
    [workUid, callRaw, ensureCncWriteAllowed, setError, loadToolSlots],
  );

  /**
   * UpdateToolSlotMeta — 교체 흐름 없이 공구 이름/타입/메모만 수정.
   */
  const updateToolSlotMeta = useCallback(
    async (payload: {
      toolNum: number;
      toolName?: string;
      toolType?: string;
      toolNote?: string;
    }) => {
      if (!workUid) return false;
      const ok = await ensureCncWriteAllowed();
      if (!ok) return false;
      try {
        const res = await callRaw(workUid, "UpdateToolSlotMeta", payload);
        const nextSlots: ToolSlot[] = Array.isArray(res?.data?.toolSlots)
          ? res.data.toolSlots
          : [];
        setToolSlots(nextSlots);
        return true;
      } catch (e: any) {
        setError(e?.message ?? "공구 메타 수정 중 오류가 발생했습니다.");
        return false;
      }
    },
    [workUid, callRaw, ensureCncWriteAllowed, setError],
  );

  /** toolNum에 해당하는 슬롯 반환 (없으면 null) */
  const getSlot = useCallback(
    (toolNum: number): ToolSlot | null =>
      toolSlots.find((s) => s.toolNum === toolNum) ?? null,
    [toolSlots],
  );

  /** toolNum에 해당하는 통계 반환 (없으면 null) */
  const getStats = useCallback(
    (toolNum: number): MachiningStatEntry | null =>
      machiningStats.find((s) => s.toolNum === toolNum) ?? null,
    [machiningStats],
  );

  /**
   * 슬롯의 교체 상태에 따른 배지 텍스트/색상 반환.
   * - removing: 해제 요청됨 (주황)
   * - removed:  장비에서 제거 완료 대기 (빨강)
   * - mounted:  정상 장착 (회색, 표시 없음)
   */
  const getReplacementBadge = useCallback((slot: ToolSlot | null) => {
    if (!slot) return null;
    if (slot.replacementStatus === "removing")
      return { label: "해제 요청됨", color: "amber" } as const;
    if (slot.replacementStatus === "removed")
      return { label: "교체 대기", color: "red" } as const;
    return null;
  }, []);

  return {
    toolSlots,
    machiningStats,
    loading,
    loadToolSlots,
    beginToolRemoval,
    completeToolReplacement,
    updateToolSlotMeta,
    addToolSlot,
    getSlot,
    getStats,
    getReplacementBadge,
  };
};
