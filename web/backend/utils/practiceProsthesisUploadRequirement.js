import { isCooperationAssignee } from "./practiceTransferAutoMatchCore.js";

/** 필드가 없으면 요구함. 기존 치과·진행 중 건의 동작(보철 슬롯 완료)을 유지한다. */
export function readRequireLabProsthesisUpload(source) {
  if (!source || typeof source !== "object") return true;
  if (typeof source.requireLabProsthesisUpload === "boolean") {
    return source.requireLabProsthesisUpload;
  }
  const profile = source.practiceProfile;
  if (
    profile &&
    typeof profile === "object" &&
    typeof profile.requireLabProsthesisUpload === "boolean"
  ) {
    return profile.requireLabProsthesisUpload;
  }
  return true;
}

/**
 * 협력 기공소 의뢰만 치과 설정(billing 스냅샷)을 따른다.
 * 어벗츠기공본부 내부 처리·하청은 치과 설정과 관계없이 완성 보철 업로드가 필수다.
 * 아직 수행자가 없는 어벗츠 수임 건도 필수로 본다.
 */
export function isLabProsthesisUploadRequired(transfer) {
  if (!isCooperationAssignee(transfer)) return true;
  return readRequireLabProsthesisUpload(transfer?.billing);
}
