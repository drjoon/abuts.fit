/**
 * STL 메타데이터 조회 및 재계산 훅
 * 백엔드 DB 캐시를 우선 사용하고, 필요시 재계산 트리거
 */

import { useState, useEffect } from "react";
import { request as api } from "@/shared/api/apiClient";

interface StlMetadata {
  maxDiameter?: number;
  connectionDiameter?: number;
  totalLength?: number;
  taperAngle?: number;
  tiltAxisVector?: { x: number; y: number; z: number } | null;
  frontPoint?: { x: number; y: number; z: number } | null;
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

    const fetchMetadata = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api({
          method: "GET",
          path: `/bg/stl-metadata/${requestId}`,
        });

        if (response.ok && response.data?.metadata) {
          setMetadata(response.data.metadata);
          setCached(response.data.cached || false);
        }
      } catch (err: any) {
        console.error("[useStlMetadata] Error fetching metadata:", err);
        setError(err.message || "Failed to fetch metadata");
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [requestId]);

  const recalculate = async () => {
    if (!requestId) return;

    setLoading(true);
    setError(null);

    try {
      await api({
        method: "POST",
        path: `/bg/recalculate-stl-metadata/${requestId}`,
      });

      // 재계산 트리거 후 잠시 대기 후 다시 조회
      setTimeout(async () => {
        try {
          const response = await api({
            method: "GET",
            path: `/bg/stl-metadata/${requestId}`,
          });

          if (response.ok && response.data?.metadata) {
            setMetadata(response.data.metadata);
            setCached(response.data.cached || false);
          }
        } catch (err) {
          console.error(
            "[useStlMetadata] Error refetching after recalculation:",
            err,
          );
        } finally {
          setLoading(false);
        }
      }, 2000);
    } catch (err: any) {
      console.error("[useStlMetadata] Error recalculating metadata:", err);
      setError(err.message || "Failed to recalculate metadata");
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
