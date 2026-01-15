import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

const RAW_READ_COOLDOWN_MS = 5000; // 서버 측 CONTROL_COOLDOWN_MS(5000ms)와 정렬
const RATE_LIMIT_BACKOFF_MS = 30000; // 429를 받은 후 추가로 쉬는 시간 (ms)

const lastRawReadCall: Record<string, number> = {};
const lastRateLimitUntil: Record<string, number> = {};

export const useCncRaw = () => {
  const { token } = useAuthStore();

  const callRaw = async (
    uid: string,
    dataType: string,
    payload: any = null
  ): Promise<any> => {
    const key = `${uid || ""}:${dataType}`;
    // 자동/배경 조회 계열 dataType 목록 (백엔드 callRawProxy/브리지 READ 타입과 동일하게 유지)
    // 모달에서 사용자가 직접 여는 조회(툴/프로그램 코드 편집 등)는 여기에 넣지 않는다.
    const READ_TYPES = [
      "GetOPStatus",
      "GetProgListInfo",
      "GetActivateProgInfo",
      "GetMotorTemperature",
      "GetToolLifeInfo",
      "GetProgDataInfo",
      "GetMachineList",
    ];

    // 자동 조회 계열인 경우에만 프론트 쿨다운 + rate limit backoff 적용
    if (READ_TYPES.includes(dataType)) {
      const now = Date.now();

      // 429를 최근에 받은 경우, backoff 기간 동안은 요청 자체를 보내지 않는다.
      const blockedUntil = lastRateLimitUntil[key] ?? 0;
      if (now < blockedUntil) {
        return {};
      }

      const last = lastRawReadCall[key] ?? 0;
      if (now - last < RAW_READ_COOLDOWN_MS) {
        // 3초 이내 중복 조회는 요청 자체를 보내지 않고 빈 객체 반환
        return {};
      }
      lastRawReadCall[key] = now;
    }

    const res = await apiFetch({
      path: `/api/machines/${encodeURIComponent(uid)}/raw`,
      method: "POST",
      token,
      jsonBody: { uid, dataType, payload },
    });

    const body = res.data ?? {};

    if (!res.ok || (body as any)?.success === false) {
      // 429(too many requests)인 경우에는 자동 조회 계열에만 backoff를 적용하고 조용히 무시한다.
      if (res.status === 429 && READ_TYPES.includes(dataType)) {
        const now = Date.now();
        lastRateLimitUntil[key] = now + RATE_LIMIT_BACKOFF_MS;
        return body;
      }

      const msg =
        (body as any)?.message ||
        (body as any)?.error ||
        `${dataType} 호출 실패 (HTTP ${res.status})`;
      throw new Error(msg);
    }
    return body ?? {};
  };

  return { callRaw };
};
