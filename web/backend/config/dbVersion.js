/**
 * DB 버전 관리
 * 
 * 이 파일은 데이터베이스 스키마/데이터 버전을 관리합니다.
 * 
 * **중요**: DB 리셋 시 이 버전을 증가시켜야 합니다.
 * 
 * DB 버전이 변경되면 프론트엔드의 localStorage가 자동으로 초기화되어
 * 온보딩 진행 상태 등이 리셋됩니다.
 * 
 * @example
 * // DB 리셋 절차:
 * // 1. 이 파일의 DB_VERSION 값을 증가 (예: 1 → 2)
 * // 2. DB 리셋 스크립트 실행
 * // 3. 서버 재시작
 * 
 * @history
 * - 2026-03-31: 초기 버전 1 설정 (온보딩 localStorage 초기화 기능 추가)
 */

/**
 * 현재 DB 버전
 * 
 * DB 리셋 시 이 값을 증가시키세요.
 * 프론트엔드는 이 버전을 확인하여 localStorage 초기화 여부를 결정합니다.
 */
export const DB_VERSION = "2";

/**
 * DB 버전을 반환하는 헬퍼 함수
 * @returns {string} 현재 DB 버전
 */
export function getDbVersion() {
  return DB_VERSION;
}
