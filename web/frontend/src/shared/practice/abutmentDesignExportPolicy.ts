// 어벗 디자인 STL 다운로드 정책.
// 어벗츠 플랫폼이 만든 생산 STL·프리뷰는 폴더 열기·다운로드로 내보내지 않는다.
// 기공소가 업로드한 수작업 STL은 받는다.
// SSOT 키 판별은 백엔드 abutmentDesignRoute.js 와 같다.

/** 플랫폼 프리뷰(디자인 모달) STL. */
export function isPlatformAbutmentPreviewS3Key(s3Key: string | null | undefined): boolean {
  return String(s3Key || "").includes("/custom-abutment-preview/");
}

/** 플랫폼 확정 후 생산으로 넘긴 STL (`requests/.../1-stl/platform/...`). */
export function isPlatformAbutmentProductionS3Key(s3Key: string | null | undefined): boolean {
  return String(s3Key || "").includes("/1-stl/platform/");
}

/** 치과·기공소가 내려받으면 안 되는 어벗츠 플랫폼 어벗 STL. */
export function isPlatformAbutmentDesignExportBlocked(
  s3Key: string | null | undefined,
): boolean {
  return isPlatformAbutmentPreviewS3Key(s3Key) || isPlatformAbutmentProductionS3Key(s3Key);
}

export function filterExportableAbutmentDesignFiles<T extends { s3Key?: string | null }>(
  files: readonly T[] | null | undefined,
): T[] {
  return (Array.isArray(files) ? files : []).filter(
    (file) => !isPlatformAbutmentDesignExportBlocked(file?.s3Key),
  );
}
