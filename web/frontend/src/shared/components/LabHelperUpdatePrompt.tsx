/**
 * 로그인·화면 진입 때 연결 프로그램 업데이트를 열지 않는다.
 * 폴더 저장(`useLabWorkFolderSave`)·알림 설정·채팅 입력이 `LabHelperUpdateDialog`를 연다.
 * related files:
 * - web/frontend/src/shared/components/LabHelperUpdateDialog.tsx
 * - web/frontend/src/shared/files/useLabWorkFolderSave.tsx
 * - web/frontend/src/shared/hooks/useLabHelperInstallPrompt.tsx
 * change-log:
 * - 2026-10-24: 로그인 자동 오픈 제거. 작업을 시작할 때 구버전이면 안내.
 */
export function LabHelperUpdatePrompt() {
  return null;
}
