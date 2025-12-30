import { useState } from "react";

import type { Machine } from "@/pages/manufacturer/cnc/types";
import { applyProgramNoToContent } from "../lib/programNaming";

interface UseCncProgramEditorParams {
  workUid: string;
  machines: Machine[];
  programSummary: { current?: any; list?: any[] } | null;
  callRaw: (uid: string, method: string, payload?: any) => Promise<any>;
  setError: (msg: string | null) => void;
  fetchProgramList: () => Promise<void>;
}

export const useCncProgramEditor = ({
  workUid,
  machines,
  programSummary,
  callRaw,
  setError,
  fetchProgramList,
}: UseCncProgramEditorParams) => {
  const [programEditorOpen, setProgramEditorOpen] = useState(false);
  const [programEditorTarget, setProgramEditorTarget] = useState<any | null>(
    null
  );
  const [isReadOnly, setIsReadOnly] = useState(false);

  const openProgramDetail = async (prog: any) => {
    if (!workUid || !prog) return;
    const activeMachine = machines.find((m) => m.uid === workUid) || null;
    const status = (activeMachine?.status || "").toUpperCase();
    const isRunning = ["RUN", "RUNNING", "ONLINE", "OK"].some((k) =>
      status.includes(k)
    );
    let readOnly = false;
    if (isRunning) {
      const current = programSummary?.current ?? null;
      const curNo = current?.programNo ?? current?.no;
      const progNo = prog?.programNo ?? prog?.no;
      // 생산 중일 때는 현재 생산중인 프로그램만 read-only로 열고,
      // 다음 생산(번호가 다른 프로그램)은 편집을 허용한다.
      if (curNo != null && progNo != null && curNo === progNo) {
        readOnly = true;
      }
    }
    setIsReadOnly(readOnly);
    setProgramEditorTarget(prog);
    setProgramEditorOpen(true);
  };

  const closeProgramEditor = () => {
    setProgramEditorOpen(false);
    setProgramEditorTarget(null);
  };

  const loadProgramCode = async (prog: any): Promise<string> => {
    if (!workUid || !prog) return "";
    // 브리지 서버에서 온 프로그램(source === "bridge")이고 programData가 이미 포함된 경우,
    // Hi-Link를 호출하지 않고 해당 내용을 그대로 사용한다.
    if (prog.source === "bridge" && typeof prog.programData === "string") {
      return prog.programData;
    }

    const programNo = prog.programNo ?? prog.no;
    if (programNo == null) return "";

    let headType = prog.headType ?? null;
    if (headType == null && Array.isArray(programSummary?.list)) {
      const found = programSummary!.list!.find((p: any) => {
        const no = p?.programNo ?? p?.no;
        if (no == null) return false;
        const a = Number(no);
        const b = Number(programNo);
        return Number.isFinite(a) && Number.isFinite(b) && a === b;
      });
      if (found && found.headType != null) {
        headType = found.headType;
      }
    }

    if (headType == null) headType = 0;

    const payload = { machineProgramData: { headType, programNo } };
    const res = await callRaw(workUid, "GetProgDataInfo", payload);
    const data: any = res?.data ?? res;
    const body = data?.machineProgramData ?? data;

    const raw = body?.programData ?? body?.program ?? body;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw.join("\n");
    return JSON.stringify(raw ?? {}, null, 2);
  };

  const saveProgramCode = async (
    prog: any,
    code: string,
    options?: {
      isNew?: boolean;
      nameOverride?: string;
      programNoOverride?: number;
      autoIncrementProgramNo?: boolean;
    }
  ): Promise<void> => {
    if (!workUid || !prog) return;

    const baseProgramNo = prog.programNo ?? prog.no;
    let programNo = options?.programNoOverride ?? baseProgramNo;

    // 번호 자동 증가 저장 모드: 현재 번호 또는 1부터 시작해서
    // programSummary.list에 없는 다음 번호를 찾는다.
    if (options?.autoIncrementProgramNo) {
      const used = new Set<number>();
      if (Array.isArray(programSummary?.list)) {
        for (const p of programSummary!.list as any[]) {
          const no = p?.programNo ?? p?.no;
          const n = Number(no);
          if (Number.isFinite(n) && n > 0) used.add(n);
        }
      }

      let start = Number(baseProgramNo);
      if (!Number.isFinite(start) || start <= 0) {
        start = used.size ? Math.max(...Array.from(used)) + 1 : 1;
      }

      let cand = start;
      // 안전 상한은 999999 정도로 두고, 사용 중인 번호를 건너뛴다.
      while (used.has(cand) && cand < 999999) {
        cand += 1;
      }
      programNo = cand;
    }

    if (programNo == null) return;

    let headType = prog.headType ?? null;
    if (headType == null && Array.isArray(programSummary?.list)) {
      const found = programSummary!.list!.find((p: any) => {
        const no = p?.programNo ?? p?.no;
        if (no == null) return false;
        const a = Number(no);
        const b = Number(programNo);
        return Number.isFinite(a) && Number.isFinite(b) && a === b;
      });
      if (found && found.headType != null) {
        headType = found.headType;
      }
    }

    if (headType == null) headType = 0;

    const normalizedCode = applyProgramNoToContent(programNo, code);

    const payload = {
      headType,
      programNo,
      programData: normalizedCode,
      isNew: options?.isNew ?? false,
    };

    const res = await callRaw(workUid, "UpdateProgram", payload);
    const ok = res && res.success !== false;
    if (!ok) {
      const msg =
        res?.message ||
        res?.error ||
        "프로그램 저장 실패 (Hi-Link UpdateProgram 응답 확인 필요)";
      throw new Error(msg);
    }

    // 저장 후 프로그램 리스트/워크보드를 재조회하여 상태를 최신으로 유지
    await fetchProgramList();
  };

  return {
    programEditorOpen,
    programEditorTarget,
    isReadOnly,
    openProgramDetail,
    closeProgramEditor,
    loadProgramCode,
    saveProgramCode,
  };
};
