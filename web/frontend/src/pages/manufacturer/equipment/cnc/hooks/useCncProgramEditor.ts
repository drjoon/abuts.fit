import { useRef, useState } from "react";

import type { Machine } from "@/pages/manufacturer/equipment/cnc/types";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { getFileBlob, setFileBlob } from "@/shared/files/fileBlobCache";

const REQUEST_ID_REGEX = /(\d{8}-[A-Z0-9]{6,10})/i;

const extractRequestIdFromPath = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const str = String(raw).trim();
  if (!str) return "";
  const match = str.match(REQUEST_ID_REGEX);
  if (match && match[1]) return match[1].toUpperCase();
  return "";
};

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
  const { token } = useAuthStore();
  const [programEditorOpen, setProgramEditorOpen] = useState(false);
  const [programEditorTarget, setProgramEditorTarget] = useState<any | null>(
    null,
  );
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [editorMachineId, setEditorMachineId] = useState<string | null>(null);
  const programOverridesRef = useRef<Record<string, string>>({});

  const getProgramOverrideKey = (prog: any) => {
    if (!prog) return null;
    const jobId = prog?.jobId ?? prog?.id;
    if (jobId) return `job:${jobId}`;
    const s3Key = String(prog?.s3Key || "").trim();
    if (s3Key) return `s3:${s3Key}`;
    const programId = prog?.programId ?? prog?._id ?? prog?.id;
    if (programId) return `id:${programId}`;
    const programNo = prog?.programNo ?? prog?.no;
    if (programNo != null) return `no:${programNo}`;
    return null;
  };

  const openProgramDetail = async (prog: any, machineId?: string) => {
    const mid = String(machineId || "").trim() || workUid;
    if (!mid || !prog) return;

    // 에디터는 클릭된 장비 기준으로 동작한다.
    setEditorMachineId(mid);

    // readOnly 판단은 기본적으로 '현재 선택(workUid) 장비' 기준으로만 정확하다.
    // 다른 장비를 열 때는 안전하게 편집 허용(=readOnly=false)로 둔다.
    if (mid !== workUid) {
      setIsReadOnly(false);
      setProgramEditorTarget(prog);
      setProgramEditorOpen(true);
      return;
    }

    const activeMachine = machines.find((m) => m.uid === workUid) || null;
    const status = (activeMachine?.status || "").toUpperCase();
    const isRunning = ["RUN", "RUNNING", "ONLINE", "OK"].some((k) =>
      status.includes(k),
    );
    let readOnly = false;
    if (isRunning) {
      readOnly = true;
    }
    setIsReadOnly(readOnly);
    setProgramEditorTarget(prog);
    setProgramEditorOpen(true);
  };

  const closeProgramEditor = () => {
    setProgramEditorOpen(false);
    setProgramEditorTarget(null);
    setEditorMachineId(null);
  };

  const loadProgramCode = async (prog: any): Promise<string> => {
    const mid = editorMachineId || workUid;
    if (!mid || !prog) return "";

    const overrideKey = getProgramOverrideKey(prog);
    if (overrideKey) {
      const cached = programOverridesRef.current[overrideKey];
      if (typeof cached === "string") {
        return cached;
      }
    }

    const s3Key = String(prog?.s3Key || "").trim();
    if (s3Key && token) {
      const cacheKey = `cnc:s3:${s3Key}`;
      try {
        const cachedBlob = await getFileBlob(cacheKey);
        if (cachedBlob) {
          const cachedText = await cachedBlob.text();
          if (cachedText != null) return cachedText;
        }
      } catch {
        // no-op
      }

      const presignRes = await apiFetch({
        path: `/api/cnc-machines/${encodeURIComponent(mid)}/direct/presign-download?s3Key=${encodeURIComponent(
          s3Key,
        )}`,
        method: "GET",
        token,
      });
      const presignBody: any = presignRes.data ?? {};
      const presignData = presignBody?.data ?? presignBody;
      if (!presignRes.ok || presignBody?.success === false) {
        throw new Error(
          presignBody?.message || presignBody?.error || "다운로드 presign 실패",
        );
      }

      const downloadUrl = String(presignData?.downloadUrl || "").trim();
      if (!downloadUrl) {
        throw new Error("다운로드 URL이 올바르지 않습니다.");
      }

      const resp = await fetch(downloadUrl, { method: "GET" });
      if (!resp.ok) {
        throw new Error(`S3 다운로드 실패 (HTTP ${resp.status})`);
      }
      const text = await resp.text();
      try {
        await setFileBlob(cacheKey, new Blob([text], { type: "text/plain" }));
      } catch {
        // no-op
      }
      return text;
    }

    const bridgePath = String(
      prog?.bridgePath || prog?.bridge_store_path || prog?.path || "",
    ).trim();
    const storeScope = String((prog as any)?.storeScope || "").trim();
    const explicitRequestId = String(prog?.requestId || "").trim();
    const derivedRequestId = !explicitRequestId
      ? extractRequestIdFromPath(bridgePath)
      : "";
    const normalizedRequestId = (explicitRequestId || derivedRequestId).trim();
    if (bridgePath) {
      const loadBridgeOnce = async (
        pathOverride?: string,
      ): Promise<{
        ok: boolean;
        status: number;
        body: any;
      }> => {
        const targetPath = String(pathOverride || bridgePath || "").trim();
        const url = `/api/bridge-store/file?path=${encodeURIComponent(
          targetPath,
        )}&_ts=${Date.now()}`;
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        const body: any = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, body };
      };

      const first = await loadBridgeOnce();
      const firstText = first?.body?.content;
      if (first.ok && typeof firstText === "string") return firstText;

      const requestId = normalizedRequestId;
      if (requestId && token) {
        const ensured = await apiFetch({
          path: `/api/requests/by-request/${encodeURIComponent(
            requestId,
          )}/nc-file/ensure-bridge`,
          method: "POST",
          token,
          jsonBody: {
            bridgePath,
            ...(storeScope ? { storeScope } : {}),
          },
        });

        const ensuredBody: any = ensured.data ?? {};
        const nextPath = String(
          ensuredBody?.data?.bridgePath || ensuredBody?.data?.filePath || "",
        ).trim();

        const second = await loadBridgeOnce(nextPath || bridgePath);
        const secondText = second?.body?.content;
        if (second.ok && typeof secondText === "string") return secondText;

        throw new Error(
          second?.body?.message ||
            second?.body?.error ||
            first?.body?.message ||
            first?.body?.error ||
            "브리지 파일 로드 실패",
        );
      }

      throw new Error(
        first?.body?.message || first?.body?.error || "브리지 파일 로드 실패",
      );
    }

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

    if (headType == null) headType = 1;

    const payload = { machineProgramData: { headType, programNo } };
    const res = await callRaw(mid, "GetProgDataInfo", payload);
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
    },
  ): Promise<void> => {
    const mid = editorMachineId || workUid;
    if (!mid || !prog) return;

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

    if (headType == null) headType = 1;

    const s3Key = String(prog?.s3Key || "").trim();
    const explicitRequestId = String(prog?.requestId || "").trim();
    const bridgePath = String(
      prog?.bridgePath || prog?.bridge_store_path || prog?.path || "",
    ).trim();
    const storeScope = String((prog as any)?.storeScope || "").trim();
    const derivedRequestId = !explicitRequestId
      ? extractRequestIdFromPath(bridgePath)
      : "";
    const requestId = (explicitRequestId || derivedRequestId).trim();
    const normalizedCode = String(code ?? "");
    const overrideKey = getProgramOverrideKey(prog);

    const isJobProgram = !!(requestId || bridgePath || s3Key);

    // storage/3-nc (bridge-store) 를 SSOT으로 사용한다 (의뢰/작업 프로그램만).
    // - bridgePath가 있으면: bridge-store에만 저장
    // - bridgePath가 없으면: S3 → bridge-store 복구(ensure-bridge) 후 bridge-store에 저장
    // NOTE: SSOT 모드에서는 UpdateProgram(Hi-Link)로 장비에 직접 쓰지 않는다.
    if (isJobProgram) {
      let resolvedBridgePath = bridgePath;
      if (!resolvedBridgePath && requestId && s3Key && token) {
        const ensureRes = await fetch(
          `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/ensure-bridge`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              bridgePath: "",
              ...(storeScope ? { storeScope } : {}),
            }),
          },
        );
        const ensureBody: any = await ensureRes.json().catch(() => ({}));
        if (!ensureRes.ok || ensureBody?.success === false) {
          throw new Error(
            ensureBody?.message || ensureBody?.error || "NC 파일 복구 실패",
          );
        }
        resolvedBridgePath = String(
          ensureBody?.data?.bridgePath || ensureBody?.data?.filePath || "",
        ).trim();
      }

      if (!resolvedBridgePath) {
        throw new Error(
          "브리지 저장 경로를 찾을 수 없습니다. (storage/3-nc 복구 필요)",
        );
      }

      const res = await fetch("/api/bridge-store/file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          path: resolvedBridgePath,
          content: normalizedCode,
        }),
      });
      if (!res.ok) {
        throw new Error("브리지 서버 저장 실패");
      }
    }

    if (!isJobProgram && programNo != null) {
      const payload = {
        headType,
        programNo,
        programData: normalizedCode,
        isNew: options?.isNew ?? false,
      };

      const res = await callRaw(mid, "UpdateProgram", payload);
      const ok = res && res.success !== false;
      if (!ok) {
        const msg =
          res?.message ||
          res?.error ||
          "프로그램 저장 실패 (Hi-Link UpdateProgram 응답 확인 필요)";
        throw new Error(msg);
      }
    }

    if (overrideKey) {
      programOverridesRef.current[overrideKey] = normalizedCode;
    }

    if (s3Key) {
      const cacheKey = `cnc:s3:${s3Key}`;
      try {
        await setFileBlob(
          cacheKey,
          new Blob([normalizedCode], { type: "text/plain" }),
        );
      } catch {
        // no-op
      }
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
