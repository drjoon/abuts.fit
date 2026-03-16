/**
 * STL 메타데이터 조회 및 재계산 훅
 * 백엔드 DB 캐시를 우선 사용하고, 필요시 재계산 트리거
 */

import { useState, useEffect } from "react";
import { request as api } from "@/shared/api/apiClient";

export interface StlMetadata {
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

        // apiFetch 반환 구조: { ok, status, data, raw }
        // data 구조: { statusCode, data: { requestId, metadata, cached }, message, success }
        const apiData = response.data;
        const actualData = apiData?.data;

        if (actualData?.metadata) {
          setMetadata(actualData.metadata);
          setCached(actualData.cached || false);
        } else {
          setMetadata(null);
          setCached(false);
        }
      } catch (err: any) {
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

          const apiData = response.data;
          const actualData = apiData?.data;
          if (actualData?.metadata) {
            setMetadata(actualData.metadata);
            setCached(actualData.cached || false);
          }
        } catch (err) {
          setError(err.message || "Failed to refetch metadata");
        } finally {
          setLoading(false);
        }
      }, 2000);
    } catch (err: any) {
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
