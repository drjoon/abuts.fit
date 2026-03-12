import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import {
  normalizeCaseInfosImplantFields,
  computePriceForRequest,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  normalizeKoreanBusinessDay,
  buildRequestorOrgScopeFilter,
  normalizeRequestStage,
  REQUEST_STAGE_ORDER,
  canAccessRequestAsRequestor,
} from "./utils.js";
import { checkCreditLock } from "../../utils/creditLock.util.js";
import {
  buildStandardStlFileName,
  uploadS3ToRhinoServer,
  uploadToRhinoServer,
} from "./creation.helpers.controller.js";
import { getRequestorOrgId } from "./utils.js";
import { calculateInitialProductionSchedule } from "./production.utils.js";
import { getManufacturerLeadTimesUtil } from "../organizations/leadTime.controller.js";

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
            "사업자 소속 정보가 필요합니다. 설정 > 사업자에서 소속을 먼저 확인해주세요.",
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
                  "사업자 소속 정보가 필요합니다. 설정 > 사업자에서 소속을 먼저 확인해주세요.",
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
            const implantBrand = String(
              normalizedCaseInfos.implantBrand || "",
            ).trim();
            const implantFamily = String(
              normalizedCaseInfos.implantFamily || "",
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
            if (
              !implantManufacturer ||
              !implantBrand ||
              !implantFamily ||
              !implantType
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "커스텀 어벗 의뢰의 경우 임플란트 Manufacturer/Brand/Family/Type은 모두 필수입니다.",
              });
            }

            const computedPrice = await computePriceForRequest({
              requestorId: req.user._id,
              requestorOrgId: req.user?.businessId,
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
              requestorBusinessId:
                req.user?.role === "requestor" && req.user?.businessId
                  ? req.user.businessId
                  : null,
              price: computedPrice,
            });
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
                  "사업자 소속 정보가 필요합니다. 설정 > 사업자에서 소속을 먼저 확인해주세요.",
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
            const implantBrand = String(
              normalizedCaseInfos.implantBrand || "",
            ).trim();
            const implantFamily = String(
              normalizedCaseInfos.implantFamily || "",
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

            if (
              !implantManufacturer ||
              !implantBrand ||
              !implantFamily ||
              !implantType
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "커스텀 어벗 의뢰의 경우 임플란트 Manufacturer/Brand/Family/Type은 모두 필수입니다.",
              });
            }

            const computedPrice = await computePriceForRequest({
              requestorId: req.user._id,
              requestorOrgId: req.user?.businessId,
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
              requestorBusinessId:
                req.user?.role === "requestor" && req.user?.businessId
                  ? req.user.businessId
                  : null,
              price: computedPrice,
            });
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
    const implantBrand = (normalizedCaseInfos.implantBrand || "").trim();
    const implantFamily = (normalizedCaseInfos.implantFamily || "").trim();
    const implantType = (normalizedCaseInfos.implantType || "").trim();

    if (!patientName || !tooth || !clinicName) {
      return res.status(400).json({
        success: false,
        message: "치과이름, 환자이름, 치아번호는 모두 필수입니다.",
      });
    }

    if (
      !implantManufacturer ||
      !implantBrand ||
      !implantFamily ||
      !implantType
    ) {
      return res.status(400).json({
        success: false,
        message:
          "커스텀 어벗 의뢰의 경우 임플란트 Manufacturer/Brand/Family/Type은 모두 필수입니다.",
      });
    }

    const computedPrice = await computePriceForRequest({
      requestorId: req.user._id,
      requestorOrgId: req.user?.businessId,
      clinicName,
      patientName,
      tooth,
    });

    const shippingMode = bodyRest.shippingMode || "normal";
    const requestedAt = new Date();

    // 의뢰 본문에서 caManufacturer 필드를 받거나, 기본값 사용
    const caManufacturerFromBody = bodyRest.caManufacturer;

    const newRequest = new Request({
      ...bodyRest,
      caseInfos: normalizedCaseInfos,
      requestor: req.user._id,
      requestorBusinessId:
        req.user?.role === "requestor" && req.user?.businessId
          ? req.user.businessId
          : null,
      caManufacturer:
        req.user?.role === "manufacturer"
          ? req.user._id
          : caManufacturerFromBody || undefined,
      price: computedPrice,
    });

    console.log("[CreateRequest] New request created:", {
      requestId: newRequest.requestId,
      userRole: req.user?.role,
      userId: req.user?._id,
      caManufacturer: newRequest.caManufacturer,
      manufacturerStage: newRequest.manufacturerStage,
    });

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
    const tStart = Date.now();
    console.debug("[BulkCreate] start", { at: new Date().toISOString() });
    // 권한 및 조직/크레딧 검사
    if (req.user?.role === "requestor") {
      const orgId = getRequestorOrgId(req);
      if (!orgId || !Types.ObjectId.isValid(orgId)) {
        return res.status(403).json({
          success: false,
          message:
            "사업자 소속 정보가 필요합니다. 설정 > 사업자에서 소속을 먼저 확인해주세요.",
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

    const tLead0 = Date.now();
    // 제조사 리드타임 1회 로드 (정적 import)
    const manufacturerSettings = await getManufacturerLeadTimesUtil();
    const leadTimes = manufacturerSettings?.leadTimes || {};
    console.debug("[BulkCreate] leadTimes loaded", { ms: Date.now() - tLead0 });
    const enableDuplicateRequestCheck = Boolean(
      req.body && req.body.enableDuplicateRequestCheck,
    );
    const duplicateResolutions = Array.isArray(req.body?.duplicateResolutions)
      ? req.body.duplicateResolutions
          .filter((r) => r && typeof r === "object")
          .map((r) => ({
            caseId: String(r.caseId || "").trim(),
            strategy: String(r.strategy || "").trim(),
            existingRequestId: String(r.existingRequestId || "").trim(),
          }))
      : null;
    const resolutionsByCaseId = new Map();

    if (duplicateResolutions) {
      for (const r of duplicateResolutions) {
        const strategy = String(r.strategy || "").trim();
        if (!strategy) continue;
        if (!["skip", "replace", "remake"].includes(strategy)) {
          return res.status(400).json({
            success: false,
            message: "유효하지 않은 duplicateResolutions.strategy 입니다.",
          });
        }
        resolutionsByCaseId.set(String(r.caseId || ""), r);
      }
    }

    if (enableDuplicateRequestCheck) {
      // 1) 사전 중복 검사: 동일 clinic/patient/tooth 이 기존 DB에 존재하면 409 반환
      try {
        const requestFilter = await buildRequestorOrgScopeFilter(req);
        const keyTuplesRaw = items
          .map((raw, idx) => {
            const ci = raw?.caseInfos || {};
            return {
              caseId: String(idx),
              fileName: ci?.originalName || ci?.file?.originalName,
              clinicName: String(ci?.clinicName || "").trim(),
              patientName: String(ci?.patientName || "").trim(),
              tooth: String(ci?.tooth || "").trim(),
            };
          })
          .filter((k) => k.clinicName && k.patientName && k.tooth);

        // 제출 payload 내부 중복도 차단
        const tupleByKey = new Map();
        const duplicateInPayload = [];
        for (const item of keyTuplesRaw) {
          const key = `${item.clinicName}|${item.patientName}|${item.tooth}`;
          if (!tupleByKey.has(key)) tupleByKey.set(key, item);
          else duplicateInPayload.push(item);
        }
        if (duplicateInPayload.length > 0) {
          return res.status(400).json({
            success: false,
            code: "DUPLICATE_IN_PAYLOAD",
            message:
              "제출한 의뢰 목록에 동일한 치과/환자/치아 조합이 중복되었습니다. 중복 항목을 제거하고 다시 제출해주세요.",
            data: {
              duplicates: duplicateInPayload.map((d) => ({
                caseId: d.caseId,
                clinicName: d.clinicName,
                patientName: d.patientName,
                tooth: d.tooth,
              })),
            },
          });
        }

        const keyTuples = Array.from(tupleByKey.values());
        if (keyTuples.length > 0) {
          const orConditions = keyTuples.map((k) => ({
            "caseInfos.clinicName": k.clinicName,
            "caseInfos.patientName": k.patientName,
            "caseInfos.tooth": k.tooth,
          }));
          const query = {
            $and: [
              requestFilter,
              { manufacturerStage: { $ne: "취소" } },
              { $or: orConditions },
            ],
          };
          const candidates = await Request.find(query)
            .select({
              _id: 1,
              requestId: 1,
              manufacturerStage: 1,
              createdAt: 1,
              price: 1,
              "caseInfos.clinicName": 1,
              "caseInfos.patientName": 1,
              "caseInfos.tooth": 1,
            })
            .sort({ createdAt: -1 })
            .lean();

          const latestByKey = new Map();
          for (const doc of candidates || []) {
            const ci = doc?.caseInfos || {};
            const key = `${String(ci.clinicName || "").trim()}|${String(
              ci.patientName || "",
            ).trim()}|${String(ci.tooth || "").trim()}`;
            if (!latestByKey.has(key)) latestByKey.set(key, doc);
          }

          const duplicates = [];
          for (const item of keyTuples) {
            const key = `${item.clinicName}|${item.patientName}|${item.tooth}`;
            const existing = latestByKey.get(key);
            if (!existing) continue;
            const stage = normalizeRequestStage(existing);
            const stageOrder = REQUEST_STAGE_ORDER[stage] ?? 0;
            duplicates.push({
              caseId: item.caseId,
              fileName: item.fileName,
              existingRequest: {
                _id: String(existing._id),
                requestId: String(existing.requestId || ""),
                manufacturerStage: String(existing.manufacturerStage || ""),
                price: existing.price || null,
                createdAt: existing.createdAt || null,
                caseInfos: {
                  clinicName: String(existing?.caseInfos?.clinicName || ""),
                  patientName: String(existing?.caseInfos?.patientName || ""),
                  tooth: String(existing?.caseInfos?.tooth || ""),
                },
              },
              stageOrder,
            });
          }

          if (duplicates.length > 0) {
            const st = String(
              duplicates[0]?.existingRequest?.manufacturerStage || "",
            );
            const mode = st === "추적관리" ? "tracking" : "active";
            return res.status(409).json({
              success: false,
              code: "DUPLICATE_REQUEST",
              message:
                st === "추적관리"
                  ? "동일한 정보의 의뢰가 이미 완료되어 있습니다. 재의뢰(리메이크)로 접수할까요?"
                  : "동일한 정보의 의뢰가 이미 진행 중입니다. 기존 의뢰를 취소하고 다시 의뢰할까요?",
              data: { mode, duplicates },
            });
          }
        }
      } catch (e) {
        console.error("[BulkCreate] duplicate precheck failed:", e);
        // 안전상 실패 시 중복 체크를 건너뛰지 않고 일반 에러로 반환
        return res.status(500).json({
          success: false,
          message: "중복 의뢰 사전 검사 중 오류가 발생했습니다.",
          error: e?.message || String(e),
        });
      }
    }

    const created = [];
    const errors = [];
    const perItemStats = [];
    const LOG_PER_ITEM = String(process.env.BULK_LOG_PER_ITEM || "0") === "1";

    // 공통 요청 시간과 캐시(스케줄/예상일) 준비
    const requestedAtBatch = new Date();
    const scheduleCache = new Map();
    const estimateCache = new Map();

    // 제한 동시 처리로 전체 시간 단축 (운영은 기본 더 보수적으로)
    const env = String(process.env.NODE_ENV || "").trim();
    const DEFAULT_CONCURRENCY = env === "production" ? 2 : 4;
    const CONCURRENCY = Math.min(
      6,
      Math.max(
        1,
        Number(process.env.BULK_CREATE_CONCURRENCY) || DEFAULT_CONCURRENCY,
      ),
    );
    console.debug("[BulkCreate] processing", {
      count: items.length,
      concurrency: CONCURRENCY,
    });

    let cursor = 0;
    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        const raw = items[i] || {};
        try {
          const iStart = Date.now();
          const { caseInfos, ...rest } = raw;
          if (!caseInfos || typeof caseInfos !== "object") {
            throw new Error("caseInfos 객체가 필요합니다.");
          }

          const patientName = String(caseInfos.patientName || "").trim();
          const tooth = String(caseInfos.tooth || "").trim();
          const clinicName = String(caseInfos.clinicName || "").trim();
          const workType = String(caseInfos.workType || "abutment").trim();
          if (workType !== "abutment") {
            throw new Error(
              "현재는 커스텀 어벗먼트 의뢰만 등록할 수 있습니다.",
            );
          }

          const tNorm0 = Date.now();
          const normalizedCaseInfos =
            await normalizeCaseInfosImplantFields(caseInfos);
          const implantManufacturer = String(
            normalizedCaseInfos.implantManufacturer || "",
          ).trim();
          const implantBrand = String(
            normalizedCaseInfos.implantBrand || "",
          ).trim();
          const implantFamily = String(
            normalizedCaseInfos.implantFamily || "",
          ).trim();
          const implantType = String(
            normalizedCaseInfos.implantType || "",
          ).trim();
          const fileMeta = raw?.file;
          if (!fileMeta?.s3Key) {
            throw new Error("STL 파일 정보(file.s3Key)가 필요합니다.");
          }
          if (
            !implantManufacturer ||
            !implantBrand ||
            !implantFamily ||
            !implantType
          ) {
            throw new Error(
              "커스텀 어벗 의뢰의 경우 임플란트 Manufacturer/Brand/Family/Type은 모두 필수입니다.",
            );
          }
          if (fileMeta?.s3Key) {
            const originalName = String(
              fileMeta.originalName || fileMeta.name || "",
            ).trim();
            normalizedCaseInfos.file = {
              originalName: originalName || "file.stl",
              fileSize: Number(fileMeta.size) || undefined,
              fileType:
                String(fileMeta.mimetype || fileMeta.fileType || "") ||
                "application/octet-stream",
              s3Key: fileMeta.s3Key,
              s3Url: fileMeta.s3Url || undefined,
              uploadedAt: new Date(),
            };
          }
          const normMs = Date.now() - tNorm0;

          if (!patientName || !tooth || !clinicName) {
            throw new Error("치과이름, 환자이름, 치아번호는 모두 필수입니다.");
          }
          if (
            !implantManufacturer ||
            !implantBrand ||
            !implantFamily ||
            !implantType
          ) {
            throw new Error(
              "커스텀 어벗 의뢰의 경우 임플란트 Manufacturer/Brand/Family/Type은 모두 필수입니다.",
            );
          }

          const tPrice0 = Date.now();
          const duplicateResolution = resolutionsByCaseId.get(String(i));
          const resolutionStrategy = String(
            duplicateResolution?.strategy || "",
          ).trim();
          let existingRequestForResolution = null;
          let forceNewOrderPricing = false;

          if (
            duplicateResolution &&
            (resolutionStrategy === "replace" ||
              resolutionStrategy === "remake")
          ) {
            existingRequestForResolution = await Request.findById(
              duplicateResolution.existingRequestId,
            )
              .select({
                _id: 1,
                requestId: 1,
                requestor: 1,
                requestorBusinessId: 1,
                manufacturerStage: 1,
              })
              .populate("requestor", "_id businessId");

            if (!existingRequestForResolution) {
              throw new Error("기존 의뢰를 찾을 수 없습니다.");
            }
            if (
              !(await canAccessRequestAsRequestor(
                req,
                existingRequestForResolution,
              ))
            ) {
              throw new Error("기존 의뢰에 접근 권한이 없습니다.");
            }

            const existingStage = String(
              existingRequestForResolution.manufacturerStage || "",
            ).trim();
            const currentStageOrder = REQUEST_STAGE_ORDER[existingStage] ?? 0;

            if (resolutionStrategy === "replace") {
              if (existingStage === "추적관리") {
                throw new Error(
                  "완료된 의뢰는 새 의뢰로 교체할 수 없습니다. 재의뢰로 진행해주세요.",
                );
              }
              if (currentStageOrder > 1) {
                throw new Error(
                  "생산 이후 단계에서는 기존 의뢰를 교체할 수 없습니다.",
                );
              }
              forceNewOrderPricing = true;
            }
          }

          const computedPrice = await computePriceForRequest({
            requestorId: req.user._id,
            requestorOrgId: req.user?.businessId,
            clinicName,
            patientName,
            tooth,
            forceNewOrderPricing,
          });
          const priceMs = Date.now() - tPrice0;

          const shippingMode = rest.shippingMode || "normal";
          const requestedAt = requestedAtBatch;
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
            requestorBusinessId:
              req.user?.role === "requestor" && req.user?.businessId
                ? req.user.businessId
                : null,
            price: computedPrice,
          });

          if (
            resolutionStrategy === "remake" &&
            existingRequestForResolution?.requestId
          ) {
            newRequest.referenceIds = Array.from(
              new Set([
                ...(newRequest.referenceIds || []),
                String(existingRequestForResolution.requestId),
              ]),
            );
          }

          newRequest.originalShipping = { mode: shippingMode, requestedAt };
          newRequest.shippingMode = shippingMode; // legacy
          newRequest.finalShipping = {
            mode: shippingMode,
            updatedAt: requestedAt,
          };

          const tSched0 = Date.now();
          const weekly =
            shippingMode === "normal" ? requestorWeeklyBatchDays : [];
          const schedKey = JSON.stringify({
            shippingMode,
            maxDiameter: normalizedCaseInfos?.maxDiameter,
            requestedAt: toKstYmd(requestedAt),
            weekly,
          });
          let productionSchedule = scheduleCache.get(schedKey);
          if (!productionSchedule) {
            productionSchedule = await calculateInitialProductionSchedule({
              shippingMode,
              maxDiameter: normalizedCaseInfos?.maxDiameter,
              requestedAt,
              weeklyBatchDays: weekly,
            });
            scheduleCache.set(schedKey, productionSchedule);
          }
          const scheduleMs = Date.now() - tSched0;
          newRequest.productionSchedule = productionSchedule;

          const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
          const pickupYmd = productionSchedule?.scheduledShipPickup
            ? toKstYmd(productionSchedule.scheduledShipPickup)
            : null;
          let estimatedShipYmdRaw;
          let estimateMs = 0;
          if (pickupYmd) {
            estimatedShipYmdRaw = pickupYmd;
          } else {
            const tEst0 = Date.now();
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
            const estKey = `${diameterKey}|${createdYmd}`;
            const cachedEst = estimateCache.get(estKey);
            if (cachedEst) {
              estimatedShipYmdRaw = cachedEst; // already normalized ymd
            } else {
              const added = await addKoreanBusinessDays({
                startYmd: createdYmd,
                days: leadDays,
              });
              estimatedShipYmdRaw = added;
            }
            estimateMs = Date.now() - tEst0;
          }

          const tNormBiz0 = Date.now();
          let estimatedShipYmd = await normalizeKoreanBusinessDay({
            ymd: estimatedShipYmdRaw,
          });
          // 캐시에 최종 정규화 결과 저장 (pickup 경로 포함)
          if (!pickupYmd) {
            const d =
              typeof normalizedCaseInfos?.maxDiameter === "number" &&
              !isNaN(normalizedCaseInfos?.maxDiameter)
                ? normalizedCaseInfos.maxDiameter
                : 8;
            let diameterKey = "d8";
            if (d <= 6) diameterKey = "d6";
            else if (d <= 8) diameterKey = "d8";
            else if (d <= 10) diameterKey = "d10";
            else diameterKey = "d12";
            const estKey = `${diameterKey}|${createdYmd}`;
            estimateCache.set(estKey, estimatedShipYmd);
          }
          estimateMs += Date.now() - tNormBiz0;
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

          const tSave0 = Date.now();
          await newRequest.save();
          const saveMs = Date.now() - tSave0;

          if (
            resolutionStrategy === "replace" &&
            existingRequestForResolution &&
            String(existingRequestForResolution.manufacturerStage || "") !==
              "취소"
          ) {
            existingRequestForResolution.manufacturerStage = "취소";
            await existingRequestForResolution.save();
          }

          if (normalizedCaseInfos?.file?.s3Key) {
            const bgFileName = buildStandardStlFileName({
              requestId: newRequest.requestId,
              clinicName,
              patientName,
              tooth,
              originalFileName: normalizedCaseInfos.file.originalName,
            });
            newRequest.caseInfos.file.filePath = bgFileName;
            await Request.updateOne(
              { _id: newRequest._id },
              { $set: { "caseInfos.file.filePath": bgFileName } },
            );
            uploadS3ToRhinoServer(
              normalizedCaseInfos.file.s3Key,
              bgFileName,
            ).catch((err) =>
              console.error(
                `[Rhino-Parallel-Upload] Failed for request ${newRequest.requestId}: ${err.message}`,
              ),
            );
          }

          const totalMs = Date.now() - iStart;
          perItemStats.push({
            i,
            normMs,
            priceMs,
            scheduleMs,
            estimateMs,
            saveMs,
            totalMs,
          });
          if (LOG_PER_ITEM) {
            console.debug("[BulkCreate:item]", {
              i,
              normMs,
              priceMs,
              scheduleMs,
              estimateMs,
              saveMs,
              totalMs,
            });
          }
          created.push(newRequest);
        } catch (e) {
          errors.push({
            index: i,
            item: raw,
            message: e?.message || String(e),
          });
        }
      }
    };

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    console.debug("[BulkCreate] done", {
      created: created.length,
      errors: errors.length,
      ms: Date.now() - tStart,
    });

    if (perItemStats.length > 0) {
      const agg = perItemStats.reduce(
        (a, s) => {
          a.norm += s.normMs;
          a.price += s.priceMs;
          a.schedule += s.scheduleMs;
          a.estimate += s.estimateMs;
          a.save += s.saveMs;
          a.total += s.totalMs;
          a.maxNorm = Math.max(a.maxNorm, s.normMs);
          a.maxPrice = Math.max(a.maxPrice, s.priceMs);
          a.maxSchedule = Math.max(a.maxSchedule, s.scheduleMs);
          a.maxEstimate = Math.max(a.maxEstimate, s.estimateMs);
          a.maxSave = Math.max(a.maxSave, s.saveMs);
          a.maxTotal = Math.max(a.maxTotal, s.totalMs);
          a.count += 1;
          return a;
        },
        {
          norm: 0,
          price: 0,
          schedule: 0,
          estimate: 0,
          save: 0,
          total: 0,
          maxNorm: 0,
          maxPrice: 0,
          maxSchedule: 0,
          maxEstimate: 0,
          maxSave: 0,
          maxTotal: 0,
          count: 0,
        },
      );
      const avg = (v) => Math.round((v / Math.max(1, agg.count)) * 100) / 100;
      console.debug("[BulkCreate] stats", {
        count: agg.count,
        avgMs: {
          norm: avg(agg.norm),
          price: avg(agg.price),
          schedule: avg(agg.schedule),
          estimate: avg(agg.estimate),
          save: avg(agg.save),
          total: avg(agg.total),
        },
        maxMs: {
          norm: agg.maxNorm,
          price: agg.maxPrice,
          schedule: agg.maxSchedule,
          estimate: agg.maxEstimate,
          save: agg.maxSave,
          total: agg.maxTotal,
        },
      });
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
