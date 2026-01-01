/**
 * 간단한 메모리 기반 캐시 유틸리티
 * Redis 대신 사용 (프로덕션에서는 Redis 권장)
 */

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  /**
   * 캐시에 값 저장
   * @param {string} key - 캐시 키
   * @param {any} value - 저장할 값
   * @param {number} ttl - TTL (밀리초)
   */
  set(key, value, ttl = 5 * 60 * 1000) {
    // 기존 타이머 제거
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });

    // TTL 후 자동 삭제
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
    }, ttl);

    this.timers.set(key, timer);
  }

  /**
   * 캐시에서 값 조회
   * @param {string} key - 캐시 키
   * @returns {any|null} - 캐시된 값 또는 null
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // 만료 확인
    if (Date.now() > item.expiresAt) {
      this.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * 캐시에서 값 삭제
   * @param {string} key - 캐시 키
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    this.cache.delete(key);
  }

  /**
   * 패턴에 맞는 모든 키 삭제
   * @param {string} pattern - 삭제할 키 패턴 (예: "user:*")
   */
  deletePattern(pattern) {
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
    );
    const keysToDelete = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));
    return keysToDelete.length;
  }

  /**
   * 전체 캐시 삭제
   */
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.cache.clear();
    this.timers.clear();
  }

  /**
   * 캐시 통계
   */
  stats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * 캐시 또는 함수 실행 결과 반환
   * @param {string} key - 캐시 키
   * @param {Function} fn - 캐시 미스 시 실행할 함수
   * @param {number} ttl - TTL (밀리초)
   */
  async getOrSet(key, fn, ttl = 5 * 60 * 1000) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    this.set(key, value, ttl);
    return value;
  }
}

// 싱글톤 인스턴스
const cache = new MemoryCache();

export default cache;

/**
 * 캐시 키 생성 헬퍼
 */
export const CacheKeys = {
  // 배송 리드타임 (자주 변경되지 않음)
  deliveryLeadDays: () => "delivery:lead-days",

  // 직경별 통계 (사용자별, 5분 캐시)
  diameterStats: (userId, role) => `stats:diameter:${role}:${userId}`,

  // 대시보드 요약 (사용자별, 1분 캐시)
  dashboardSummary: (userId, period) => `dashboard:summary:${userId}:${period}`,

  // 가격/리퍼럴 통계 (사용자별, 5분 캐시)
  pricingStats: (userId) => `pricing:stats:${userId}`,

  // 채팅방 통계 (사용자별, 30초 캐시)
  chatRoomStats: (userId) => `chat:rooms:${userId}`,
};

/**
 * 캐시 TTL 상수
 */
export const CacheTTL = {
  SHORT: 30 * 1000, // 30초
  MEDIUM: 60 * 1000, // 1분
  LONG: 5 * 60 * 1000, // 5분
  VERY_LONG: 30 * 60 * 1000, // 30분
};
