// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/lotServerClient.ts
// - bg/pc2/lot-server/src/watch.js
// change-log:
// - 2026-11-26: lot-server 감시 폴링·라이브·AF·수동 OCR. 새 lot 은 onLot 콜백.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  focusLotServer,
  getLotWatch,
  lotLiveImageUrl,
  recognizeLotServer,
  startLotWatch,
  stopLotWatch,
  type LotWatchStatus,
} from "../lotServerClient";

const POLL_MS = 1000;

export function extractLotSuffix3(value: string | null | undefined) {
  const s = String(value || "").toUpperCase();
  const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
  return match ? match[0] : "";
}

export function useLotServerWatch({
  enabled = true,
  onLot,
}: {
  enabled?: boolean;
  onLot?: (lot: string, meta: { from: "auto" | "manual" }) => void;
}) {
  const [status, setStatus] = useState<LotWatchStatus | null>(null);
  const [liveUrl, setLiveUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reachable, setReachable] = useState(false);

  const onLotRef = useRef(onLot);
  onLotRef.current = onLot;
  const lastEmittedKeyRef = useRef("");
  const mountedRef = useRef(true);

  const refreshLive = useCallback(() => {
    setLiveUrl(lotLiveImageUrl(Date.now()));
  }, []);

  const applyStatus = useCallback((next: LotWatchStatus) => {
    if (!mountedRef.current) return;
    setStatus(next);
    setReachable(true);
    setError(String(next.lastError || "").trim());
    if (next.running && next.live !== false) {
      refreshLive();
    }
    const lot = extractLotSuffix3(
      String(next.lastLot || next.latest?.lot || ""),
    );
    if (!lot || !next.running) return;
    const fileName = String(next.latest?.fileName || "").trim();
    const key = fileName ? `${fileName}:${lot}` : lot;
    // 같은 인식 결과(파일·코드)는 한 번만 매칭
    if (key === lastEmittedKeyRef.current) return;
    lastEmittedKeyRef.current = key;
    onLotRef.current?.(lot, { from: "auto" });
  }, [refreshLive]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const next = await getLotWatch();
        if (cancelled) return;
        applyStatus(next);
      } catch {
        if (cancelled) return;
        setReachable(false);
        setStatus(null);
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => {
            void tick();
          }, POLL_MS);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [applyStatus, enabled]);

  const startWatch = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      lastEmittedKeyRef.current = "";
      const next = await startLotWatch();
      applyStatus(next);
      refreshLive();
    } catch (err) {
      setReachable(false);
      setError(err instanceof Error ? err.message : "감시 시작 실패");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [applyStatus, refreshLive]);

  const stopWatch = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const next = await stopLotWatch();
      applyStatus(next);
      setLiveUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "감시 중지 실패");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [applyStatus]);

  const runFocus = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await focusLotServer("whole");
      if (result.watch) applyStatus(result.watch);
      refreshLive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "초점 실패");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [applyStatus, refreshLive]);

  const runRecognize = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await recognizeLotServer();
      const lot = extractLotSuffix3(result.lot);
      if (lot) {
        lastEmittedKeyRef.current = `manual:${lot}:${Date.now()}`;
        onLotRef.current?.(lot, { from: "manual" });
      } else {
        setError(result.message || "코드를 읽지 못했습니다.");
      }
      try {
        const next = await getLotWatch();
        applyStatus(next);
      } catch {
        /* ignore */
      }
      return lot;
    } catch (err) {
      setError(err instanceof Error ? err.message : "인식 실패");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [applyStatus]);

  const resetLotDedupe = useCallback(() => {
    lastEmittedKeyRef.current = "";
  }, []);

  return {
    status,
    liveUrl,
    busy,
    error,
    reachable,
    running: Boolean(status?.running),
    phase: String(status?.phase || "idle"),
    lastLot: extractLotSuffix3(
      String(status?.lastLot || status?.latest?.lot || ""),
    ),
    startWatch,
    stopWatch,
    runFocus,
    runRecognize,
    refreshLive,
    resetLotDedupe,
  };
}
