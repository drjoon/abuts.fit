// related files:
// - web/backend/controllers/admin/admin.dashboard.controller.js
// - web/backend/models/request.model.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-10-21: 확인(휴지통) 분리 — adminNewConnectionAcknowledgedAt.
// - 2026-10-21: 관리자 대시보드 신규 커넥션 요청 — 미제공 커넥션·신규 임플란트 의뢰와 연락처.
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";

const ITEM_LIMIT = 80;

const text = (value) => String(value || "").trim();

const NEW_CONNECTION_MATCH = {
  $or: [
    { "caseInfos.unsupportedConnection.label": { $nin: [null, ""] } },
    { "caseInfos.newSystemRequest.requested": true },
  ],
};

const NOT_ACKNOWLEDGED_MATCH = {
  $or: [
    { adminNewConnectionAcknowledgedAt: null },
    { adminNewConnectionAcknowledgedAt: { $exists: false } },
  ],
};

const REQUEST_SELECT = {
  requestId: 1,
  createdAt: 1,
  status: 1,
  manufacturerStage: 1,
  requestor: 1,
  businessAnchorId: 1,
  adminNewConnectionAcknowledgedAt: 1,
  "caseInfos.clinicName": 1,
  "caseInfos.patientName": 1,
  "caseInfos.tooth": 1,
  "caseInfos.memo": 1,
  "caseInfos.implantManufacturer": 1,
  "caseInfos.implantBrand": 1,
  "caseInfos.implantFamily": 1,
  "caseInfos.implantType": 1,
  "caseInfos.unsupportedConnection": 1,
  "caseInfos.newSystemRequest": 1,
  "caseInfos.file.originalName": 1,
};

const connectionLabelOf = (caseInfos) => {
  const unsupported = text(caseInfos?.unsupportedConnection?.label);
  if (unsupported) return unsupported;
  const nsr = caseInfos?.newSystemRequest;
  if (nsr?.requested) {
    return [nsr.manufacturer, nsr.brand, nsr.family]
      .map(text)
      .filter(Boolean)
      .join(" / ");
  }
  return [caseInfos?.implantManufacturer, caseInfos?.implantBrand, caseInfos?.implantFamily, caseInfos?.implantType]
    .map(text)
    .filter(Boolean)
    .join(" / ");
};

const mapDocToItem = (doc, userById, anchorById) => {
  const caseInfos = doc.caseInfos || {};
  const user = userById.get(String(doc.requestor || ""));
  const anchor = anchorById.get(String(doc.businessAnchorId || ""));
  const profile = user?.practiceProfile || {};
  const unsupported = text(caseInfos.unsupportedConnection?.label);
  return {
    id: String(doc._id),
    requestId: text(doc.requestId),
    createdAt: doc.createdAt || null,
    acknowledgedAt: doc.adminNewConnectionAcknowledgedAt || null,
    status: text(doc.status),
    manufacturerStage: text(doc.manufacturerStage),
    clinicName: text(caseInfos.clinicName),
    patientName: text(caseInfos.patientName),
    tooth: text(caseInfos.tooth),
    memo: text(caseInfos.memo),
    fileName: text(caseInfos.file?.originalName),
    connectionLabel: connectionLabelOf(caseInfos),
    source: unsupported ? "unsupported" : "new_implant",
    requesterName:
      text(user?.name) ||
      text(profile.staffName) ||
      text(profile.directorName),
    requesterPhone:
      text(user?.phoneNumber) ||
      text(profile.phone) ||
      text(user?.phone) ||
      text(profile.clinicPhone) ||
      text(anchor?.metadata?.phoneNumber),
    requesterEmail: text(user?.email) || text(anchor?.metadata?.email),
    businessName:
      text(anchor?.name) ||
      text(anchor?.metadata?.companyName) ||
      text(caseInfos.clinicName),
    businessPhone: text(anchor?.metadata?.phoneNumber) || text(profile.clinicPhone),
    representativeName: text(anchor?.metadata?.representativeName),
  };
};

async function enrichDocsToItems(docs) {
  const userIds = [
    ...new Set(
      docs
        .map((doc) => String(doc.requestor || ""))
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];
  const anchorIds = [
    ...new Set(
      docs
        .map((doc) => String(doc.businessAnchorId || ""))
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];

  const [users, anchors] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } })
          .select({
            name: 1,
            email: 1,
            phone: 1,
            phoneNumber: 1,
            "practiceProfile.phone": 1,
            "practiceProfile.clinicPhone": 1,
            "practiceProfile.staffName": 1,
            "practiceProfile.directorName": 1,
          })
          .lean()
      : [],
    anchorIds.length
      ? BusinessAnchor.find({ _id: { $in: anchorIds } })
          .select({
            name: 1,
            "metadata.companyName": 1,
            "metadata.phoneNumber": 1,
            "metadata.representativeName": 1,
            "metadata.email": 1,
          })
          .lean()
      : [],
  ]);

  const userById = new Map(users.map((user) => [String(user._id), user]));
  const anchorById = new Map(anchors.map((anchor) => [String(anchor._id), anchor]));

  return docs.map((doc) => mapDocToItem(doc, userById, anchorById));
}

/**
 * 기간 안의 미제공 커넥션·신규 임플란트 의뢰.
 * 관리자가 의뢰자에게 전화할 수 있도록 연락처와 의뢰 내용을 붙인다.
 * 확인한 건은 archivedItems(휴지통)로 분리한다.
 */
export async function buildNewConnectionRequestDashboardStats({ start, end }) {
  const [activeDocs, archivedDocs] = await Promise.all([
    Request.find({
      createdAt: { $gte: start, $lte: end },
      ...NEW_CONNECTION_MATCH,
      ...NOT_ACKNOWLEDGED_MATCH,
    })
      .select(REQUEST_SELECT)
      .sort({ createdAt: -1 })
      .limit(ITEM_LIMIT)
      .lean(),
    Request.find({
      ...NEW_CONNECTION_MATCH,
      adminNewConnectionAcknowledgedAt: { $ne: null },
    })
      .select(REQUEST_SELECT)
      .sort({ adminNewConnectionAcknowledgedAt: -1 })
      .limit(ITEM_LIMIT)
      .lean(),
  ]);

  const [items, archivedItems] = await Promise.all([
    enrichDocsToItems(activeDocs),
    enrichDocsToItems(archivedDocs),
  ]);

  return {
    total: items.length,
    items,
    archivedTotal: archivedItems.length,
    archivedItems,
  };
}
