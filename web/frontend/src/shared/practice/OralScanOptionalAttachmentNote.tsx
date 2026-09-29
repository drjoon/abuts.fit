import {
  ORAL_SCAN_OPTIONAL_NOTE_PRIMARY,
  ORAL_SCAN_OPTIONAL_NOTE_SECONDARY,
} from "@/shared/practice/oralScanRequirement";

// related files:
// - web/frontend/src/shared/practice/oralScanRequirement.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - .cursor/rules/practice-oral-scan-optional.mdc
// - 2026-09-29: 3D 스캔은 선택. 러버인상(석고모델)은 파일 없이 전송. 필수로 되돌리려면 사용자 재확인.

/** 신규의뢰 드롭존 안내. 3D 스캔은 선택 — 전송 조건이 아니다. */
export function OralScanOptionalAttachmentNote() {
  return (
    <>
      {ORAL_SCAN_OPTIONAL_NOTE_PRIMARY}
      <br />
      {ORAL_SCAN_OPTIONAL_NOTE_SECONDARY}
    </>
  );
}
