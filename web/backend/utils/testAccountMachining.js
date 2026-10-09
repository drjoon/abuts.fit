// related files:
// - web/backend/services/autoMachiningGate.service.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/utils/guideTour.util.js
// change-log:
// - 2026-10-09: 테스트치과·테스트기공소 의뢰는 제조 가공 대상이 아니다.
import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { isGuideTourAlwaysOnBusiness } from "./guideTour.util.js";

/** 업로드·주문 테스트용 사업체. 제조 가공 대상이 아니다. */
export function isTestAccountBusinessName(name) {
  return isGuideTourAlwaysOnBusiness(name);
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
