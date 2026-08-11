// related files:
// - web/frontend/src/shared/hooks/useFilePreUpload.ts
// - web/frontend/rules.md
//
// 하위 호환 re-export. 신규 코드는 useFilePreUpload를 사용하세요.
export {
  useFilePreUpload,
  usePracticeFilePreUpload,
  toTempUploadFileKey,
  toPracticeUploadFileKey,
} from "@/shared/hooks/useFilePreUpload";
