// 백엔드 작업 스캔 자동 정렬 잡용 Node 번들 엔트리. `npm run build:work-scan-align`.
// XML 파서(DOMParser)와 JPEG 디코더는 백엔드 워커가 넣는다.
// related files:
// - web/frontend/vite.work-scan-align.config.ts
// - web/backend/services/workScanAutoAlign.worker.js
export { alignWorkScansToBite } from "@/shared/practice/workScanAutoAlign";
export { setHpsJpegDecoder } from "@/shared/files/hpsDcmPreview";
