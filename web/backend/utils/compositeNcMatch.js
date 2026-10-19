import Request from "../models/request.model.js";
import {
  compositeStepsMatch,
  ncOwnerRequestId,
  readStampedCompositeSteps,
  resolveEffectiveCompositeSteps,
} from "./compositeStepIncrement.js";

async function stepsBakedIntoNc(ncFile, selfRequestId) {
  const stamped = readStampedCompositeSteps(ncFile);
  if (stamped) return stamped;

  const ownerId = ncOwnerRequestId(ncFile, selfRequestId);
  const self = String(selfRequestId || "").trim().toLowerCase();
  if (!ownerId || ownerId.toLowerCase() === self) return null;

  const owner = await Request.findOne({ requestId: ownerId })
    .select({
      "caseInfos.retentionGroove": 1,
      "caseInfos.compositeStepIncrementPostOverrideMm": 1,
      "caseInfos.compositeStepIncrementGingivaOverrideMm": 1,
      "caseInfos.ncFile.compositeStepPostMm": 1,
      "caseInfos.ncFile.compositeStepGingivaMm": 1,
    })
    .lean();
  if (!owner) return { missingOwner: true };
  return (
    readStampedCompositeSteps(owner?.caseInfos?.ncFile) ||
    resolveEffectiveCompositeSteps(owner?.caseInfos)
  );
}

/** 카드의 포스트·치은 피치와 NC에 구워진 피치가 다르면 true. */
export async function compositeNcIsStale(request) {
  const nc = request?.caseInfos?.ncFile;
  if (!nc?.s3Key && !nc?.filePath && !nc?.fileName) return false;
  const effective = resolveEffectiveCompositeSteps(request?.caseInfos);
  const baked = await stepsBakedIntoNc(nc, request?.requestId);
  if (!baked) return false;
  if (baked.missingOwner) return true;
  return !compositeStepsMatch(baked, effective);
}

/** 다른 카드 NC를 떼고, 이 의뢰의 피치로 Esprit를 다시 돌린다. */
export async function regenerateCompositeNc(request) {
  const id = request?._id;
  if (!id) return;
  await Request.updateOne(
    { _id: id },
    {
      $unset: { "caseInfos.ncFile": 1, "caseInfos.espFile": 1 },
      $set: {
        "productionSchedule.ncPreload": {
          status: "GENERATING",
          updatedAt: new Date(),
        },
      },
    },
  );
  const fresh = await Request.findById(id);
  if (!fresh) return;
  const { triggerEspritForNc } = await import(
    "../controllers/requests/common.review.esprit.js"
  );
  await triggerEspritForNc({ request: fresh, force: true });
}
