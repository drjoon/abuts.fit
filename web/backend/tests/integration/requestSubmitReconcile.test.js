// related files:
// - web/backend/services/requestSubmitIntegrity.service.js
import Request from "../../models/request.model";
import {
  createLabAnchor,
  createUser,
  seedRequest,
} from "./helpers/requestFixtures";
import { runRequestSubmitReconcilePass } from "../../services/requestSubmitIntegrity.service";

describe("접수 후처리 복구(runRequestSubmitReconcilePass)", () => {
  it("2분 넘은 준비 의뢰의 출고일 스케줄을 채우고, 다른 productionSchedule 키는 지우지 않는다", async () => {
    const anchor = await createLabAnchor({ name: "복구 기공소" });
    const owner = await createUser({ anchor });
    const old = await seedRequest({
      requestor: owner.user,
      anchor,
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    // 트리거는 이미 돈 상태(FAILED는 재트리거 대상 아님)
    await Request.updateOne(
      { _id: old._id },
      {
        $set: {
          "caseInfos.file.s3Key": "temp/reconcile.stl",
          "caseInfos.file.filePath": "reconcile.stl",
          "productionSchedule.stlPreload": { status: "FAILED", updatedAt: new Date() },
        },
      },
    );
    const fresh = await seedRequest({
      requestor: owner.user,
      anchor,
      tooth: "17",
      createdAt: new Date(),
    });
    await Request.updateOne(
      { _id: fresh._id },
      { $set: { "caseInfos.file.s3Key": "temp/fresh.stl" } },
    );

    const summary = await runRequestSubmitReconcilePass({ limit: 20 });
    expect(summary.schedule).toBe(1);
    // FAILED(수동 중단·JS 실패)는 자동으로 다시 돌리지 않는다.
    expect(summary.stl).toBe(0);

    const after = await Request.findById(old._id).lean();
    expect(after.productionSchedule.scheduledShipPickup).toBeTruthy();
    expect(after.productionSchedule.stlPreload.status).toBe("FAILED");

    // 방금 접수된 건(진행 중 후처리)은 건드리지 않는다.
    const untouched = await Request.findById(fresh._id).lean();
    expect(untouched.productionSchedule?.scheduledShipPickup).toBeFalsy();
  });
});
