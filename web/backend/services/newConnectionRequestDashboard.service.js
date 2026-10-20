// related files:
// - web/backend/controllers/admin/admin.dashboard.controller.js
// - web/backend/models/request.model.js
// - web/backend/services/newConnectionImplantGroup.service.js
// change-log:
// - 2026-10-21: 제조사·브랜드 묶음 + 진행 상태(읽음·개발중·개발완료).
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  buildGroupLookupMaps,
  buildImplantGroupKey,
  ensureNewConnectionImplantGroup,
  extractNewConnectionImplantPair,
  loadAllNewConnectionImplantGroups,
  mapGroupToWorkflowDto,
  resolveGroupKeyForPair,
} from "./newConnectionImplantGroup.service.js";

const ITEM_LIMIT = 200;

const text = (value) => String(value || "").trim();

const NEW_CONNECTION_MATCH = {
  $or: [
    { "caseInfos.unsupportedConnection.label": { $nin: [null, ""] } },
    { "caseInfos.newSystemRequest.requested": true },
  ],
};

const REQUEST_SELECT = {
  requestId: 1,
  createdAt: 1,
  status: 1,
  manufacturerStage: 1,
  requestor: 1,
  businessAnchorId: 1,
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

const connectionLabelOf = (caseInfos, pair) => {
  const unsupported = text(caseInfos?.unsupportedConnection?.label);
  if (unsupported) return unsupported;
  const nsr = caseInfos?.newSystemRequest;
  if (nsr?.requested) {
    return [nsr.manufacturer, nsr.brand, nsr.family]
      .map(text)
      .filter(Boolean)
      .join(" / ");
  }
  if (pair) {
    return [pair.manufacturer, pair.brand, pair.family, pair.implantType]
      .map(text)
      .filter(Boolean)
      .join(" / ");
  }
  return [caseInfos?.implantManufacturer, caseInfos?.implantBrand, caseInfos?.implantFamily, caseInfos?.implantType]
    .map(text)
    .filter(Boolean)
    .join(" / ");
};

const mapDocToItem = (doc, userById, anchorById, groupKey) => {
  const caseInfos = doc.caseInfos || {};
  const pair = extractNewConnectionImplantPair(caseInfos);
  const user = userById.get(String(doc.requestor || ""));
  const anchor = anchorById.get(String(doc.businessAnchorId || ""));
  const profile = user?.practiceProfile || {};
  const unsupported = text(caseInfos.unsupportedConnection?.label);
  return {
    id: String(doc._id),
    requestId: text(doc.requestId),
    createdAt: doc.createdAt || null,
    status: text(doc.status),
    manufacturerStage: text(doc.manufacturerStage),
    clinicName: text(caseInfos.clinicName),
    patientName: text(caseInfos.patientName),
    tooth: text(caseInfos.tooth),
    memo: text(caseInfos.memo),
    fileName: text(caseInfos.file?.originalName),
    connectionLabel: connectionLabelOf(caseInfos, pair),
    source: unsupported ? "unsupported" : "new_implant",
    groupKey: groupKey || "",
    implantManufacturer: pair.manufacturer,
    implantBrand: pair.brand,
    implantFamily: pair.family,
    implantType: pair.implantType,
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

async function enrichDocsToItems(docs, lookup) {
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

  const pairKeys = new Set();
  for (const doc of docs) {
    const pair = extractNewConnectionImplantPair(doc.caseInfos || {});
    pairKeys.add(`${pair.manufacturer}::${pair.brand}`);
  }
  await Promise.all(
    [...pairKeys].map((raw) => {
      const [manufacturer, brand] = raw.split("::");
      return ensureNewConnectionImplantGroup(manufacturer, brand, { lookup });
    }),
  );

  const freshLookupAfterEnsure = buildGroupLookupMaps(
    await loadAllNewConnectionImplantGroups(),
  );

  const items = [];
  for (const doc of docs) {
    const pair = extractNewConnectionImplantPair(doc.caseInfos || {});
    const groupKey = await resolveGroupKeyForPair(
      pair.manufacturer,
      pair.brand,
      freshLookupAfterEnsure,
    );
    items.push(mapDocToItem(doc, userById, anchorById, groupKey));
  }
  return items;
}

function buildGroupsFromItems(items, lookup) {
  const groupMap = new Map();

  for (const item of items) {
    const key =
      item.groupKey ||
      buildImplantGroupKey(item.implantManufacturer, item.implantBrand).groupKey;
    const bucket = groupMap.get(key) || {
      ...mapGroupToWorkflowDto(lookup.byKey.get(key)),
      groupKey: key,
      requestCount: 0,
      items: [],
      hasNewImplant: false,
      hasUnsupported: false,
      latestCreatedAt: null,
    };
    bucket.requestCount += 1;
    bucket.items.push(item);
    if (item.source === "new_implant") bucket.hasNewImplant = true;
    if (item.source === "unsupported") bucket.hasUnsupported = true;
    const createdAt = item.createdAt ? new Date(item.createdAt) : null;
    if (createdAt && (!bucket.latestCreatedAt || createdAt > bucket.latestCreatedAt)) {
      bucket.latestCreatedAt = createdAt;
    }
    groupMap.set(key, bucket);
  }

  const groups = [...groupMap.values()].sort((a, b) => {
    const aTime = a.latestCreatedAt ? a.latestCreatedAt.getTime() : 0;
    const bTime = b.latestCreatedAt ? b.latestCreatedAt.getTime() : 0;
    return bTime - aTime;
  });

  for (const group of groups) {
    group.items.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  return groups;
}

/**
 * 기간 안의 미제공 커넥션·신규 임플란트 의뢰를 제조사·브랜드로 묶어 반환한다.
 */
export async function buildNewConnectionRequestDashboardStats({ start, end }) {
  const docs = await Request.find({
    createdAt: { $gte: start, $lte: end },
    ...NEW_CONNECTION_MATCH,
  })
    .select(REQUEST_SELECT)
    .sort({ createdAt: -1 })
    .limit(ITEM_LIMIT)
    .lean();

  const groupDocs = await loadAllNewConnectionImplantGroups();
  const lookup = buildGroupLookupMaps(groupDocs);

  const items = await enrichDocsToItems(docs, lookup);
  const freshGroups = await loadAllNewConnectionImplantGroups();
  const freshLookup = buildGroupLookupMaps(freshGroups);
  const groups = buildGroupsFromItems(items, freshLookup);

  const openGroupCount = groups.filter((g) => !g.developmentComplete).length;
  const openRequestCount = groups
    .filter((g) => !g.developmentComplete)
    .reduce((sum, g) => sum + g.requestCount, 0);

  return {
    total: openRequestCount,
    openGroupCount,
    groups,
    items,
  };
}
