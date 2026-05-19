/**
 * STL 메타데이터 조회 및 재계산 훅
 * 백엔드 DB 캐시를 우선 사용하고, 필요시 재계산 트리거
 */

import { useState, useEffect } from "react";
import { request as api } from "@/shared/api/apiClient";
import { onAppEvent } from "@/shared/realtime/socket";

const RECALCULATE_POLL_INTERVAL_MS = 1000;
const RECALCULATE_POLL_MAX_ATTEMPTS = 20;

export interface StlMetadata {
  maxDiameter?: number;
  connectionDiameter?: number;
  totalLength?: number;
  updatedAt?: string | Date;
  l1?: number;
  l2?: number;
  taperAngle?: number;
  tiltAxisVector?: { x: number; y: number; z: number } | null;
  frontPoint?: { x: number; y: number; z: number } | null;
  taperGuide?: unknown;
}

function toRevisionValue(metadata: StlMetadata | null | undefined): string {
  if (!metadata) return "";
  return JSON.stringify({
    updatedAt: metadata.updatedAt ? String(metadata.updatedAt) : "",
    maxDiameter: metadata.maxDiameter ?? null,
    connectionDiameter: metadata.connectionDiameter ?? null,
    totalLength: metadata.totalLength ?? null,
    l1: metadata.l1 ?? null,
    l2: metadata.l2 ?? null,
    taperAngle: metadata.taperAngle ?? null,
  });
}

async function fetchStlMetadata(requestId: string): Promise<{
  metadata: StlMetadata | null;
  cached: boolean;
}> {
  const response = await api({
    method: "GET",
    path: `/bg/stl-metadata/${requestId}`,
  });

  const apiData = response.data as {
    data?: { metadata?: StlMetadata; cached?: boolean };
  };
  const actualData = apiData?.data;
  if (actualData?.metadata) {
    return {
      metadata: actualData.metadata,
      cached: Boolean(actualData.cached),
    };
  }

  return {
    metadata: null,
    cached: false,
  };
}

interface UseStlMetadataResult {
  metadata: StlMetadata | null;
  loading: boolean;
  cached: boolean;
  error: string | null;
  recalculate: () => Promise<void>;
}

export function useStlMetadata(requestId?: string): UseStlMetadataResult {
  const [metadata, setMetadata] = useState<StlMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) {
      setMetadata(null);
      setCached(false);
      return;
    }

    let cancelled = false;

    const fetchMetadata = async () => {
      setLoading(true);
      setError(null);

      try {
        const fetched = await fetchStlMetadata(requestId);
        if (cancelled) return;
        setMetadata(fetched.metadata);
        setCached(fetched.cached);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch metadata";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMetadata();

    const unsubscribe = onAppEvent((evt) => {
      const type = String(evt?.type || "").trim();
      if (type !== "request:stl-metadata-updated") return;

      const payload = evt?.data || {};
      const eventRequestId = String(payload?.requestId || "").trim();
      if (eventRequestId !== requestId) return;

      const eventMetadata = payload?.metadata;
      if (eventMetadata && typeof eventMetadata === "object") {
        setMetadata(eventMetadata as StlMetadata);
        setCached(true);
        setError(null);
      } else {
        void fetchMetadata();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [requestId]);

  const recalculate = async () => {
    if (!requestId) return;

    const beforeRevision = toRevisionValue(metadata);
    setLoading(true);
    setError(null);

    try {
      await api({
        method: "POST",
        path: `/bg/recalculate-stl-metadata/${requestId}`,
      });

      let updated = false;
      for (
        let attempt = 0;
        attempt < RECALCULATE_POLL_MAX_ATTEMPTS;
        attempt += 1
      ) {
        if (attempt > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, RECALCULATE_POLL_INTERVAL_MS),
          );
        }

        const fetched = await fetchStlMetadata(requestId);
        setMetadata(fetched.metadata);
        setCached(fetched.cached);

        const nextRevision = toRevisionValue(fetched.metadata);
        if (!beforeRevision) {
          if (nextRevision) {
            updated = true;
            break;
          }
          continue;
        }

        if (nextRevision && nextRevision !== beforeRevision) {
          updated = true;
          break;
        }
      }

      if (!updated) {
        throw new Error(
          "메타데이터 재계산이 아직 반영되지 않았습니다. 잠시 후 다시 시도해주세요.",
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to recalculate metadata";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    metadata,
    loading,
    cached,
    error,
    recalculate,
  };
}
