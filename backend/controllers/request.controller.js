import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import DraftRequest from "../models/draftRequest.model.js";
import ClinicImplantPreset from "../models/clinicImplantPreset.model.js";
import Connection from "../models/connection.model.js";
import SystemSettings from "../models/systemSettings.model.js";
import { Types } from "mongoose";

const DEFAULT_DELIVERY_ETA_LEAD_DAYS = {
  d6: 2,
  d8: 2,
  d10: 5,
  d10plus: 5,
};

function formatEtaLabelFromNow(days) {
  const d = typeof days === "number" && !Number.isNaN(days) ? days : 0;
  const date = new Date();
  date.setDate(date.getDate() + d);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

/**
 * 배송 방식 변경 (의뢰자용)
 * @route PATCH /api/requests/my/shipping-mode
 */
async function updateMyShippingMode(req, res) {
  try {
    const requestorId = req.user._id;
    const { requestIds, shippingMode } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    if (!["normal", "express"].includes(shippingMode)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 배송 방식입니다.",
      });
    }

    const result = await Request.updateMany(
      {
        requestor: requestorId,
        requestId: { $in: requestIds },
        status: { $nin: ["취소", "완료"] },
      },
      {
        $set: {
          shippingMode,
        },
      }
    );

    const modified = result?.modifiedCount ?? result?.nModified ?? 0;

    return res.status(200).json({
      success: true,
      message: `${modified}건의 배송 방식이 변경되었습니다.`,
      data: {
        updatedIds: requestIds,
        shippingMode,
      },
    });
  } catch (error) {
    console.error("Error in updateMyShippingMode:", error);
    return res.status(500).json({
      success: false,
      message: "배송 방식 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function getDeliveryEtaLeadDays() {
  try {
    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return {
      ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
      ...(doc?.deliveryEtaLeadDays || {}),
    };
  } catch {
    return DEFAULT_DELIVERY_ETA_LEAD_DAYS;
  }
}

async function getDashboardRiskSummary(req, res) {
  try {
    const { period = "30d" } = req.query;

    let dateFilter = {};
    if (period && period !== "all") {
      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;

      const from = new Date();
      from.setDate(from.getDate() - days);
      dateFilter = { createdAt: { $gte: from } };
    }

    const baseFilter = {
      ...dateFilter,
      status: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
    };

    const filter =
      req.user?.role === "manufacturer"
        ? {
            ...baseFilter,
            $or: [
              { manufacturer: req.user._id },
              { manufacturer: null },
              { manufacturer: { $exists: false } },
            ],
          }
        : baseFilter;

    const requests = await Request.find(filter)
      .populate("requestor", "name organization")
      .populate("manufacturer", "name organization")
      .populate("deliveryInfoRef")
      .lean();

    const now = new Date();
    const delayedItems = [];
    const warningItems = [];

    requests.forEach((r) => {
      const est = r.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      if (!est) return;

      const shippedAt = r.deliveryInfoRef?.shippedAt
        ? new Date(r.deliveryInfoRef.shippedAt)
        : null;
      const deliveredAt = r.deliveryInfoRef?.deliveredAt
        ? new Date(r.deliveryInfoRef.deliveredAt)
        : null;
      const isDone = r.status === "완료" || Boolean(deliveredAt || shippedAt);

      const diffMs = now.getTime() - est.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const daysOverdue = diffDays > 0 ? Math.floor(diffDays) : 0;
      const daysUntilDue = diffDays < 0 ? Math.ceil(-diffDays) : 0;

      if (!isDone && diffDays >= 1) {
        delayedItems.push({ r, est, daysOverdue, daysUntilDue });
      } else if (!isDone && diffDays >= 0 && diffDays < 1) {
        warningItems.push({ r, est, daysOverdue, daysUntilDue });
      }
    });

    const totalWithEta = requests.filter(
      (r) => r.timeline?.estimatedCompletion
    ).length;
    const delayedCount = delayedItems.length;
    const warningCount = warningItems.length;
    const onTimeBase = totalWithEta || 1;
    const onTimeRate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((onTimeBase - delayedCount - warningCount) / onTimeBase) * 100
        )
      )
    );

    const toRiskItem = (entry, level) => {
      const r = entry?.r || entry;
      const est = entry?.est
        ? entry.est
        : r?.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      const daysOverdue = entry?.daysOverdue || 0;
      const daysUntilDue = entry?.daysUntilDue || 0;

      const ci = r?.caseInfos || {};

      const requestorText =
        r?.requestor?.organization || r?.requestor?.name || "";
      const manufacturerText =
        r?.manufacturer?.organization || r?.manufacturer?.name || "";

      const secondaryText =
        req.user?.role === "manufacturer"
          ? requestorText
          : [requestorText, manufacturerText].filter(Boolean).join(" → ");

      const title =
        (r?.title || "").trim() ||
        [ci.patientName, ci.tooth].filter(Boolean).join(" ") ||
        r?.requestId ||
        "";

      const mm = est ? String(est.getMonth() + 1).padStart(2, "0") : "";
      const dd = est ? String(est.getDate()).padStart(2, "0") : "";
      const dueLabel = est ? `${mm}/${dd}` : "";

      let message = "";
      if (level === "danger") {
        message = `예상 도착일(${dueLabel}) 기준 ${daysOverdue}일 지연 중입니다.`;
      } else {
        message = `예상 도착일(${dueLabel})이 임박했습니다. (D-${daysUntilDue})`;
      }

      return {
        id: r?.requestId,
        title,
        manufacturer: secondaryText,
        riskLevel: level,
        status: r?.status,
        status1: r?.status1,
        status2: r?.status2,
        dueDate: est ? est.toISOString().slice(0, 10) : null,
        daysOverdue,
        daysUntilDue,
        message,
      };
    };

    const riskItems = [
      ...delayedItems
        .slice()
        .sort((a, b) => (b?.daysOverdue || 0) - (a?.daysOverdue || 0))
        .slice(0, 3)
        .map((entry) => toRiskItem(entry, "danger")),
      ...warningItems
        .slice()
        .sort((a, b) => (a?.daysUntilDue || 0) - (b?.daysUntilDue || 0))
        .slice(0, 3)
        .map((entry) => toRiskItem(entry, "warning")),
    ];

    return res.status(200).json({
      success: true,
      data: {
        riskSummary: {
          delayedCount,
          warningCount,
          onTimeRate,
          items: riskItems,
        },
      },
    });
  } catch (error) {
    console.error("Error in getDashboardRiskSummary:", error);
    return res.status(500).json({
      success: false,
      message: "지연 위험 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// status(단일 필드)를 status1/status2와 동기화하는 헬퍼
function applyStatusMapping(requestDoc, statusValue) {
  const status = statusValue || requestDoc.status || "의뢰접수";

  let status1 = "의뢰접수";
  let status2 = "없음";

  switch (status) {
    case "의뢰접수":
      status1 = "의뢰접수";
      status2 = "없음";
      break;
    case "가공전":
      status1 = "가공";
      status2 = "전";
      break;
    case "가공후":
      status1 = "가공";
      status2 = "후";
      break;
    case "배송대기":
      status1 = "세척/검사/포장";
      status2 = "후";
      break;
    case "배송중":
      status1 = "배송";
      status2 = "중";
      break;
    case "완료":
      status1 = "완료";
      status2 = "없음";
      break;
    case "취소":
      status1 = "취소";
      status2 = "없음";
      break;
    default:
      // 알 수 없는 값인 경우 기본값 유지
      break;
  }

  requestDoc.status = status;
  requestDoc.status1 = status1;
  requestDoc.status2 = status2;
}

async function normalizeCaseInfosImplantFields(caseInfos) {
  const ci = caseInfos && typeof caseInfos === "object" ? { ...caseInfos } : {};

  const manufacturer = (ci.implantManufacturer || "").trim();
  const system = (ci.implantSystem || "").trim();
  const type = (ci.implantType || "").trim();
  const legacyConnectionType = (ci.connectionType || "").trim();
  delete ci.connectionType;

  // 이미 신 스키마가 완성되어 있으면 그대로
  if (manufacturer && system && type) {
    return {
      ...ci,
      implantManufacturer: manufacturer,
      implantSystem: system,
      implantType: type,
    };
  }

  // 레거시(밀린 값) 케이스를 최대한 복원
  // - 과거: implantSystem=제조사, implantType=시스템, connectionType=유형
  // - 현재 문제 데이터: implantSystem=시스템(Regular), implantType=유형(Hex), connectionType=유형(Hex)
  const candidateManufacturer = manufacturer || "";
  const rawA = system; // implantSystem
  const rawB = type || legacyConnectionType; // implantType 우선

  // 1) 과거 스키마(implantSystem=제조사)로 들어온 경우
  //    제조사가 비어 있고 connectionType이 있는 경우가 많음
  if (!candidateManufacturer && system && legacyConnectionType && !type) {
    return {
      ...ci,
      implantManufacturer: system,
      implantSystem: (ci.implantType || "").trim(),
      implantType: legacyConnectionType,
    };
  }

  // 2) connections DB로 복원 시도 (system/type 조합으로 manufacturer 찾기)
  //    - (Regular, Hex) 같은 조합이 manufacturer별로 중복될 수 있으나,
  //      기존 데이터가 밀린 상태라면 manufacturer가 없으므로 첫 매칭을 사용한다.
  if (!candidateManufacturer && rawA && rawB) {
    const found = await Connection.findOne({
      isActive: true,
      system: rawA,
      type: rawB,
    })
      .select({ manufacturer: 1, system: 1, type: 1 })
      .lean();

    if (found) {
      return {
        ...ci,
        implantManufacturer: found.manufacturer,
        implantSystem: found.system,
        implantType: found.type,
      };
    }
  }

  // 3) 마지막 fallback: 있는 값들을 최대한 채움
  return {
    ...ci,
    implantManufacturer: candidateManufacturer,
    implantSystem: rawA,
    implantType: rawB,
  };
}

async function normalizeRequestForResponse(requestDoc) {
  if (!requestDoc) return requestDoc;
  const obj =
    typeof requestDoc.toObject === "function"
      ? requestDoc.toObject()
      : requestDoc;
  const ci = obj.caseInfos || {};
  obj.caseInfos = await normalizeCaseInfosImplantFields(ci);
  return obj;
}

// 가공 시작 시점에 로트넘버(lotNumber)를 부여하는 헬퍼
async function ensureLotNumberForMachining(requestDoc) {
  // patientCases 필드를 더 이상 사용하지 않으므로, 현재는 lotNumber를 자동 부여하지 않는다.
  // 기존 데이터에 lotNumber가 이미 있다면 그대로 유지하고, 없다면 변경하지 않는다.
  if (requestDoc.lotNumber) {
    return;
  }

  return;
}

async function computePriceForRequest({
  requestorId,
  clinicName,
  patientName,
  tooth,
}) {
  const BASE_UNIT_PRICE = 15000;
  const REMAKE_FIXED_PRICE = 10000;
  const NEW_USER_FIXED_PRICE = 10000;
  const DISCOUNT_PER_ORDER = 10;
  const MAX_DISCOUNT = 5000;

  const now = new Date();

  // 1) 리메이크(재의뢰): 동일 환자/치아/치과, 90일 내 주문 존재 -> 10,000원 고정
  const remakeCutoff = new Date(now);
  remakeCutoff.setDate(remakeCutoff.getDate() - 90);
  const existing = await Request.findOne({
    requestor: requestorId,
    "caseInfos.patientName": patientName,
    "caseInfos.tooth": tooth,
    "caseInfos.clinicName": clinicName,
    status: { $ne: "취소" },
    createdAt: { $gte: remakeCutoff },
  })
    .select({ _id: 1 })
    .lean();

  if (existing) {
    return {
      baseAmount: REMAKE_FIXED_PRICE,
      discountAmount: 0,
      amount: REMAKE_FIXED_PRICE,
      currency: "KRW",
      rule: "remake_fixed_10000",
      discountMeta: {
        last30DaysOrders: 0,
        referralLast30DaysOrders: 0,
        discountPerOrder: DISCOUNT_PER_ORDER,
        maxDiscount: MAX_DISCOUNT,
      },
      quotedAt: now,
    };
  }

  // 2) 신규 90일 고정가: 가입일(createdAt) 기준 90일 내 -> 10,000원 고정
  const user = await User.findById(requestorId)
    .select({ createdAt: 1, updatedAt: 1, active: 1, approvedAt: 1 })
    .lean();
  const baseDate =
    user?.approvedAt ||
    (user?.active ? user?.updatedAt : null) ||
    user?.createdAt;
  if (baseDate) {
    const newUserCutoff = new Date(baseDate);
    newUserCutoff.setDate(newUserCutoff.getDate() + 90);
    if (now < newUserCutoff) {
      return {
        baseAmount: NEW_USER_FIXED_PRICE,
        discountAmount: 0,
        amount: NEW_USER_FIXED_PRICE,
        currency: "KRW",
        rule: "new_user_90days_fixed_10000",
        discountMeta: {
          last30DaysOrders: 0,
          referralLast30DaysOrders: 0,
          discountPerOrder: DISCOUNT_PER_ORDER,
          maxDiscount: MAX_DISCOUNT,
        },
        quotedAt: now,
      };
    }
  }

  // 3) 최근 30일 주문량 할인(리퍼럴 합산은 아직 스키마가 없어 0으로 처리)
  const last30Cutoff = new Date(now);
  last30Cutoff.setDate(last30Cutoff.getDate() - 30);
  const last30DaysOrders = await Request.countDocuments({
    requestor: requestorId,
    status: { $ne: "취소" },
    createdAt: { $gte: last30Cutoff },
  });

  // 추천인 합산: 내가 추천한(=referredByUserId가 나인) 유저들의 최근 30일 주문량을 합산
  const referredUsers = await User.find({
    referredByUserId: requestorId,
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  const referredUserIds = referredUsers.map((u) => u._id).filter(Boolean);

  const referralLast30DaysOrders = referredUserIds.length
    ? await Request.countDocuments({
        requestor: { $in: referredUserIds },
        status: { $ne: "취소" },
        createdAt: { $gte: last30Cutoff },
      })
    : 0;
  const totalOrders = last30DaysOrders + referralLast30DaysOrders;
  const discountAmount = Math.min(
    totalOrders * DISCOUNT_PER_ORDER,
    MAX_DISCOUNT
  );
  const amount = Math.max(0, BASE_UNIT_PRICE - discountAmount);

  return {
    baseAmount: BASE_UNIT_PRICE,
    discountAmount,
    amount,
    currency: "KRW",
    rule: discountAmount > 0 ? "volume_discount_last30days" : "base_price",
    discountMeta: {
      last30DaysOrders,
      referralLast30DaysOrders,
      discountPerOrder: DISCOUNT_PER_ORDER,
      maxDiscount: MAX_DISCOUNT,
    },
    quotedAt: now,
  };
}

/**
 * 새 의뢰 생성
 * @route POST /api/requests
 */
async function createRequest(req, res) {
  try {
    // Batch request processing
    if (req.body.items && Array.isArray(req.body.items)) {
      const createdRequests = [];
      const items = req.body.items;

      // Generate a common referenceId for the batch if not provided in items
      // However, items might already have referenceIds grouped by patient
      // So we just process each item.

      for (const item of items) {
        const { caseInfos, ...rest } = item;

        // caseInfos가 필수이며, 환자명/치아번호는 반드시 있어야 한다.
        if (!caseInfos || typeof caseInfos !== "object") {
          throw new Error("각 항목에 caseInfos 객체가 필요합니다.");
        }

        const patientName = (caseInfos.patientName || "").trim();
        const tooth = (caseInfos.tooth || "").trim();
        const clinicName = (caseInfos.clinicName || "").trim();
        const workType = (caseInfos.workType || "abutment").trim();

        // 현재는 커스텀 어벗먼트 의뢰만 허용
        if (workType !== "abutment") {
          return res.status(400).json({
            success: false,
            message: "현재는 커스텀 어벗먼트 의뢰만 등록할 수 있습니다.",
          });
        }

        const normalizedCaseInfos = await normalizeCaseInfosImplantFields(
          caseInfos
        );
        const implantManufacturer = (
          normalizedCaseInfos.implantManufacturer || ""
        ).trim();
        const implantSystem = (normalizedCaseInfos.implantSystem || "").trim();
        const implantType = (normalizedCaseInfos.implantType || "").trim();

        if (!patientName || !tooth || !clinicName) {
          return res.status(400).json({
            success: false,
            message: "치과이름, 환자이름, 치아번호는 모두 필수입니다.",
          });
        }

        if (!implantManufacturer || !implantSystem || !implantType) {
          return res.status(400).json({
            success: false,
            message:
              "커스텀 어벗 의뢰의 경우 임플란트 제조사/시스템/유형은 모두 필수입니다.",
          });
        }

        const computedPrice = await computePriceForRequest({
          requestorId: req.user._id,
          clinicName,
          patientName,
          tooth,
        });

        const newRequest = new Request({
          ...rest,
          caseInfos: normalizedCaseInfos,
          requestor: req.user._id,
          price: computedPrice,
        });
        applyStatusMapping(newRequest, newRequest.status);
        await newRequest.save();
        createdRequests.push(newRequest);
      }

      // 모든 요청이 저장된 뒤, 같은 환자명 기준으로 requestId를 referenceId에 매핑한다.
      // (예: "김선미"의 27번/37번/크라운 의뢰만 서로 묶이고,
      //  다른 환자 이름의 의뢰들은 별도 그룹으로 관리)

      // 1) (클리닉명 + 환자명) 조합별 -> requestId[] 맵 구성
      const groupByClinicAndPatient = new Map();

      for (const r of createdRequests) {
        const rawName =
          typeof r.caseInfos?.patientName === "string"
            ? r.caseInfos.patientName
            : "";
        const rawClinic =
          typeof r.caseInfos?.clinicName === "string"
            ? r.caseInfos.clinicName
            : "";
        const nameKey = rawName.trim() || "__NO_NAME__";
        const clinicKey = rawClinic.trim() || "__NO_CLINIC__";
        const key = `${clinicKey}::${nameKey}`;
        if (!groupByClinicAndPatient.has(key)) {
          groupByClinicAndPatient.set(key, []);
        }
        const arr = groupByClinicAndPatient.get(key);
        if (typeof r.requestId === "string" && r.requestId.length > 0) {
          arr.push(r.requestId);
        }
      }

      // 2) 각 의뢰에 대해, 자신의 (클리닉+환자) 그룹에 해당하는 requestId 배열(자기 자신은 제외)을 referenceIds로 설정
      await Promise.all(
        createdRequests.map(async (reqDoc) => {
          const rawName =
            typeof reqDoc.caseInfos?.patientName === "string"
              ? reqDoc.caseInfos.patientName
              : "";
          const rawClinic =
            typeof reqDoc.caseInfos?.clinicName === "string"
              ? reqDoc.caseInfos.clinicName
              : "";
          const nameKey = rawName.trim() || "__NO_NAME__";
          const clinicKey = rawClinic.trim() || "__NO_CLINIC__";
          const key = `${clinicKey}::${nameKey}`;
          const idsForGroup = groupByClinicAndPatient.get(key) || [];
          reqDoc.referenceIds = idsForGroup.filter(
            (id) => id !== reqDoc.requestId
          );
          await reqDoc.save();
        })
      );

      return res.status(201).json({
        success: true,
        message: `${createdRequests.length}건의 의뢰가 성공적으로 등록되었습니다.`,
        data: createdRequests,
      });
    }

    const { caseInfos, ...bodyRest } = req.body;

    if (!caseInfos || typeof caseInfos !== "object") {
      throw new Error("caseInfos 객체가 필요합니다.");
    }

    const patientName = (caseInfos.patientName || "").trim();
    const tooth = (caseInfos.tooth || "").trim();
    const clinicName = (caseInfos.clinicName || "").trim();
    const workType = (caseInfos.workType || "abutment").trim();

    // 현재는 커스텀 어벗먼트 의뢰만 허용
    if (workType !== "abutment") {
      return res.status(400).json({
        success: false,
        message: "현재는 커스텀 어벗먼트 의뢰만 등록할 수 있습니다.",
      });
    }

    const normalizedCaseInfos = await normalizeCaseInfosImplantFields(
      caseInfos
    );
    const implantManufacturer = (
      normalizedCaseInfos.implantManufacturer || ""
    ).trim();
    const implantSystem = (normalizedCaseInfos.implantSystem || "").trim();
    const implantType = (normalizedCaseInfos.implantType || "").trim();

    if (!patientName || !tooth || !clinicName) {
      return res.status(400).json({
        success: false,
        message: "치과이름, 환자이름, 치아번호는 모두 필수입니다.",
      });
    }

    if (!implantManufacturer || !implantSystem || !implantType) {
      return res.status(400).json({
        success: false,
        message:
          "커스텀 어벗 의뢰의 경우 임플란트 제조사/시스템/유형은 모두 필수입니다.",
      });
    }

    const computedPrice = await computePriceForRequest({
      requestorId: req.user._id,
      clinicName,
      patientName,
      tooth,
    });

    const newRequest = new Request({
      ...bodyRest,
      caseInfos: normalizedCaseInfos,
      requestor: req.user._id,
      price: computedPrice,
    });

    applyStatusMapping(newRequest, newRequest.status);

    await newRequest.save();

    const hasManufacturer =
      typeof normalizedCaseInfos.implantManufacturer === "string" &&
      normalizedCaseInfos.implantManufacturer.trim();

    if (hasManufacturer) {
      try {
        await ClinicImplantPreset.findOneAndUpdate(
          {
            requestor: req.user._id,
            clinicName: caseInfos.clinicName || "",
            manufacturer: normalizedCaseInfos.implantManufacturer,
            system: normalizedCaseInfos.implantSystem,
            type: normalizedCaseInfos.implantType,
          },
          {
            $inc: { useCount: 1 },
            $set: { lastUsedAt: new Date() },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (presetError) {
        console.warn("Could not save clinic implant preset", presetError);
      }
    }

    res.status(201).json({
      success: true,
      message: "의뢰가 성공적으로 등록되었습니다.",
      data: newRequest,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      // Mongoose ValidationError 처리
      const errors = Object.values(error.errors).map((e) => e.message);
      res.status(400).json({
        success: false,
        message: "필수 입력 항목이 누락되었습니다.",
        errors,
      });
    } else {
      console.error("Error in createRequest:", error);
      res.status(500).json({
        success: false,
        message: "의뢰 등록 중 오류가 발생했습니다.",
        error: error.message,
      });
    }
  }
}

/**
 * 기존 의뢰를 Draft로 복제 (파일 포함)
 * @route POST /api/requests/:id/clone-to-draft
 */
async function cloneRequestToDraft(req, res) {
  try {
    const requestId = req.params.id;

    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    const request = await Request.findById(requestId).lean();
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    const isRequestor = req.user._id.equals(request.requestor);
    const isAdmin = req.user.role === "admin";
    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 복제할 권한이 없습니다.",
      });
    }

    const ci = request.caseInfos || {};
    const file = ci.file || {};

    const normalizedCi = await normalizeCaseInfosImplantFields(ci);

    const draftCaseInfo = {
      file: file.s3Key
        ? {
            originalName: file.fileName,
            size: file.fileSize,
            mimetype: file.fileType,
            s3Key: file.s3Key,
          }
        : undefined,
      clinicName: ci.clinicName,
      patientName: ci.patientName,
      tooth: ci.tooth,
      implantManufacturer: normalizedCi.implantManufacturer,
      implantSystem: normalizedCi.implantSystem,
      implantType: normalizedCi.implantType,
      maxDiameter: ci.maxDiameter,
      connectionDiameter: ci.connectionDiameter,
      workType: ci.workType,
      shippingMode: request.shippingMode || "normal",
      requestedShipDate: request.requestedShipDate,
    };

    const draft = await DraftRequest.create({
      requestor: req.user._id,
      caseInfos: [draftCaseInfo].map((x) => ({
        ...x,
        workType: (x && x.workType) || "abutment",
      })),
    });

    return res.status(201).json({
      success: true,
      message: "Draft가 생성되었습니다.",
      data: draft,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Draft 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * DraftRequest를 실제 Request들로 변환
 * @route POST /api/requests/from-draft
 */
async function createRequestsFromDraft(req, res) {
  try {
    const { draftId, clinicId } = req.body || {};

    if (!draftId || !Types.ObjectId.isValid(draftId)) {
      return res.status(400).json({
        success: false,
        message: "유효한 draftId가 필요합니다.",
      });
    }

    const draft = await DraftRequest.findById(draftId).lean();

    if (!draft) {
      return res.status(404).json({
        success: false,
        message: "Draft를 찾을 수 없습니다.",
      });
    }

    if (draft.requestor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "이 Draft에 대한 권한이 없습니다.",
      });
    }

    const draftCaseInfos = Array.isArray(draft.caseInfos)
      ? draft.caseInfos
      : [];

    // 프론트엔드에서 최신 caseInfos 배열을 함께 보내온 경우, 이를 Draft.caseInfos 와 병합한다.
    // - 인덱스 기준으로 draft.caseInfos 의 file 서브도큐먼트는 유지
    // - 텍스트 필드(clinicName, patientName, tooth, implant*, connectionType 등)는
    //   클라이언트 caseInfos 가 있으면 덮어쓴다.
    let caseInfosArray = draftCaseInfos;
    if (Array.isArray(req.body.caseInfos) && req.body.caseInfos.length > 0) {
      const incoming = req.body.caseInfos;
      caseInfosArray = draftCaseInfos.map((ci, idx) => {
        const incomingCi = incoming[idx] || {};
        return {
          ...ci,
          ...incomingCi,
          file: ci.file, // file 메타는 Draft 기준 유지
          workType: (incomingCi.workType || ci.workType || "abutment").trim(),
        };
      });
    }

    if (!caseInfosArray.length) {
      return res.status(400).json({
        success: false,
        message: "Draft에 caseInfos가 없습니다.",
      });
    }

    // 현재는 커스텀 어벗먼트 케이스만 실제 Request 생성 대상으로 사용
    const abutmentCases = caseInfosArray.filter(
      (ci) => (ci.workType || "abutment").trim() === "abutment"
    );

    if (!abutmentCases.length) {
      return res.status(400).json({
        success: false,
        message: "Draft에 커스텀 어벗 케이스가 없습니다.",
      });
    }

    const createdRequests = [];
    const missingFieldsByFile = []; // 필수 정보 누락 파일 추적

    for (let idx = 0; idx < abutmentCases.length; idx++) {
      const ci = abutmentCases[idx] || {};

      const normalizedCi = await normalizeCaseInfosImplantFields(ci);

      const patientName = (ci.patientName || "").trim();
      const tooth = (ci.tooth || "").trim();
      const clinicName = (ci.clinicName || "").trim();
      const workType = (ci.workType || "abutment").trim();

      // 안전장치: 여기까지 온 케이스는 모두 abutment 여야 함
      if (workType !== "abutment") continue;

      const implantManufacturer = (
        normalizedCi.implantManufacturer || ""
      ).trim();
      const implantSystem = (normalizedCi.implantSystem || "").trim();
      const implantType = (normalizedCi.implantType || "").trim();

      // 배송 정보 (없으면 기본값 normal)
      const shippingMode = ci.shippingMode === "express" ? "express" : "normal";
      const requestedShipDate = ci.requestedShipDate || undefined;

      // 필수 정보 검증
      const missing = [];
      if (!clinicName) missing.push("치과이름");
      if (!patientName) missing.push("환자이름");
      if (!tooth) missing.push("치아번호");

      if (!implantManufacturer) missing.push("임플란트 제조사");
      if (!implantSystem) missing.push("임플란트 시스템");
      if (!implantType) missing.push("임플란트 유형");

      if (missing.length > 0) {
        const fileName = ci.file?.originalName || `파일 ${idx + 1}`;
        missingFieldsByFile.push({
          fileName,
          missingFields: missing,
        });
        continue; // 이 파일은 건너뛰고 다음 파일 처리
      }

      const computedPrice = await computePriceForRequest({
        requestorId: req.user._id,
        clinicName,
        patientName,
        tooth,
      });

      const caseInfosWithFile = ci.file
        ? {
            ...normalizedCi,
            file: {
              fileName: ci.file.originalName,
              fileType: ci.file.mimetype,
              fileSize: ci.file.size,
              // filePath는 아직 없으므로 undefined 유지
              filePath: undefined,
              s3Key: ci.file.s3Key,
              // s3Url은 나중에 presigned URL 생성 시 채울 수 있으므로 undefined
              s3Url: undefined,
            },
          }
        : normalizedCi;

      const newRequest = new Request({
        requestor: req.user._id,
        caseInfos: caseInfosWithFile,
        price: computedPrice,
        shippingMode,
        requestedShipDate,
      });

      applyStatusMapping(newRequest, newRequest.status);

      await newRequest.save();
      createdRequests.push(newRequest);
    }

    // 생성된 의뢰가 없으면 에러 반환
    if (createdRequests.length === 0) {
      return res.status(400).json({
        success: false,
        message: "필수 정보가 누락된 파일이 있습니다.",
        missingFiles: missingFieldsByFile,
        details: missingFieldsByFile
          .map(
            (item) => `${item.fileName}: ${item.missingFields.join(", ")} 필수`
          )
          .join("\n"),
      });
    }

    return res.status(201).json({
      success: true,
      message: `${createdRequests.length}건의 의뢰가 Draft에서 생성되었습니다.`,
      data: createdRequests,
      ...(missingFieldsByFile.length > 0 && {
        warning: `${missingFieldsByFile.length}개 파일은 필수 정보 누락으로 제외되었습니다.`,
        missingFiles: missingFieldsByFile,
      }),
    });
  } catch (error) {
    console.error("Error in createRequestsFromDraft:", error);
    return res.status(500).json({
      success: false,
      message: "Draft에서 의뢰 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 동일 환자/치아 커스텀 어벗 의뢰 존재 여부 확인 (재의뢰 판단용)
async function hasDuplicateCase(req, res) {
  try {
    const requestorId = req.user._id;
    const patientName = (req.query.patientName || "").trim();
    const tooth = (req.query.tooth || "").trim();
    const clinicName = (req.query.clinicName || "").trim();

    if (!patientName || !tooth || !clinicName) {
      return res.status(400).json({
        success: false,
        message: "patientName, tooth, clinicName은 필수입니다.",
      });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const existing = await Request.findOne({
      requestor: requestorId,
      "caseInfos.patientName": patientName,
      "caseInfos.tooth": tooth,
      "caseInfos.clinicName": clinicName,
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
      status: { $ne: "취소" },
      createdAt: { $gte: cutoff },
    })
      .select({ _id: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: { hasDuplicate: Boolean(existing) },
    });
  } catch (error) {
    console.error("Error in hasDuplicateCase:", error);
    return res.status(500).json({
      success: false,
      message: "중복 의뢰 여부 확인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 모든 의뢰 목록 조회 (관리자용)
 * @route GET /api/requests/all
 */
async function getAllRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 개발 환경 + MOCK_DEV_TOKEN 인 경우, 기존 시드 데이터 확인을 위해
    // requestor 필터를 제거하고 나머지 필터만 적용한다.
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (isMockDevToken) {
      const { requestor, ...rest } = filter;
      filter = rest;
    }

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 의뢰 조회 (현재 사용자 기준 unreadCount 포함)
    const rawRequests = await Request.find(filter)
      .populate("requestor", "name email organization")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const requests = rawRequests.map((r) => {
      const messages = Array.isArray(r.messages) ? r.messages : [];
      const unreadCount = messages.filter((m) => {
        if (!m) return false;
        if (m.isRead) return false;
        if (!m.sender) return true;
        const senderId =
          typeof m.sender === "string" ? m.sender : m.sender.toString();
        return senderId !== req.user._id.toString();
      }).length;
      return { ...r, unreadCount };
    });

    // 전체 의뢰 수
    const total = await Request.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 내 의뢰 목록 조회 (의뢰자용)
 * @route GET /api/requests/my
 */
async function getMyRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 기본 필터: 로그인한 의뢰자 본인
    let filter = { requestor: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 개발 환경 + MOCK_DEV_TOKEN 인 경우, 기존 시드 데이터 확인을 위해
    // requestor 필터를 제거하고 나머지 필터만 적용한다.
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (isMockDevToken) {
      const { requestor, ...rest } = filter;
      filter = rest;
    }

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 의뢰 조회
    const requests = await Request.find(filter)
      .populate("requestor", "name email organization")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // 전체 의뢰 수
    const total = await Request.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상세 조회
 * @route GET /api/requests/:id
 */
async function getRequestById(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회 (메시지 발신자 정보까지 포함)
    const request = await Request.findById(requestId)
      .populate("requestor", "name email phoneNumber organization role")
      .populate("messages.sender", "name email role");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 조회 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰에 접근할 권한이 없습니다.",
      });
    }

    const normalized = await normalizeRequestForResponse(request);
    res.status(200).json({
      success: true,
      data: normalized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 수정
 * @route PUT /api/requests/:id
 */
async function updateRequest(req, res) {
  try {
    const requestId = req.params.id;
    const updateData = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 수정 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 수정할 권한이 없습니다.",
      });
    }

    // 수정 불가능한 필드 제거
    delete updateData.requestId;
    delete updateData.requestor;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // 의뢰 상태가 '의뢰접수' 또는 '가공전'일 때만 일부 필드 수정 가능
    // (requestor는 가공 시작 전까지 환자/임플란트 정보를 수정 가능)
    if (!isAdmin && !["의뢰접수", "가공전"].includes(request.status)) {
      const allowedFields = ["messages"];
      Object.keys(updateData).forEach((key) => {
        if (!allowedFields.includes(key)) {
          delete updateData[key];
        }
      });
    }

    if (
      updateData &&
      updateData.caseInfos &&
      typeof updateData.caseInfos === "object"
    ) {
      // 레거시 connectionType이 넘어오면 implantType으로 흡수
      if (
        typeof updateData.caseInfos.connectionType === "string" &&
        !updateData.caseInfos.implantType
      ) {
        updateData.caseInfos.implantType = updateData.caseInfos.connectionType;
      }
      delete updateData.caseInfos.connectionType;

      updateData.caseInfos = await normalizeCaseInfosImplantFields(
        updateData.caseInfos
      );
    }

    // 의뢰 수정
    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    const normalized = await normalizeRequestForResponse(updatedRequest);

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 수정되었습니다.",
      data: normalized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상태 변경
 * @route PATCH /api/requests/:id/status
 */
async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { status } = req.body;

    // 상태 유효성 검사 (새 워크플로우)
    const validStatuses = [
      "의뢰접수",
      "가공전",
      "가공후",
      "배송대기",
      "배송중",
      "완료",
      "취소",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 상태입니다.",
      });
    }

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 상태 변경 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰의 상태를 변경할 권한이 없습니다.",
      });
    }

    // 상태 변경 권한 확인
    if (status === "취소" && !isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "의뢰자 또는 관리자만 의뢰를 취소할 수 있습니다.",
      });
    }

    // 취소는 의뢰접수/가공전 상태에서만 가능
    if (status === "취소" && !["의뢰접수", "가공전"].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: "의뢰접수 또는 가공전 상태에서만 취소할 수 있습니다.",
      });
    }

    // 의뢰 상태 변경 (status1/status2 동기화 포함)
    applyStatusMapping(request, status);

    // 신속 배송이 출고(배송중)로 전환되면, 그동안 쌓인 묶음(일반) 배송대기 건도 함께 출고 처리
    if (status === "배송중" && request.shippingMode === "express") {
      await Request.updateMany(
        {
          requestor: request.requestor,
          status: "배송대기",
          shippingMode: "normal",
          _id: { $ne: request._id },
        },
        {
          $set: {
            status: "배송중",
            status1: "배송",
            status2: "중",
          },
        }
      );
    }

    // 가공 시작 시점(가공전 진입)에서만 로트넘버 부여
    if (status === "가공전") {
      await ensureLotNumberForMachining(request);
    }

    await request.save();

    res.status(200).json({
      success: true,
      message: "의뢰 상태가 성공적으로 변경되었습니다.",
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰에 메시지 추가
 * @route POST /api/requests/:id/messages
 */
async function addMessage(req, res) {
  try {
    const requestId = req.params.id;
    const { content } = req.body;

    // 메시지 내용 유효성 검사
    if (!content) {
      return res.status(400).json({
        success: false,
        message: "메시지 내용은 필수입니다.",
      });
    }

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 메시지 추가 가능)
    const isRequestor = req.user._id.equals(request.requestor._id);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰에 메시지를 추가할 권한이 없습니다.",
      });
    }

    // 메시지 추가
    const newMessage = {
      sender: req.user._id,
      content,
      createdAt: Date.now(),
      isRead: false,
    };

    request.messages.push(newMessage);
    const updatedRequest = await request.save();

    res.status(201).json({
      success: true,
      message: "메시지가 성공적으로 추가되었습니다.",
      data: updatedRequest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "메시지 추가 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 삭제 (관리자 또는 의뢰자 본인만 가능)
 * @route DELETE /api/requests/:id
 */
async function deleteRequest(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 권한 검증: 관리자이거나 의뢰자 본인만 삭제 가능
    if (
      req.user.role !== "admin" &&
      request.requestor.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 삭제할 권한이 없습니다.",
      });
    }

    // 의뢰 삭제
    await Request.findByIdAndDelete(requestId);

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 삭제되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 최대 직경 기준 4개 구간(<6, <8, <10, >=10mm) 통계를 계산하는 헬퍼
function computeDiameterStats(requests, leadDays) {
  const effectiveLeadDays = {
    ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
    ...(leadDays || {}),
  };

  const bucketDefs = [
    {
      id: "d6",
      diameter: 6,
      shipLabel: formatEtaLabelFromNow(effectiveLeadDays.d6),
    },
    {
      id: "d8",
      diameter: 8,
      shipLabel: formatEtaLabelFromNow(effectiveLeadDays.d8),
    },
    {
      id: "d10",
      diameter: 10,
      shipLabel: formatEtaLabelFromNow(effectiveLeadDays.d10),
    },
    {
      id: "d10plus",
      diameter: "10+",
      shipLabel: formatEtaLabelFromNow(effectiveLeadDays.d10plus),
    },
  ];

  const counts = {
    d6: 0,
    d8: 0,
    d10: 0,
    d10plus: 0,
  };

  if (Array.isArray(requests)) {
    requests.forEach((r) => {
      const raw = r?.caseInfos?.maxDiameter;
      const d =
        typeof raw === "number" ? raw : raw != null ? Number(raw) : null;
      if (d == null || Number.isNaN(d)) return;

      if (d <= 6) counts.d6 += 1;
      else if (d <= 8) counts.d8 += 1;
      else if (d <= 10) counts.d10 += 1;
      else counts.d10plus += 1;
    });
  }

  const total = counts.d6 + counts.d8 + counts.d10 + counts.d10plus;
  const maxCount = Math.max(
    1,
    counts.d6,
    counts.d8,
    counts.d10,
    counts.d10plus
  );

  const buckets = bucketDefs.map((def) => ({
    diameter: def.diameter,
    shipLabel: def.shipLabel,
    count: counts[def.id] || 0,
    ratio: maxCount > 0 ? (counts[def.id] || 0) / maxCount : 0,
  }));

  return { total, buckets };
}

/**
 * 최대 직경별 통계 (공용)
 * @route GET /api/requests/diameter-stats
 */
async function getDiameterStats(req, res) {
  try {
    const leadDays = await getDeliveryEtaLeadDays();
    const baseFilter = {
      status: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
    };

    const filter =
      req.user?.role === "requestor"
        ? { ...baseFilter, requestor: req.user._id }
        : baseFilter;

    const requests = await Request.find(filter).select({ caseInfos: 1 }).lean();

    const diameterStats = computeDiameterStats(requests, leadDays);

    return res.status(200).json({
      success: true,
      data: {
        diameterStats,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "직경별 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 내 대시보드 요약 (의뢰자용)
 * @route GET /api/requests/my/dashboard-summary
 */
async function getMyDashboardSummary(req, res) {
  try {
    const requestorId = req.user._id;
    const { period = "30d" } = req.query;

    let dateFilter = {};
    if (period && period !== "all") {
      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;

      const from = new Date();
      from.setDate(from.getDate() - days);
      dateFilter = { createdAt: { $gte: from } };
    }

    // 기본적으로는 로그인한 의뢰자 본인(requestorId)의 데이터만 조회
    // 단, 개발 환경에서 MOCK_DEV_TOKEN을 사용하는 경우에는
    // 기존 시드 데이터 확인을 위해 requestor 필터를 생략한다.
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    const requestFilter = isMockDevToken
      ? { ...dateFilter }
      : { requestor: requestorId, ...dateFilter };

    const requests = await Request.find(requestFilter)
      .populate("requestor", "name organization")
      .populate("manufacturer", "name organization")
      .populate("deliveryInfoRef")
      .lean();

    // 커스텀 어벗(Request.caseInfos.implantSystem 존재)만 대시보드 통계 대상
    // 취소 건은 대시보드(최근 의뢰/통계)에서 제외
    const abutmentRequests = requests.filter((r) => {
      if (r.status === "취소") return false;
      const ci = r.caseInfos || {};
      return typeof ci.implantSystem === "string" && ci.implantSystem.trim();
    });

    const total = abutmentRequests.length;
    const inProduction = abutmentRequests.filter((r) =>
      ["가공전", "가공후"].includes(r.status)
    ).length;
    const completed = abutmentRequests.filter(
      (r) => r.status === "완료"
    ).length;
    const inShipping = abutmentRequests.filter(
      (r) => r.status === "배송중"
    ).length;

    const active = abutmentRequests.filter((r) =>
      ["의뢰접수", "가공전", "가공후", "배송대기", "배송중"].includes(r.status)
    );

    const stageCounts = {
      design: 0,
      cnc: 0,
      post: 0,
      shipping: 0,
    };

    active.forEach((r) => {
      if (r.status === "의뢰접수") {
        stageCounts.design += 1;
      } else if (r.status === "가공전") {
        stageCounts.cnc += 1;
      } else if (r.status === "가공후") {
        stageCounts.post += 1;
      } else if (r.status === "배송대기" || r.status === "배송중") {
        stageCounts.shipping += 1;
      }
    });

    const totalActive = active.length || 1;
    const manufacturingSummary = {
      totalActive: active.length,
      stages: [
        { key: "design", label: "디자인 검토", count: stageCounts.design },
        { key: "cnc", label: "CNC 가공", count: stageCounts.cnc },
        { key: "post", label: "후처리/폴리싱", count: stageCounts.post },
        {
          key: "shipping",
          label: "출고/배송 준비",
          count: stageCounts.shipping,
        },
      ].map((s) => ({
        ...s,
        percent: totalActive ? Math.round((s.count / totalActive) * 100) : 0,
      })),
    };

    const now = new Date();
    const delayedItems = [];
    const warningItems = [];

    abutmentRequests.forEach((r) => {
      const est = r.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      if (!est) return;

      const shippedAt = r.deliveryInfoRef?.shippedAt
        ? new Date(r.deliveryInfoRef.shippedAt)
        : null;
      const deliveredAt = r.deliveryInfoRef?.deliveredAt
        ? new Date(r.deliveryInfoRef.deliveredAt)
        : null;
      const isDone = r.status === "완료" || Boolean(deliveredAt || shippedAt);

      const diffMs = now.getTime() - est.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const daysOverdue = diffDays > 0 ? Math.floor(diffDays) : 0;
      const daysUntilDue = diffDays < 0 ? Math.ceil(-diffDays) : 0;

      if (!isDone && diffDays >= 1) {
        delayedItems.push({ r, est, daysOverdue, daysUntilDue });
      } else if (!isDone && diffDays >= 0 && diffDays < 1) {
        warningItems.push({ r, est, daysOverdue, daysUntilDue });
      }
    });

    const totalWithEta = abutmentRequests.filter(
      (r) => r.timeline?.estimatedCompletion
    ).length;
    const delayedCount = delayedItems.length;
    const warningCount = warningItems.length;
    const onTimeBase = totalWithEta || 1;
    const onTimeRate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((onTimeBase - delayedCount - warningCount) / onTimeBase) * 100
        )
      )
    );

    const toRiskItem = (entry, level) => {
      const r = entry?.r || entry;
      const est = entry?.est
        ? entry.est
        : r?.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      const daysOverdue = entry?.daysOverdue || 0;
      const daysUntilDue = entry?.daysUntilDue || 0;

      const ci = r?.caseInfos || {};
      const manufacturerText =
        r?.manufacturer?.organization || r?.manufacturer?.name || "";
      const title =
        (r?.title || "").trim() ||
        [ci.patientName, ci.tooth].filter(Boolean).join(" ") ||
        r?.requestId ||
        "";

      const mm = est ? String(est.getMonth() + 1).padStart(2, "0") : "";
      const dd = est ? String(est.getDate()).padStart(2, "0") : "";
      const dueLabel = est ? `${mm}/${dd}` : "";

      let message = "";
      if (level === "danger") {
        message = `예상 도착일(${dueLabel}) 기준 ${daysOverdue}일 지연 중입니다.`;
      } else {
        message = `예상 도착일(${dueLabel})이 임박했습니다. (D-${daysUntilDue})`;
      }

      return {
        id: r?.requestId,
        title,
        manufacturer: manufacturerText,
        riskLevel: level,
        status: r?.status,
        status1: r?.status1,
        status2: r?.status2,
        dueDate: est ? est.toISOString().slice(0, 10) : null,
        daysOverdue,
        daysUntilDue,
        message,
      };
    };

    const riskItems = [
      ...delayedItems
        .slice()
        .sort((a, b) => (b?.daysOverdue || 0) - (a?.daysOverdue || 0))
        .slice(0, 3)
        .map((entry) => toRiskItem(entry, "danger")),
      ...warningItems
        .slice()
        .sort((a, b) => (a?.daysUntilDue || 0) - (b?.daysUntilDue || 0))
        .slice(0, 3)
        .map((entry) => toRiskItem(entry, "warning")),
    ];

    const riskSummary = {
      delayedCount,
      warningCount,
      onTimeRate,
      items: riskItems,
    };

    const leadDays = await getDeliveryEtaLeadDays();
    const diameterStats = computeDiameterStats(abutmentRequests, leadDays);

    const recentRequests = await Promise.all(
      abutmentRequests
        .slice()
        .sort((a, b) => {
          const aDate = new Date(a.createdAt || a.updatedAt || 0).getTime();
          const bDate = new Date(b.createdAt || b.updatedAt || 0).getTime();
          return bDate - aDate;
        })
        .slice(0, 5)
        .map(async (r) => {
          const ci = r.caseInfos || {};
          const normalizedCi = await normalizeCaseInfosImplantFields(ci);
          return {
            // 기본 식별자
            _id: r._id,
            requestId: r.requestId,
            // 표시용 필드
            title: r.title,
            status: r.status,
            date: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : "",
            // 편집 다이얼로그에서 사용할 세부 정보
            patientName: ci.patientName || "",
            tooth: ci.tooth || "",
            caseInfos: normalizedCi,
            requestor: r.requestor || null,
          };
        })
    );

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalRequests: total,
          inProduction,
          inShipping,
          completed,
        },
        manufacturingSummary,
        riskSummary,
        diameterStats,
        recentRequests,
      },
    });
  } catch (error) {
    console.error("Error in getMyDashboardSummary:", error);
    return res.status(500).json({
      success: false,
      message: "대시보드 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 가격/리퍼럴 통계 (의뢰자용)
 * @route GET /api/requests/my/pricing-referral-stats
 */
async function getMyPricingReferralStats(req, res) {
  try {
    const requestorId = req.user._id;

    const now = new Date();
    const last30Cutoff = new Date(now);
    last30Cutoff.setDate(last30Cutoff.getDate() - 30);

    const myLast30DaysOrders = await Request.countDocuments({
      requestor: requestorId,
      status: "완료",
      createdAt: { $gte: last30Cutoff },
    });

    const referredUsers = await User.find({
      referredByUserId: requestorId,
      active: true,
    })
      .select({ _id: 1 })
      .lean();

    const referredUserIds = referredUsers.map((u) => u._id).filter(Boolean);

    const referralLast30DaysOrders = referredUserIds.length
      ? await Request.countDocuments({
          requestor: { $in: referredUserIds },
          status: "완료",
          createdAt: { $gte: last30Cutoff },
        })
      : 0;

    const totalOrders = myLast30DaysOrders + referralLast30DaysOrders;

    const baseUnitPrice = 15000;
    const discountPerOrder = 10;
    const maxDiscountPerUnit = 5000;
    const discountAmount = Math.min(
      totalOrders * discountPerOrder,
      maxDiscountPerUnit
    );

    const user = await User.findById(requestorId)
      .select({ createdAt: 1, updatedAt: 1, active: 1, approvedAt: 1 })
      .lean();

    let rule = "volume_discount_last30days";
    let effectiveUnitPrice = Math.max(0, baseUnitPrice - discountAmount);

    const dateSource = user || req.user;

    const baseDate =
      dateSource?.approvedAt ||
      (dateSource?.active ? dateSource?.updatedAt : null) ||
      dateSource?.createdAt;

    let fixedUntil = null;

    if (baseDate) {
      fixedUntil = new Date(baseDate);
      fixedUntil.setDate(fixedUntil.getDate() + 90);
      if (now < fixedUntil) {
        rule = "new_user_90days_fixed_10000";
        effectiveUnitPrice = 10000;
      }
    }

    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (process.env.NODE_ENV !== "production") {
      console.log("[pricing-referral-stats]", {
        requestorId: String(requestorId),
        isMockDevToken,
        now,
        baseDate,
        fixedUntil,
        userDates: user
          ? {
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
              approvedAt: user.approvedAt,
              active: user.active,
            }
          : null,
        myLast30DaysOrders,
        referralLast30DaysOrders,
        totalOrders,
        discountAmount,
        effectiveUnitPrice,
        rule,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        last30Cutoff,
        myLast30DaysOrders,
        referralLast30DaysOrders,
        totalOrders,
        baseUnitPrice,
        discountPerOrder,
        maxDiscountPerUnit,
        discountAmount,
        effectiveUnitPrice,
        rule,
        ...(process.env.NODE_ENV !== "production"
          ? {
              debug: {
                requestorId,
                isMockDevToken,
                now,
                baseDate,
                fixedUntil,
                userDates: user
                  ? {
                      createdAt: user.createdAt,
                      updatedAt: user.updatedAt,
                      approvedAt: user.approvedAt,
                      active: user.active,
                    }
                  : null,
              },
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("Error in getMyPricingReferralStats:", error);
    return res.status(500).json({
      success: false,
      message: "가격/리퍼럴 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 묶음 배송 후보 조회 (의뢰자용)
 * @route GET /api/requests/my/bulk-shipping
 */
async function getMyBulkShipping(req, res) {
  try {
    const requestorId = req.user._id;

    const requests = await Request.find({
      requestor: requestorId,
      status: { $in: ["가공전", "가공후", "배송대기"] },
    })
      .populate("requestor", "name organization")
      .sort({ createdAt: -1 })
      .lean();

    const mapItem = (r) => {
      const ci = r.caseInfos || {};
      const clinic =
        r.requestor?.organization || r.requestor?.name || req.user?.name || "";
      const maxDiameter =
        typeof ci.maxDiameter === "number"
          ? `${ci.maxDiameter}mm`
          : ci.maxDiameter != null
          ? `${Number(ci.maxDiameter)}mm`
          : "";

      return {
        id: r.requestId,
        mongoId: r._id,
        title: r.title,
        clinic,
        patient: ci.patientName || "",
        tooth: ci.tooth || "",
        diameter: maxDiameter,
        status: r.status,
        status1: r.status1,
        status2: r.status2,
        shippingMode: r.shippingMode || "normal",
        requestedShipDate: r.requestedShipDate,
      };
    };

    const pre = requests.filter((r) => r.status === "가공전").map(mapItem);
    const post = requests.filter((r) => r.status === "가공후").map(mapItem);
    const waiting = requests
      .filter((r) => r.status === "배송대기")
      .map(mapItem);

    return res.status(200).json({
      success: true,
      data: { pre, post, waiting },
    });
  } catch (error) {
    console.error("Error in getMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 후보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 묶음 배송 생성/신청 (의뢰자용)
 * @route POST /api/requests/my/bulk-shipping
 */
async function createMyBulkShipping(req, res) {
  try {
    const requestorId = req.user._id;
    const { requestIds } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    const requests = await Request.find({
      requestId: { $in: requestIds },
      requestor: requestorId,
      status: { $in: ["가공전", "가공후", "배송대기"] },
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    for (const r of requests) {
      applyStatusMapping(r, "배송대기");
      await r.save();
    }

    return res.status(200).json({
      success: true,
      message: `${requests.length}건의 의뢰가 배송대기 상태로 변경되었습니다.`,
      data: {
        updatedIds: requests.map((r) => r.requestId),
      },
    });
  } catch (error) {
    console.error("Error in createMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 신청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  createRequest,
  createRequestsFromDraft,
  hasDuplicateCase,
  getAllRequests,
  getMyRequests,
  getDiameterStats,
  getRequestById,
  updateRequest,
  updateRequestStatus,
  updateMyShippingMode,
  cloneRequestToDraft,
  addMessage,
  deleteRequest,
  getMyDashboardSummary,
  getDashboardRiskSummary,
  getMyPricingReferralStats,
  getMyBulkShipping,
  createMyBulkShipping,
};
