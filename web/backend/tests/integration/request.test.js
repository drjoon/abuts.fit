// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/tests/integration/helpers/requestFixtures.js
import { jest } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import Request from "../../models/request.model";
import DraftRequest from "../../models/draftRequest.model";
import PracticeTransfer from "../../models/practiceTransfer.model";
import LedgerJournal from "../../models/ledgerJournal.model";
import s3Utils from "../../utils/s3.utils";
import {
  CROWN_ONLY_LAB_FEE_SCHEDULE,
  TEST_IMPLANT,
  bearer,
  buildTransferBody,
  createAbutsLabAnchor,
  createAnchor,
  createLabAnchor,
  createPracticeAnchor,
  createUser,
  ensureDevopsEscrowAnchor,
  grantPaidCredit,
  seedOrderableConnection,
  seedRequest,
  sleep,
  waitFor,
} from "./helpers/requestFixtures";

// app.js는 import만 해도 Mongo 연결을 연다. 다른 스위트와 같이 지연 import한다.
let app;
beforeAll(async () => {
  ({ default: app } = await import("../../app"));
});

// 테스트는 네트워크에 나가지 않는다.
// - 공휴일 조회(krBusinessDays)는 fetch 실패 시 정적 공휴일로 폴백한다.
// - S3는 file.test.js와 같이 default export 메서드만 대체한다(여기 경로는 S3를 쓰지 않는다).
beforeEach(async () => {
  await ensureDevopsEscrowAnchor();
  jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) => {
      throw new Error(`network disabled in tests: ${String(url)}`);
    });
  jest
    .spyOn(s3Utils, "uploadFileToS3")
    .mockImplementation(async (_buffer, key) => ({
      key,
      location: `https://example.com/${key}`,
    }));
  jest
    .spyOn(s3Utils, "getSignedUrl")
    .mockImplementation(async (key) => `https://example.com/signed/${key}`);
});

// 응답 뒤 fire-and-forget(보류·채팅·알림)이 setup.js의 컬렉션 정리와 겹치지 않게 잠깐 기다린다.
afterEach(async () => {
  await sleep(150);
  jest.restoreAllMocks();
});

describe("의뢰(CA 생산의뢰) API", () => {
  let labAnchor;
  let labOwner;
  let labStaff;
  let otherLab;
  let manufacturer;
  let admin;

  beforeEach(async () => {
    labAnchor = await createLabAnchor({ name: "의뢰 기공소" });
    labOwner = await createUser({ anchor: labAnchor });
    labStaff = await createUser({ anchor: labAnchor, subRole: "staff" });
    const otherAnchor = await createLabAnchor({ name: "다른 기공소" });
    otherLab = await createUser({ anchor: otherAnchor });
    manufacturer = await createUser({ role: "manufacturer" });
    admin = await createUser({ role: "admin" });
  });

  describe("POST /api/requests/from-draft", () => {
    const buildDraft = (requestorId, overrides = {}) =>
      DraftRequest.create({
        requestor: requestorId,
        caseInfos: [
          {
            clinicName: "테스트 치과",
            patientName: "홍길동",
            tooth: "16",
            workType: "abutment",
            designSoftware: "3Shape",
            ...TEST_IMPLANT,
            ...overrides,
          },
        ],
      });

    it("Draft를 준비 단계 의뢰로 만들고 응답 뒤 크레딧을 보류한다", async () => {
      await seedOrderableConnection();
      await grantPaidCredit(labAnchor._id, 1_000_000);
      const draft = await buildDraft(labOwner.user._id);

      const res = await request(app)
        .post("/api/requests/from-draft")
        .set(bearer(labOwner.token))
        .send({ draftId: String(draft._id) })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(1);
      expect(res.body.data.requestIds).toHaveLength(1);
      expect(res.body.data.requestIds[0]).toMatch(/^\d{8}-[A-Z]{8}$/);

      const created = await Request.findById(
        res.body.data.requestMongoIds[0],
      ).lean();
      expect(created.manufacturerStage).toBe("준비");
      expect(String(created.requestor)).toBe(String(labOwner.user._id));
      expect(String(created.businessAnchorId)).toBe(String(labAnchor._id));
      expect(created.caseInfos.patientName).toBe("홍길동");
      expect(created.caseInfos.implantManufacturer).toBe(
        TEST_IMPLANT.implantManufacturer,
      );
      // 준비 단계 진입(생성) 때 로트번호를 발급한다.
      expect(created.lotNumber?.value).toBeTruthy();

      // 크레딧 보류는 201 finish 이후 비동기로 잡힌다.
      const hold = await waitFor(() =>
        LedgerJournal.findOne({
          eventType: "REQUEST_SPEND_HOLD",
          refId: created._id,
        }).lean(),
      );
      expect(hold).toBeTruthy();
      expect(String(hold.businessAnchorId)).toBe(String(labAnchor._id));
      // 보류가 실패하면 앱이 의뢰를 취소로 되돌린다. 성공했으면 준비 그대로다.
      expect((await Request.findById(created._id).lean()).manufacturerStage).toBe(
        "준비",
      );
    });

    it("크레딧이 부족하면 402로 막고 의뢰를 만들지 않는다", async () => {
      await seedOrderableConnection();
      const draft = await buildDraft(labOwner.user._id);

      const res = await request(app)
        .post("/api/requests/from-draft")
        .set(bearer(labOwner.token))
        .send({ draftId: String(draft._id) })
        .expect(402);

      expect(res.body.success).toBe(false);
      expect(res.body.data.reason).toBe("insufficient_credit");
      expect(res.body.data.machiningFee.required).toBeGreaterThan(0);
      expect(await Request.countDocuments({})).toBe(0);
    });

    it("다른 사람의 Draft로는 만들 수 없다(403)", async () => {
      const draft = await buildDraft(otherLab.user._id);
      const res = await request(app)
        .post("/api/requests/from-draft")
        .set(bearer(labOwner.token))
        .send({ draftId: String(draft._id) })
        .expect(403);
      expect(res.body.message).toBe("이 Draft에 대한 권한이 없습니다.");
    });

    it("필수 정보가 빠진 Draft는 400과 누락 항목을 돌려준다", async () => {
      await grantPaidCredit(labAnchor._id, 1_000_000);
      const draft = await buildDraft(labOwner.user._id, {
        patientName: "",
        designSoftware: "",
      });
      const res = await request(app)
        .post("/api/requests/from-draft")
        .set(bearer(labOwner.token))
        .send({ draftId: String(draft._id) })
        .expect(400);
      expect(res.body.missingFiles[0].missingFields).toEqual(
        expect.arrayContaining(["환자이름", "디자인 소프트웨어"]),
      );
    });

    it("사업자 검증 전(active)이면 유료 의뢰 가드가 403으로 막는다", async () => {
      const pendingAnchor = await createLabAnchor({ status: "active" });
      const pending = await createUser({ anchor: pendingAnchor });
      const draft = await buildDraft(pending.user._id);
      const res = await request(app)
        .post("/api/requests/from-draft")
        .set(bearer(pending.token))
        .send({ draftId: String(draft._id) })
        .expect(403);
      expect(res.body.reason).toBe("paid_services_required");
    });
  });

  describe("GET /api/requests/my (목록·페이지네이션)", () => {
    it("내 사업자 의뢰만 최신순으로 페이지를 나눠 준다", async () => {
      const base = Date.now();
      const mine = [];
      for (let i = 0; i < 3; i += 1) {
        mine.push(
          await seedRequest({
            requestor: i === 2 ? labStaff.user : labOwner.user,
            anchor: labAnchor,
            patientName: `환자${i}`,
            createdAt: new Date(base - (3 - i) * 60_000),
          }),
        );
      }
      await seedRequest({ requestor: otherLab.user, patientName: "남의환자" });

      const page1 = await request(app)
        .get("/api/requests/my")
        .query({ page: 1, limit: 2 })
        .set(bearer(labOwner.token))
        .expect(200);
      expect(page1.body.data.pagination).toEqual({
        total: 3,
        page: 1,
        limit: 2,
        pages: 2,
      });
      // 같은 사업자 직원(staff)이 만든 건도 포함, 최신순
      expect(page1.body.data.requests.map((r) => r.requestId)).toEqual([
        mine[2].requestId,
        mine[1].requestId,
      ]);

      const page2 = await request(app)
        .get("/api/requests/my")
        .query({ page: 2, limit: 2 })
        .set(bearer(labOwner.token))
        .expect(200);
      expect(page2.body.data.requests.map((r) => r.requestId)).toEqual([
        mine[0].requestId,
      ]);
    });

    it("manufacturerStage 필터를 적용한다", async () => {
      await seedRequest({ requestor: labOwner.user, anchor: labAnchor });
      const canceled = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
        manufacturerStage: "취소",
        patientName: "취소환자",
      });
      const res = await request(app)
        .get("/api/requests/my")
        .query({ manufacturerStage: "취소" })
        .set(bearer(labOwner.token))
        .expect(200);
      expect(res.body.data.requests.map((r) => r.requestId)).toEqual([
        canceled.requestId,
      ]);
    });

    it("GET /api/requests 도 의뢰자에게는 내 목록을 준다", async () => {
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });
      await seedRequest({ requestor: otherLab.user });
      const res = await request(app)
        .get("/api/requests")
        .set(bearer(labOwner.token))
        .expect(200);
      expect(res.body.data.requests.map((r) => r.requestId)).toEqual([
        mine.requestId,
      ]);
    });
  });

  describe("GET /api/requests/:id (상세·권한)", () => {
    let mine;
    beforeEach(async () => {
      mine = await seedRequest({ requestor: labOwner.user, anchor: labAnchor });
    });

    it("본인·같은 사업자 직원·제조사·관리자는 조회한다", async () => {
      for (const actor of [labOwner, labStaff, manufacturer, admin]) {
        const res = await request(app)
          .get(`/api/requests/${mine._id}`)
          .set(bearer(actor.token))
          .expect(200);
        expect(res.body.data.requestId).toBe(mine.requestId);
        expect(res.body.data.caseInfos.patientName).toBe("홍길동");
      }
    });

    it("다른 사업자 의뢰자는 403", async () => {
      const res = await request(app)
        .get(`/api/requests/${mine._id}`)
        .set(bearer(otherLab.token))
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain("홍길동");
    });

    it("잘못된 ID는 400, 없는 ID는 404", async () => {
      await request(app)
        .get("/api/requests/not-an-object-id")
        .set(bearer(labOwner.token))
        .expect(400);
      const res = await request(app)
        .get(`/api/requests/${new mongoose.Types.ObjectId()}`)
        .set(bearer(labOwner.token))
        .expect(404);
      expect(res.body.message).toBe("의뢰를 찾을 수 없습니다.");
    });
  });

  describe("PUT /api/requests/:id (수정)", () => {
    it("준비 단계에서는 caseInfos를 고치고 requestId·requestor는 무시한다", async () => {
      await seedOrderableConnection();
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });

      const res = await request(app)
        .put(`/api/requests/${mine._id}`)
        .set(bearer(labOwner.token))
        .send({
          requestId: "HIJACK",
          requestor: String(otherLab.user._id),
          caseInfos: {
            clinicName: "테스트 치과",
            patientName: "수정환자",
            tooth: "26",
            ...TEST_IMPLANT,
          },
        })
        .expect(200);
      expect(res.body.data.caseInfos.patientName).toBe("수정환자");

      const saved = await Request.findById(mine._id).lean();
      expect(saved.requestId).toBe(mine.requestId);
      expect(String(saved.requestor)).toBe(String(labOwner.user._id));
      expect(saved.caseInfos.tooth).toBe("26");
    });

    it("주문 불가 임플란트 조합으로는 고칠 수 없다(400)", async () => {
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });
      const res = await request(app)
        .put(`/api/requests/${mine._id}`)
        .set(bearer(labOwner.token))
        .send({ caseInfos: { patientName: "x", ...TEST_IMPLANT } })
        .expect(400);
      expect(res.body.message).toContain("비활성화된 임플란트 조합");
      const saved = await Request.findById(mine._id).lean();
      expect(saved.caseInfos.patientName).toBe("홍길동");
    });

    it("가공 단계부터는 임플란트 정보를 고칠 수 없다(400)", async () => {
      const machining = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
        manufacturerStage: "가공",
      });
      const res = await request(app)
        .put(`/api/requests/${machining._id}`)
        .set(bearer(labOwner.token))
        .send({ caseInfos: { ...TEST_IMPLANT, implantType: "Non-Hex" } })
        .expect(400);
      expect(res.body.message).toBe(
        "CAM 승인 후 임플란트 정보는 수정할 수 없습니다.",
      );
    });

    it("다른 사업자 의뢰자·제조사는 수정할 수 없다(403)", async () => {
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });
      for (const actor of [otherLab, manufacturer]) {
        await request(app)
          .put(`/api/requests/${mine._id}`)
          .set(bearer(actor.token))
          .send({ caseInfos: { patientName: "탈취" } })
          .expect(403);
      }
      const saved = await Request.findById(mine._id).lean();
      expect(saved.caseInfos.patientName).toBe("홍길동");
    });
  });

  describe("PATCH /api/requests/:id/status (취소·단계 변경)", () => {
    it("준비 단계 의뢰자 취소 → manufacturerStage=취소", async () => {
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });
      const res = await request(app)
        .patch(`/api/requests/${mine._id}/status`)
        .set(bearer(labOwner.token))
        .send({ manufacturerStage: "취소" })
        .expect(200);
      expect(res.body.data).toMatchObject({
        requestId: mine.requestId,
        manufacturerStage: "취소",
        cascaded: [],
      });
      const saved = await Request.findById(mine._id).lean();
      expect(saved.manufacturerStage).toBe("취소");

      // 취소 건은 목록 manufacturerStage 필터에서도 취소로 보인다.
      const list = await request(app)
        .get("/api/requests/my")
        .query({ manufacturerStage: "취소" })
        .set(bearer(labOwner.token))
        .expect(200);
      expect(list.body.data.requests.map((r) => r.requestId)).toEqual([
        mine.requestId,
      ]);
    });

    it("가공 단계는 의뢰자가 취소할 수 없다(400)", async () => {
      const machining = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
        manufacturerStage: "가공",
      });
      await request(app)
        .patch(`/api/requests/${machining._id}/status`)
        .set(bearer(labOwner.token))
        .send({ manufacturerStage: "취소" })
        .expect(400);
      const saved = await Request.findById(machining._id).lean();
      expect(saved.manufacturerStage).toBe("가공");
    });

    it("의뢰자는 취소 외 단계로 바꿀 수 없고(403), 관리자는 바꾼다", async () => {
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });
      const denied = await request(app)
        .patch(`/api/requests/${mine._id}/status`)
        .set(bearer(labOwner.token))
        .send({ manufacturerStage: "CAM" })
        .expect(403);
      expect(denied.body.message).toBe("관리자만 공정 단계를 바꿀 수 있습니다.");
      expect((await Request.findById(mine._id).lean()).manufacturerStage).toBe(
        "준비",
      );

      // 레거시 CAM 입력은 가공으로 저장한다(applyStatusMapping).
      await request(app)
        .patch(`/api/requests/${mine._id}/status`)
        .set(bearer(admin.token))
        .send({ manufacturerStage: "CAM" })
        .expect(200);
      expect((await Request.findById(mine._id).lean()).manufacturerStage).toBe(
        "가공",
      );
    });

    it("다른 사업자는 취소할 수 없다(403), 잘못된 단계는 400", async () => {
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });
      await request(app)
        .patch(`/api/requests/${mine._id}/status`)
        .set(bearer(otherLab.token))
        .send({ manufacturerStage: "취소" })
        .expect(403);
      await request(app)
        .patch(`/api/requests/${mine._id}/status`)
        .set(bearer(labOwner.token))
        .send({ manufacturerStage: "배송완료" })
        .expect(400);
      expect((await Request.findById(mine._id).lean()).manufacturerStage).toBe(
        "준비",
      );
    });

    it("PATCH /status/batch 는 권한 있는 건만 취소하고 나머지는 failed로 돌려준다", async () => {
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });
      const theirs = await seedRequest({ requestor: otherLab.user });
      const res = await request(app)
        .patch("/api/requests/status/batch")
        .set(bearer(labOwner.token))
        .send({
          manufacturerStage: "취소",
          ids: [String(mine._id), String(theirs._id)],
        })
        .expect(200);
      expect(res.body.data.canceled.map((r) => r.requestId)).toEqual([
        mine.requestId,
      ]);
      expect(res.body.data.failed).toEqual([
        { id: String(theirs._id), message: "이 의뢰의 상태를 변경할 권한이 없습니다." },
      ]);
      expect((await Request.findById(theirs._id).lean()).manufacturerStage).toBe(
        "준비",
      );
    });
  });

  describe("제조사·관리자 전용 경로", () => {
    it("의뢰자는 403, 제조사는 통과한다", async () => {
      const mine = await seedRequest({
        requestor: labOwner.user,
        anchor: labAnchor,
      });

      const denied = [
        request(app).get("/api/requests/all"),
        request(app)
          .patch(`/api/requests/${mine._id}/review-status`)
          .send({ stage: "request", status: "APPROVED" }),
        request(app)
          .post("/api/requests/shipping/register")
          .send({ requestIds: [mine.requestId] }),
        request(app).get(`/api/requests/${mine._id}/nc-file-url`),
      ];
      for (const req of denied) {
        const res = await req.set(bearer(labOwner.token)).expect(403);
        expect(res.body.success).toBe(false);
      }
      expect((await Request.findById(mine._id).lean()).manufacturerStage).toBe(
        "준비",
      );

      const all = await request(app)
        .get("/api/requests/all")
        .set(bearer(manufacturer.token))
        .expect(200);
      expect(all.body.success).toBe(true);
    });
  });
});

describe("기공의뢰(PracticeTransfer) API", () => {
  let abutsAnchor;
  let abutsLab; // internalLab(원청)
  let practiceAnchor;
  let practice;

  const createTransfer = async (body) => {
    const res = await request(app)
      .post("/api/practice/transfers")
      .set(bearer(practice.token))
      .send(body);
    if (res.status !== 201) {
      throw new Error(
        `create transfer failed ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }
    return res;
  };

  beforeEach(async () => {
    abutsAnchor = await createAbutsLabAnchor();
    abutsLab = await createUser({ role: "internalLab", anchor: abutsAnchor });
    practiceAnchor = await createPracticeAnchor();
    practice = await createUser({ anchor: practiceAnchor });
    await grantPaidCredit(practiceAnchor._id, 1_000_000);
  });

  describe("생성·조회", () => {
    it("치과가 어벗츠기공소로 보내면 원청=어벗츠, 생성 때 기공비를 보류한다", async () => {
      const body = buildTransferBody();
      const res = await createTransfer(body);

      expect(res.body.data).toMatchObject({
        transferId: body.transferId,
        matchingMode: "direct",
        count: 1,
      });
      expect(res.body.data.billing.heldTotal).toBe(60000);
      expect(res.body.data.billing.labFeeTotal).toBe(60000);

      const doc = await PracticeTransfer.findOne({
        transferId: body.transferId,
      }).lean();
      expect(String(doc.targetLabAnchorId)).toBe(String(abutsAnchor._id));
      expect(doc.targetLabName).toBe("어벗츠기공소");
      expect(doc.assigneeLabAnchorId).toBeFalsy();
      expect(doc.requestorDownloadedAt).toBeFalsy();
      expect(doc.files[0].file.s3Key).toBe(body.caseInfos[0].file.s3Key);

      const hold = await LedgerJournal.findOne({
        eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
        refId: doc._id,
      }).lean();
      expect(hold).toBeTruthy();

      const mine = await request(app)
        .get("/api/practice/transfers/my")
        .set(bearer(practice.token))
        .expect(200);
      expect(mine.body.data.requests.map((r) => r.requestId)).toContain(
        `${body.transferId}-1`,
      );

      const received = await request(app)
        .get("/api/practice/transfers/received")
        .set(bearer(abutsLab.token))
        .expect(200);
      const row = received.body.data.transfers.find(
        (t) => t.transferId === body.transferId,
      );
      expect(row).toMatchObject({
        isAccepted: false,
        status: "active",
        targetLabName: "어벗츠기공소",
      });
      expect(row.practice.businessName).toBe("테스트 치과");
      expect(received.body.data.unreadCount).toBe(1);
    });

    it("잔액이 부족하면 402로 막고 전송을 만들지 않는다", async () => {
      const poorAnchor = await createPracticeAnchor({ name: "잔액없는 치과" });
      const poor = await createUser({ anchor: poorAnchor });
      const body = buildTransferBody();
      const res = await request(app)
        .post("/api/practice/transfers")
        .set(bearer(poor.token))
        .send(body)
        .expect(402);
      expect(res.body.reason).toBe("insufficient_credit_for_practice_transfer");
      expect(res.body.required).toBe(60000);
      expect(
        await PracticeTransfer.countDocuments({ transferId: body.transferId }),
      ).toBe(0);
    });

    it("3D 스캔 파일이 없으면 400(oral_scan_required)", async () => {
      const body = buildTransferBody();
      body.caseInfos[0].file.originalName = "photo.jpg";
      const res = await request(app)
        .post("/api/practice/transfers")
        .set(bearer(practice.token))
        .send(body)
        .expect(400);
      expect(res.body.reason).toBe("oral_scan_required");
    });

    it("기공소(lab) 계정은 발신할 수 없고, 치과 계정은 수신함을 볼 수 없다(403)", async () => {
      const labAnchor = await createLabAnchor();
      const lab = await createUser({ anchor: labAnchor });
      await request(app)
        .post("/api/practice/transfers")
        .set(bearer(lab.token))
        .send(buildTransferBody())
        .expect(403);
      await request(app)
        .get("/api/practice/transfers/received")
        .set(bearer(practice.token))
        .expect(403);
    });
  });

  describe("지정 기공소(협력)", () => {
    let coopAnchor;
    let coopLab;

    beforeEach(async () => {
      coopAnchor = await createLabAnchor({
        name: "협력 기공소",
        labFeeSchedule: CROWN_ONLY_LAB_FEE_SCHEDULE,
      });
      coopLab = await createUser({ anchor: coopAnchor });
    });

    it("치과가 고른 기공소는 협력 assignee가 되고, 그 기공소만 작업시작한다", async () => {
      const body = buildTransferBody({ targetLabAnchorId: coopAnchor._id });
      await createTransfer(body);

      const doc = await PracticeTransfer.findOne({
        transferId: body.transferId,
      }).lean();
      expect(String(doc.targetLabAnchorId)).toBe(String(abutsAnchor._id));
      expect(String(doc.assigneeLabAnchorId)).toBe(String(coopAnchor._id));
      expect(doc.assigneeKind).toBe("cooperation");

      const received = await request(app)
        .get("/api/practice/transfers/received")
        .set(bearer(coopLab.token))
        .expect(200);
      const row = received.body.data.transfers.find(
        (t) => t.transferId === body.transferId,
      );
      expect(row).toMatchObject({ assigneeKind: "cooperation", isAccepted: false });

      // 협력 건: 원청(어벗츠)은 작업하지 않는다.
      const primeDenied = await request(app)
        .post(`/api/practice/transfers/${body.transferId}/mark-accepted`)
        .set(bearer(abutsLab.token))
        .send({})
        .expect(403);
      expect(primeDenied.body.message).toBe("협력 기공소가 수행하는 의뢰입니다.");
      // 협력 건은 하청으로도 넘길 수 없다.
      await request(app)
        .post(`/api/practice/transfers/${body.transferId}/open-subcontract`)
        .set(bearer(abutsLab.token))
        .expect(409);

      const accepted = await request(app)
        .post(`/api/practice/transfers/${body.transferId}/mark-accepted`)
        .set(bearer(coopLab.token))
        .send({})
        .expect(200);
      expect(accepted.body.data).toMatchObject({
        transferId: body.transferId,
        isAccepted: true,
      });
      expect(accepted.body.data.billing.labFeeTotal).toBe(60000);
      expect(accepted.body.data.billing.billedAt).toBeTruthy();

      const after = await PracticeTransfer.findById(doc._id).lean();
      expect(after.requestorDownloadedAt).toBeTruthy();
      expect(String(after.requestorDownloadedBy)).toBe(String(coopLab.user._id));
    });

    it("관계없는 기공소는 수신함에서 못 보고 작업시작도 404", async () => {
      const body = buildTransferBody({ targetLabAnchorId: coopAnchor._id });
      await createTransfer(body);

      const strangerAnchor = await createLabAnchor({
        name: "무관 기공소",
        labFeeSchedule: CROWN_ONLY_LAB_FEE_SCHEDULE,
      });
      const stranger = await createUser({ anchor: strangerAnchor });
      const received = await request(app)
        .get("/api/practice/transfers/received")
        .set(bearer(stranger.token))
        .expect(200);
      expect(received.body.data.transfers).toEqual([]);
      await request(app)
        .post(`/api/practice/transfers/${body.transferId}/mark-accepted`)
        .set(bearer(stranger.token))
        .send({})
        .expect(404);
    });
  });

  describe("어벗츠 원청 하청 풀(open/close-subcontract)", () => {
    let certifiedAnchor;
    let certifiedLab;
    let transferId;

    beforeEach(async () => {
      // 하청 풀 적격: verified + 인증(ON) + 수가 설정 기공소(원청 제외)
      certifiedAnchor = await createLabAnchor({
        name: "인증 하청 기공소",
        practiceTransferAutoMatchEnabled: true,
        labFeeSchedule: CROWN_ONLY_LAB_FEE_SCHEDULE,
      });
      certifiedLab = await createUser({ anchor: certifiedAnchor });
      const body = buildTransferBody();
      await createTransfer(body);
      transferId = body.transferId;
    });

    const openPool = (actor = abutsLab) =>
      request(app)
        .post(`/api/practice/transfers/${transferId}/open-subcontract`)
        .set(bearer(actor.token));
    const closePool = (actor = abutsLab) =>
      request(app)
        .post(`/api/practice/transfers/${transferId}/close-subcontract`)
        .set(bearer(actor.token));
    const workStart = (actor = abutsLab) =>
      request(app)
        .post(`/api/practice/transfers/${transferId}/mark-accepted`)
        .set(bearer(actor.token))
        .send({});

    it("(a) 풀을 열면 원청의 작업시작은 409, 인증 기공소 수신함에 하청대기로 보인다", async () => {
      const opened = await openPool().expect(200);
      expect(opened.body.data.manufacturerStage).toBe("하청대기");
      const doc = await PracticeTransfer.findOne({ transferId }).lean();
      expect(doc.autoMatch.subcontractPoolOpen).toBe(true);
      expect(doc.autoMatch.eligibleLabAnchorIds.map(String)).toEqual([
        String(certifiedAnchor._id),
      ]);

      const denied = await workStart().expect(409);
      expect(denied.body.message).toBe(
        "하청으로 넘긴 의뢰입니다. 하청 기공소가 작업을 시작합니다.",
      );
      const still = await PracticeTransfer.findOne({ transferId }).lean();
      expect(still.requestorDownloadedAt).toBeFalsy();
      expect(still.autoMatch.subcontractPoolOpen).toBe(true);

      // 이미 열린 풀은 다시 열 수 없다.
      await openPool().expect(409);

      const pool = await request(app)
        .get("/api/practice/transfers/received")
        .set(bearer(certifiedLab.token))
        .expect(200);
      const row = pool.body.data.transfers.find((t) => t.transferId === transferId);
      expect(row).toBeTruthy();
      expect(row.isAccepted).toBe(false);
    });

    it("(b) 풀을 닫으면 200, 원청 작업시작이 다시 된다", async () => {
      await openPool().expect(200);
      const closed = await closePool().expect(200);
      expect(closed.body.data.manufacturerStage).not.toBe("하청대기");
      const doc = await PracticeTransfer.findOne({ transferId }).lean();
      expect(doc.autoMatch.subcontractPoolOpen).toBe(false);
      expect(doc.autoMatch.eligibleLabAnchorIds).toBeUndefined();

      // 닫힌 풀은 다시 닫을 수 없다.
      await closePool().expect(409);

      const accepted = await workStart().expect(200);
      expect(accepted.body.data.isAccepted).toBe(true);
      expect(accepted.body.data.billing.labFeeTotal).toBe(60000);
      const after = await PracticeTransfer.findOne({ transferId }).lean();
      expect(after.requestorDownloadedAt).toBeTruthy();
      expect(after.assigneeLabAnchorId).toBeFalsy();
    });

    it("(c) 원청이 작업시작한 뒤에는 하청 풀을 열 수 없다(409)", async () => {
      await workStart().expect(200);
      const res = await openPool().expect(409);
      expect(res.body.message).toBe(
        "하청 전환 권한이 없거나 이미 하청이 진행 중입니다.",
      );
      const doc = await PracticeTransfer.findOne({ transferId }).lean();
      expect(doc.autoMatch?.subcontractPoolOpen).toBeFalsy();
    });

    it("인증 기공소가 풀에서 작업시작하면 하청 assignee가 되고 풀이 닫힌다", async () => {
      await openPool().expect(200);
      const claimed = await workStart(certifiedLab).expect(200);
      expect(claimed.body.data.isAccepted).toBe(true);

      const doc = await PracticeTransfer.findOne({ transferId }).lean();
      expect(String(doc.assigneeLabAnchorId)).toBe(String(certifiedAnchor._id));
      expect(doc.assigneeKind).toBe("subcontract");
      expect(doc.autoMatch.subcontractPoolOpen).toBe(false);

      // 하청이 가져간 뒤 원청은 풀을 닫을 수 없다.
      await closePool().expect(409);
    });

    it("풀 여닫기는 어벗츠기공소(internalLab)만 한다(일반 기공소 403)", async () => {
      await openPool(certifiedLab).expect(403);
      await openPool().expect(200);
      await closePool(certifiedLab).expect(403);
      const doc = await PracticeTransfer.findOne({ transferId }).lean();
      expect(doc.autoMatch.subcontractPoolOpen).toBe(true);
    });

    it("적격 인증 기공소가 없으면 풀을 열지 않는다(409)", async () => {
      await mongoose
        .model("BusinessAnchor")
        .updateOne(
          { _id: certifiedAnchor._id },
          { $set: { practiceTransferAutoMatchEnabled: false } },
        );
      const res = await openPool().expect(409);
      expect(res.body.message).toBe(
        "인증 협력 기공소가 없어 하청 풀을 열 수 없습니다.",
      );
    });
  });
});

describe("인증 가드", () => {
  const someId = new mongoose.Types.ObjectId().toString();
  const cases = [
    ["get", "/api/requests/my"],
    ["get", "/api/requests"],
    ["post", "/api/requests/from-draft"],
    ["get", `/api/requests/${someId}`],
    ["put", `/api/requests/${someId}`],
    ["patch", `/api/requests/${someId}/status`],
    ["post", "/api/practice/transfers"],
    ["get", "/api/practice/transfers/my"],
    ["get", "/api/practice/transfers/received"],
    ["post", "/api/practice/transfers/PTX-X/mark-accepted"],
    ["post", "/api/practice/transfers/PTX-X/open-subcontract"],
    ["post", "/api/practice/transfers/PTX-X/close-subcontract"],
  ];

  it.each(cases)("%s %s 토큰 없음 → 401", async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: "인증 토큰이 필요합니다.",
    });
  });

  it("위조 토큰 → 401", async () => {
    const res = await request(app)
      .get("/api/requests/my")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
    expect(res.headers["x-abuts-auth-reason"]).toBe("token_verification_failed");
  });

  it("비활성 계정 토큰 → 401", async () => {
    const anchor = await createAnchor({ requestorKind: "lab" });
    const inactive = await createUser({ anchor, active: false });
    const res = await request(app)
      .get("/api/requests/my")
      .set(bearer(inactive.token));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("비활성화된 계정입니다.");
  });
});
