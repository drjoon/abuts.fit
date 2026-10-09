// related files:
// - web/backend/services/autoMachiningGate.service.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/utils/guideTour.util.js
// change-log:
// - 2026-10-09: 테스트 계정은 준비→가공·NC는 허용하고, 수동 가공 승인 전 자동가공만 보류.
// - 2026-10-09: 테스트치과·테스트기공소 의뢰는 제조 가공 대상이 아니다.
import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { isGuideTourAlwaysOnBusiness } from "./guideTour.util.js";

/**
 * 가공 보류 대상 테스트 사업체. 테스트기공소만 해당한다.
 * 테스트치과는 다른 의뢰인처럼 자동 승인 게이트를 탄다.
 */
export function isTestAccountBusinessName(name) {
  return (
    isGuideTourAlwaysOnBusiness(name) && String(name || "").trim() === "테스트기공소"
  );
}

function anchorIdOf(request) {
  const raw = request?.businessAnchorId;
  if (raw && typeof raw === "object") return String(raw._id || "").trim();
  return String(raw || "").trim();
}

/**
 * 의뢰 발신 사업체 또는 케이스 치과명이 테스트 계정이면 true.
 * businessName은 BusinessAnchor.name (호출부가 붙여 준다).
 */
export function isTestAccountMachiningRequestSync(request, businessName) {
  const names = [
    businessName,
    request?.requestorBusinessName,
    request?.business?.name,
    request?.businessAnchorId?.name,
    request?.caseInfos?.clinicName,
  ];
  return names.some((name) => isTestAccountBusinessName(name));
}

export async function loadRequestorBusinessNames(requests) {
  const ids = [];
  const seen = new Set();
  for (const request of requests || []) {
    const id = anchorIdOf(request);
    if (!id || seen.has(id) || !mongoose.Types.ObjectId.isValid(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  const map = new Map();
  if (!ids.length) return map;
  const rows = await BusinessAnchor.find({ _id: { $in: ids } })
    .select("name")
    .lean();
  for (const row of rows) map.set(String(row._id), String(row.name || "").trim());
  return map;
}

export async function isTestAccountMachiningRequest(request) {
  if (isTestAccountMachiningRequestSync(request)) return true;
  const id = anchorIdOf(request);
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return false;
  const anchor = await BusinessAnchor.findById(id).select("name").lean();
  return isTestAccountBusinessName(anchor?.name);
}

/** 작업자가 준비→가공을 직접 승인했는지. 자동 게이트(updatedBy 없음)는 승인이 아니다. */
export function hasManualMachiningApproval(request) {
  const at = request?.productionSchedule?.manualMachiningApprovedAt;
  if (at) {
    const t = new Date(at).getTime();
    if (Number.isFinite(t) && t > 0) return true;
  }
  const review = request?.caseInfos?.reviewByStage?.request;
  const status = String(review?.status || "").trim().toUpperCase();
  return status === "APPROVED" && Boolean(review?.updatedBy);
}

/** 테스트 계정이고 작업자 수동 승인이 없으면 자동 가공(auto-next) 대상이 아니다. */
export function isTestAccountAutoMachiningHeld(request, businessName) {
  if (!isTestAccountMachiningRequestSync(request, businessName)) return false;
  return !hasManualMachiningApproval(request);
}
