import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import {
  normalizeCaseInfosImplantFields,
  computePriceForRequest,
  ensureLotNumberForMachining,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  normalizeKoreanBusinessDay,
} from "./utils.js";
import { checkCreditLock } from "../../utils/creditLock.util.js";
import {
  buildStandardStlFileName,
  uploadToRhinoServer,
} from "./creation.helpers.controller.js";
import { getRequestorOrgId } from "./utils.js";

/**
 * 새 의뢰 생성
 * @route POST /api/requests
 */
export async function createRequest(req, res) {
  try {
    if (req.user?.role === "requestor") {
      const orgId = getRequestorOrgId(req);
      if (!orgId || !Types.ObjectId.isValid(orgId)) {
        return res.status(403).json({
          success: false,
          message:
            "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
        });
      }

      /**
       * 다건 의뢰 생성 (배치)
       * @route POST /api/requests/bulk
       */
      async function createRequestsBulk(req, res) {
        try {
          if (req.user?.role === "requestor") {
            const orgId = getRequestorOrgId(req);
            if (!orgId || !Types.ObjectId.isValid(orgId)) {
              return res.status(403).json({
                success: false,
                message:
                  "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
              });
            }

            const lockStatus = await checkCreditLock(orgId);
            if (lockStatus.isLocked) {
              return res.status(403).json({
                success: false,
                message: `크레딧 사용이 제한되었습니다. 사유: ${lockStatus.reason}`,
                lockedAt: lockStatus.lockedAt,
              });
            }
          }

          const items = Array.isArray(req.body?.items) ? req.body.items : null;
          if (!items || items.length === 0) {
            return res
              .status(400)
              .json({ success: false, message: "items 배열이 필요합니다." });
          }

          // 요청자 weeklyBatchDays는 한 번만 조회
          let requestorWeeklyBatchDays = [];
          try {
            const orgId = getRequestorOrgId(req);
            if (orgId && Types.ObjectId.isValid(orgId)) {
              const org = await RequestorOrganization.findById(orgId)
                .select({ "shippingPolicy.weeklyBatchDays": 1 })
                .lean();
              requestorWeeklyBatchDays = Array.isArray(
                org?.shippingPolicy?.weeklyBatchDays,
              )
                ? org.shippingPolicy.weeklyBatchDays
                : [];
            }
          } catch {
            // pass; scheduler validates per item
          }

          // 제조사 리드타임 한 번만 로드
          const { getManufacturerLeadTimesUtil } =
            await import("./production.utils.js").then(
              () => import("../organizations/leadTime.controller.js"),
            );
          const manufacturerSettings = await getManufacturerLeadTimesUtil();
          const leadTimes = manufacturerSettings?.leadTimes || {};

          const created = [];

          for (const raw of items) {
            const { caseInfos, ...rest } = raw || {};
            if (!caseInfos || typeof caseInfos !== "object") {
              return res.status(400).json({
                success: false,
                message: "caseInfos 객체가 필요합니다.",
              });
            }

            const patientName = String(caseInfos.patientName || "").trim();
            const tooth = String(caseInfos.tooth || "").trim();
            const clinicName = String(caseInfos.clinicName || "").trim();
            const workType = String(caseInfos.workType || "abutment").trim();
            if (workType !== "abutment") {
              return res.status(400).json({
                success: false,
                message: "현재는 커스텀 어벗먼트 의뢰만 등록할 수 있습니다.",
              });
            }

            const normalizedCaseInfos =
              await normalizeCaseInfosImplantFields(caseInfos);
            const implantManufacturer = String(
              normalizedCaseInfos.implantManufacturer || "",
            ).trim();
            const implantSystem = String(
              normalizedCaseInfos.implantSystem || "",
            ).trim();
            const implantType = String(
              normalizedCaseInfos.implantType || "",
            ).trim();

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
              requestorOrgId: req.user?.organizationId,
              clinicName,
              patientName,
              tooth,
            });

            const shippingMode = rest.shippingMode || "normal";
            const requestedAt = new Date();
            if (
              shippingMode === "normal" &&
              requestorWeeklyBatchDays.length === 0
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "묶음 배송 요일을 설정해주세요. 설정 > 배송에서 요일을 선택 후 다시 시도하세요.",
              });
            }

            const newRequest = new Request({
              ...rest,
              caseInfos: normalizedCaseInfos,
              requestor: req.user._id,
              requestorOrganizationId:
                req.user?.role === "requestor" && req.user?.organizationId
                  ? req.user.organizationId
                  : null,
              price: computedPrice,
            });

            await ensureLotNumberForMachining(newRequest);
            newRequest.originalShipping = { mode: shippingMode, requestedAt };
            newRequest.shippingMode = shippingMode; // legacy
            newRequest.finalShipping = {
              mode: shippingMode,
              updatedAt: requestedAt,
            };

            const { calculateInitialProductionSchedule } =
              await import("./production.utils.js");
            const productionSchedule = await calculateInitialProductionSchedule(
              {
                shippingMode,
                maxDiameter: normalizedCaseInfos?.maxDiameter,
                requestedAt,
                weeklyBatchDays:
                  shippingMode === "normal" ? requestorWeeklyBatchDays : [],
              },
            );
            newRequest.productionSchedule = productionSchedule;

            const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
            const pickupYmd = productionSchedule?.scheduledShipPickup
              ? toKstYmd(productionSchedule.scheduledShipPickup)
              : null;
            let estimatedShipYmdRaw;
            if (pickupYmd) {
              estimatedShipYmdRaw = pickupYmd;
            } else {
              const maxDiameter = normalizedCaseInfos?.maxDiameter;
              const d =
                typeof maxDiameter === "number" && !isNaN(maxDiameter)
                  ? maxDiameter
                  : 8;
              let diameterKey = "d8";
              if (d <= 6) diameterKey = "d6";
              else if (d <= 8) diameterKey = "d8";
              else if (d <= 10) diameterKey = "d10";
              else diameterKey = "d12";
              const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;
              estimatedShipYmdRaw = await addKoreanBusinessDays({
                startYmd: createdYmd,
                days: leadDays,
              });
            }

            const estimatedShipYmd = await normalizeKoreanBusinessDay({
              ymd: estimatedShipYmdRaw,
            });
            newRequest.timeline = newRequest.timeline || {};
            newRequest.timeline.estimatedShipYmd = estimatedShipYmd;

            newRequest.caseInfos = newRequest.caseInfos || {};
            if (newRequest.caseInfos?.file?.s3Key) {
              newRequest.caseInfos.reviewByStage =
                newRequest.caseInfos.reviewByStage || {};
              newRequest.caseInfos.reviewByStage.request = {
                status: "PENDING",
                updatedAt: new Date(),
                updatedBy: req.user?._id,
                reason: "",
              };
            }

            await newRequest.save();
            created.push(newRequest);
          }

          res.status(201).json({
            success: true,
            message: "의뢰가 성공적으로 등록되었습니다.",
            data: created,
          });
        } catch (error) {
          console.error("Error in createRequestsBulk:", error);
          res.status(500).json({
            success: false,
            message: "의뢰 등록 중 오류가 발생했습니다.",
            error: error.message,
          });
        }
      }

      /**
       * (legacy-local) 다건 의뢰 생성 정의가 잘못 위치했던 문제를 방지하기 위해 네임 변경
       * 실제 엔드포인트는 모듈 스코프의 createRequestsBulk를 사용
       */
      async function createRequestsBulkLegacy(req, res) {
        try {
          if (req.user?.role === "requestor") {
            const orgId = getRequestorOrgId(req);
            if (!orgId || !Types.ObjectId.isValid(orgId)) {
              return res.status(403).json({
                success: false,
                message:
                  "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
              });
            }

            const lockStatus = await checkCreditLock(orgId);
            if (lockStatus.isLocked) {
              return res.status(403).json({
                success: false,
                message: `크레딧 사용이 제한되었습니다. 사유: ${lockStatus.reason}`,
                lockedAt: lockStatus.lockedAt,
              });
            }
          }

          const items = Array.isArray(req.body?.items) ? req.body.items : null;
          if (!items || items.length === 0) {
            return res.status(400).json({
              success: false,
              message: "items 배열이 필요합니다.",
            });
          }

          // 요청자 weeklyBatchDays는 한 번만 조회
          let requestorWeeklyBatchDays = [];
          try {
            const orgId = getRequestorOrgId(req);
            if (orgId && Types.ObjectId.isValid(orgId)) {
              const org = await RequestorOrganization.findById(orgId)
                .select({ "shippingPolicy.weeklyBatchDays": 1 })
                .lean();
              requestorWeeklyBatchDays = Array.isArray(
                org?.shippingPolicy?.weeklyBatchDays,
              )
                ? org.shippingPolicy.weeklyBatchDays
                : [];
            }
          } catch (e) {
            // pass; scheduler will validate later per item
          }

          // 제조사 리드타임도 한 번만 로드
          const { getManufacturerLeadTimesUtil } =
            await import("./production.utils.js").then(
              () => import("../organizations/leadTime.controller.js"),
            );
          const manufacturerSettings = await getManufacturerLeadTimesUtil();
          const leadTimes = manufacturerSettings?.leadTimes || {};

          const created = [];

          for (const raw of items) {
            const { caseInfos, ...rest } = raw || {};

            if (!caseInfos || typeof caseInfos !== "object") {
              return res.status(400).json({
                success: false,
                message: "caseInfos 객체가 필요합니다.",
              });
            }

            const patientName = String(caseInfos.patientName || "").trim();
            const tooth = String(caseInfos.tooth || "").trim();
            const clinicName = String(caseInfos.clinicName || "").trim();
            const workType = String(caseInfos.workType || "abutment").trim();

            if (workType !== "abutment") {
              return res.status(400).json({
                success: false,
                message: "현재는 커스텀 어벗먼트 의뢰만 등록할 수 있습니다.",
              });
            }

            const normalizedCaseInfos =
              await normalizeCaseInfosImplantFields(caseInfos);

            const implantManufacturer = String(
              normalizedCaseInfos.implantManufacturer || "",
            ).trim();
            const implantSystem = String(
              normalizedCaseInfos.implantSystem || "",
            ).trim();
            const implantType = String(
              normalizedCaseInfos.implantType || "",
            ).trim();

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
              requestorOrgId: req.user?.organizationId,
              clinicName,
              patientName,
              tooth,
            });

            const shippingMode = rest.shippingMode || "normal";
            const requestedAt = new Date();

            if (
              shippingMode === "normal" &&
              requestorWeeklyBatchDays.length === 0
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "묶음 배송 요일을 설정해주세요. 설정 > 배송에서 요일을 선택 후 다시 시도하세요.",
              });
            }

            const newRequest = new Request({
              ...rest,
              caseInfos: normalizedCaseInfos,
              requestor: req.user._id,
              requestorOrganizationId:
                req.user?.role === "requestor" && req.user?.organizationId
                  ? req.user.organizationId
                  : null,
              price: computedPrice,
            });

            await ensureLotNumberForMachining(newRequest);

            newRequest.originalShipping = { mode: shippingMode, requestedAt };
            newRequest.shippingMode = shippingMode; // legacy
            newRequest.finalShipping = {
              mode: shippingMode,
              updatedAt: requestedAt,
            };

            const { calculateInitialProductionSchedule } =
              await import("./production.utils.js");
            const productionSchedule = await calculateInitialProductionSchedule(
              {
                shippingMode,
                maxDiameter: normalizedCaseInfos?.maxDiameter,
                requestedAt,
                weeklyBatchDays:
                  shippingMode === "normal" ? requestorWeeklyBatchDays : [],
              },
            );
            newRequest.productionSchedule = productionSchedule;

            const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
            const pickupYmd = productionSchedule?.scheduledShipPickup
              ? toKstYmd(productionSchedule.scheduledShipPickup)
              : null;

            let estimatedShipYmdRaw;
            if (pickupYmd) {
              estimatedShipYmdRaw = pickupYmd;
            } else {
              const maxDiameter = normalizedCaseInfos?.maxDiameter;
              const d =
                typeof maxDiameter === "number" && !isNaN(maxDiameter)
                  ? maxDiameter
                  : 8;
              let diameterKey = "d8";
              if (d <= 6) diameterKey = "d6";
              else if (d <= 8) diameterKey = "d8";
              else if (d <= 10) diameterKey = "d10";
              else diameterKey = "d12";

              const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;
              estimatedShipYmdRaw = await addKoreanBusinessDays({
                startYmd: createdYmd,
                days: leadDays,
              });
            }

            const estimatedShipYmd = await normalizeKoreanBusinessDay({
              ymd: estimatedShipYmdRaw,
            });
            newRequest.timeline = newRequest.timeline || {};
            newRequest.timeline.estimatedShipYmd = estimatedShipYmd;

            newRequest.caseInfos = newRequest.caseInfos || {};
            if (newRequest.caseInfos?.file?.s3Key) {
              newRequest.caseInfos.reviewByStage =
                newRequest.caseInfos.reviewByStage || {};
              newRequest.caseInfos.reviewByStage.request = {
                status: "PENDING",
                updatedAt: new Date(),
                updatedBy: req.user?._id,
                reason: "",
              };
            }

            await newRequest.save();

            created.push(newRequest);
          }

          res.status(201).json({
            success: true,
            message: "의뢰가 성공적으로 등록되었습니다.",
            data: created,
          });
        } catch (error) {
          console.error("Error in createRequestsBulk:", error);
          res.status(500).json({
            success: false,
            message: "의뢰 등록 중 오류가 발생했습니다.",
            error: error.message,
          });
        }
      }

      // 크레딧 lock 체크
      const lockStatus = await checkCreditLock(orgId);
      if (lockStatus.isLocked) {
        return res.status(403).json({
          success: false,
          message: `크레딧 사용이 제한되었습니다. 사유: ${lockStatus.reason}`,
          lockedAt: lockStatus.lockedAt,
        });
      }
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

    const normalizedCaseInfos =
      await normalizeCaseInfosImplantFields(caseInfos);
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
      requestorOrgId: req.user?.organizationId,
      clinicName,
      patientName,
      tooth,
    });

    const shippingMode = bodyRest.shippingMode || "normal";
    const requestedAt = new Date();

    const newRequest = new Request({
      ...bodyRest,
      caseInfos: normalizedCaseInfos,
      requestor: req.user._id,
      requestorOrganizationId:
        req.user?.role === "requestor" && req.user?.organizationId
          ? req.user.organizationId
          : null,
      price: computedPrice,
    });

    await ensureLotNumberForMachining(newRequest);

    // 원본 배송 옵션 저장
    newRequest.originalShipping = {
      mode: shippingMode,
      requestedAt,
    };

    // 레거시 호환
    newRequest.shippingMode = shippingMode;

    // 최종 배송 옵션 초기화 (처음에는 원본과 동일)
    newRequest.finalShipping = {
      mode: shippingMode,
      updatedAt: requestedAt,
    };

    // 생산 스케줄 계산 (시각 기반)
    const { calculateInitialProductionSchedule } =
      await import("./production.utils.js");
    // Fetch requestor weeklyBatchDays
    let requestorWeeklyBatchDays = [];
    try {
      const orgId = getRequestorOrgId(req);
      if (orgId && Types.ObjectId.isValid(orgId)) {
        const org = await RequestorOrganization.findById(orgId)
          .select({ "shippingPolicy.weeklyBatchDays": 1 })
          .lean();
        requestorWeeklyBatchDays = Array.isArray(
          org?.shippingPolicy?.weeklyBatchDays,
        )
          ? org.shippingPolicy.weeklyBatchDays
          : [];
      }
    } catch (e) {
      // handled by scheduler validation
    }

    if (shippingMode === "normal" && requestorWeeklyBatchDays.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "묶음 배송 요일을 설정해주세요. 설정 > 배송에서 요일을 선택 후 다시 시도하세요.",
      });
    }

    const productionSchedule = await calculateInitialProductionSchedule({
      shippingMode,
      maxDiameter: normalizedCaseInfos?.maxDiameter,
      requestedAt,
      weeklyBatchDays:
        shippingMode === "normal" ? requestorWeeklyBatchDays : [],
    });
    newRequest.productionSchedule = productionSchedule;

    // 발송 예정일 (YYYY-MM-DD, KST)
    const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
    const pickupYmd = productionSchedule?.scheduledShipPickup
      ? toKstYmd(productionSchedule.scheduledShipPickup)
      : null;

    let estimatedShipYmdRaw;
    if (pickupYmd) {
      estimatedShipYmdRaw = pickupYmd;
    } else {
      // Use manufacturer lead times based on diameter
      const { getManufacturerLeadTimesUtil } =
        await import("./production.utils.js").then(
          () => import("../organizations/leadTime.controller.js"),
        );
      const manufacturerSettings = await getManufacturerLeadTimesUtil();
      const leadTimes = manufacturerSettings?.leadTimes || {};

      const maxDiameter = normalizedCaseInfos?.maxDiameter;
      const d =
        typeof maxDiameter === "number" && !isNaN(maxDiameter)
          ? maxDiameter
          : 8;
      let diameterKey = "d8";
      if (d <= 6) diameterKey = "d6";
      else if (d <= 8) diameterKey = "d8";
      else if (d <= 10) diameterKey = "d10";
      else diameterKey = "d12";

      const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;

      estimatedShipYmdRaw = await addKoreanBusinessDays({
        startYmd: createdYmd,
        days: leadDays,
      });
    }

    const estimatedShipYmd = await normalizeKoreanBusinessDay({
      ymd: estimatedShipYmdRaw,
    });
    newRequest.timeline = newRequest.timeline || {};
    newRequest.timeline.estimatedShipYmd = estimatedShipYmd;

    newRequest.caseInfos = newRequest.caseInfos || {};
    if (newRequest.caseInfos?.file?.s3Key) {
      newRequest.caseInfos.reviewByStage =
        newRequest.caseInfos.reviewByStage || {};
      newRequest.caseInfos.reviewByStage.request = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
    }

    // [변경] 생산 시작(CAM 승인) 시점에 크레딧을 차감하므로, 의뢰 생성 시점의 SPEND 로직을 제거합니다.
    await newRequest.save();

    // [추가] Rhino 서버 업로드 시도 (병렬 처리)
    // S3 업로드 여부와 상관없이 Rhino 서버로 파일을 보내 즉시 처리를 시작하게 함
    if (newRequest.caseInfos?.file?.originalName && req.file?.buffer) {
      // 표준 파일명 생성: requestId_clinicName_patientName_tooth.ext
      const bgFileName = buildStandardStlFileName({
        requestId: newRequest.requestId,
        clinicName,
        patientName,
        tooth,
        originalFileName: newRequest.caseInfos.file.originalName,
      });

      // 즉시 실행 (응답을 기다리지 않음)
      uploadToRhinoServer(req.file.buffer, bgFileName).catch((e) =>
        console.error(`[Rhino-Direct-Upload] Failed: ${e.message}`),
      );

      // DB에 로컬 경로 정보 업데이트
      newRequest.caseInfos.file.filePath = bgFileName;
      await newRequest.save();
    }

    res.status(201).json({
      success: true,
      message: " 의뢰가 성공적으로 등록되었습니다.",
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
 * 다건 의뢰 생성 (배치) - 부분 성공 지원
 * 성공/실패를 개별 수집하여 함께 반환합니다.
 * @route POST /api/requests/bulk
 */
export async function createRequestsBulk(req, res) {
  try {
    // 권한 및 조직/크레딧 검사
    if (req.user?.role === "requestor") {
      const orgId = getRequestorOrgId(req);
      if (!orgId || !Types.ObjectId.isValid(orgId)) {
        return res.status(403).json({
          success: false,
          message:
            "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
        });
      }
      const lockStatus = await checkCreditLock(orgId);
      if (lockStatus.isLocked) {
        return res.status(403).json({
          success: false,
          message: `크레딧 사용이 제한되었습니다. 사유: ${lockStatus.reason}`,
          lockedAt: lockStatus.lockedAt,
        });
      }
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "items 배열이 필요합니다." });
    }

    // 요청자 weeklyBatchDays 1회 조회
    let requestorWeeklyBatchDays = [];
    try {
      const orgId = getRequestorOrgId(req);
      if (orgId && Types.ObjectId.isValid(orgId)) {
        const org = await RequestorOrganization.findById(orgId)
          .select({ "shippingPolicy.weeklyBatchDays": 1 })
          .lean();
        requestorWeeklyBatchDays = Array.isArray(
          org?.shippingPolicy?.weeklyBatchDays,
        )
          ? org.shippingPolicy.weeklyBatchDays
          : [];
      }
    } catch {}

    // 제조사 리드타임 1회 로드
    const { getManufacturerLeadTimesUtil } =
      await import("./production.utils.js").then(
        () => import("../organizations/leadTime.controller.js"),
      );
    const manufacturerSettings = await getManufacturerLeadTimesUtil();
    const leadTimes = manufacturerSettings?.leadTimes || {};

    const created = [];
    const errors = [];

    // 개별 항목 처리 (부분 성공 수집)
    for (let i = 0; i < items.length; i += 1) {
      const raw = items[i] || {};
      try {
        const { caseInfos, ...rest } = raw;
        if (!caseInfos || typeof caseInfos !== "object") {
          throw new Error("caseInfos 객체가 필요합니다.");
        }

        const patientName = String(caseInfos.patientName || "").trim();
        const tooth = String(caseInfos.tooth || "").trim();
        const clinicName = String(caseInfos.clinicName || "").trim();
        const workType = String(caseInfos.workType || "abutment").trim();
        if (workType !== "abutment") {
          throw new Error("현재는 커스텀 어벗먼트 의뢰만 등록할 수 있습니다.");
        }

        const normalizedCaseInfos =
          await normalizeCaseInfosImplantFields(caseInfos);
        const implantManufacturer = String(
          normalizedCaseInfos.implantManufacturer || "",
        ).trim();
        const implantSystem = String(
          normalizedCaseInfos.implantSystem || "",
        ).trim();
        const implantType = String(
          normalizedCaseInfos.implantType || "",
        ).trim();

        if (!patientName || !tooth || !clinicName) {
          throw new Error("치과이름, 환자이름, 치아번호는 모두 필수입니다.");
        }
        if (!implantManufacturer || !implantSystem || !implantType) {
          throw new Error(
            "커스텀 어벗 의뢰의 경우 임플란트 제조사/시스템/유형은 모두 필수입니다.",
          );
        }

        const computedPrice = await computePriceForRequest({
          requestorId: req.user._id,
          requestorOrgId: req.user?.organizationId,
          clinicName,
          patientName,
          tooth,
        });

        const shippingMode = rest.shippingMode || "normal";
        const requestedAt = new Date();
        if (
          shippingMode === "normal" &&
          requestorWeeklyBatchDays.length === 0
        ) {
          throw new Error(
            "묶음 배송 요일을 설정해주세요. 설정 > 배송에서 요일을 선택 후 다시 시도하세요.",
          );
        }

        const newRequest = new Request({
          ...rest,
          caseInfos: normalizedCaseInfos,
          requestor: req.user._id,
          requestorOrganizationId:
            req.user?.role === "requestor" && req.user?.organizationId
              ? req.user.organizationId
              : null,
          price: computedPrice,
        });

        await ensureLotNumberForMachining(newRequest);
        newRequest.originalShipping = { mode: shippingMode, requestedAt };
        newRequest.shippingMode = shippingMode; // legacy
        newRequest.finalShipping = {
          mode: shippingMode,
          updatedAt: requestedAt,
        };

        const { calculateInitialProductionSchedule } =
          await import("./production.utils.js");
        const productionSchedule = await calculateInitialProductionSchedule({
          shippingMode,
          maxDiameter: normalizedCaseInfos?.maxDiameter,
          requestedAt,
          weeklyBatchDays:
            shippingMode === "normal" ? requestorWeeklyBatchDays : [],
        });
        newRequest.productionSchedule = productionSchedule;

        const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
        const pickupYmd = productionSchedule?.scheduledShipPickup
          ? toKstYmd(productionSchedule.scheduledShipPickup)
          : null;
        let estimatedShipYmdRaw;
        if (pickupYmd) {
          estimatedShipYmdRaw = pickupYmd;
        } else {
          const maxDiameter = normalizedCaseInfos?.maxDiameter;
          const d =
            typeof maxDiameter === "number" && !isNaN(maxDiameter)
              ? maxDiameter
              : 8;
          let diameterKey = "d8";
          if (d <= 6) diameterKey = "d6";
          else if (d <= 8) diameterKey = "d8";
          else if (d <= 10) diameterKey = "d10";
          else diameterKey = "d12";
          const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;
          estimatedShipYmdRaw = await addKoreanBusinessDays({
            startYmd: createdYmd,
            days: leadDays,
          });
        }

        const estimatedShipYmd = await normalizeKoreanBusinessDay({
          ymd: estimatedShipYmdRaw,
        });
        newRequest.timeline = newRequest.timeline || {};
        newRequest.timeline.estimatedShipYmd = estimatedShipYmd;

        newRequest.caseInfos = newRequest.caseInfos || {};
        if (newRequest.caseInfos?.file?.s3Key) {
          newRequest.caseInfos.reviewByStage =
            newRequest.caseInfos.reviewByStage || {};
          newRequest.caseInfos.reviewByStage.request = {
            status: "PENDING",
            updatedAt: new Date(),
            updatedBy: req.user?._id,
            reason: "",
          };
        }

        await newRequest.save();
        created.push(newRequest);
      } catch (e) {
        errors.push({ index: i, item: raw, message: e?.message || String(e) });
      }
    }

    if (created.length > 0 && errors.length === 0) {
      return res.status(201).json({ success: true, data: created });
    }
    if (created.length > 0 && errors.length > 0) {
      return res
        .status(207)
        .json({ success: true, partial: true, data: created, errors });
    }
    return res
      .status(400)
      .json({ success: false, message: "모든 항목이 실패했습니다.", errors });
  } catch (error) {
    console.error("Error in createRequestsBulk:", error);
    res.status(500).json({
      success: false,
      message: "의뢰 등록 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
