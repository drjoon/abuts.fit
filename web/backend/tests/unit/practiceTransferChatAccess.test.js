// related files:
// - web/backend/utils/practiceTransferChatAccess.js
import {
  canAccessPracticeTransferChat,
  canJoinPracticeTransferAsLabPeer,
  canJoinPracticeTransferAsPracticePeer,
} from "../../utils/practiceTransferChatAccess.js";

const practiceAnchorId = "64a000000000000000000001";
const labAnchorId = "64a000000000000000000002";
const senderId = "64b000000000000000000001";
const practiceStaffId = "64b000000000000000000002";
const labStaffId = "64b000000000000000000003";
const otherLabStaffId = "64b000000000000000000004";

const transferDoc = {
  practiceUserId: senderId,
  practiceBusinessAnchorId: practiceAnchorId,
  targetLabAnchorId: labAnchorId,
  requestorDownloadedBy: labStaffId,
  requestorReadBy: labStaffId,
};

describe("practiceTransferChatAccess", () => {
  test("requestor 치과 작성자는 레거시 practice role이 아니어도 참여", () => {
    expect(
      canJoinPracticeTransferAsPracticePeer({
        currentUserId: senderId,
        currentUserRole: "requestor",
        currentUserBusinessAnchorId: practiceAnchorId,
        transferDoc,
      }),
    ).toBe(true);
  });

  test("requestor 치과 동료는 동일 practiceBusinessAnchorId면 참여", () => {
    expect(
      canJoinPracticeTransferAsPracticePeer({
        currentUserId: practiceStaffId,
        currentUserRole: "requestor",
        currentUserBusinessAnchorId: practiceAnchorId,
        transferDoc,
      }),
    ).toBe(true);
  });

  test("기공소 requestor는 치과 peer로 참여하지 않음", () => {
    expect(
      canJoinPracticeTransferAsPracticePeer({
        currentUserId: labStaffId,
        currentUserRole: "requestor",
        currentUserBusinessAnchorId: labAnchorId,
        transferDoc,
      }),
    ).toBe(false);
  });

  test("지정 기공소 구성원은 수락 후 lab peer로 참여", () => {
    expect(
      canJoinPracticeTransferAsLabPeer({
        currentUserId: labStaffId,
        currentUserRole: "requestor",
        currentUserBusinessAnchorId: labAnchorId,
        transferDoc,
      }),
    ).toBe(true);
  });

  test("다른 기공소 구성원은 lab peer가 아님", () => {
    expect(
      canJoinPracticeTransferAsLabPeer({
        currentUserId: otherLabStaffId,
        currentUserRole: "requestor",
        currentUserBusinessAnchorId: "64a000000000000000000099",
        transferDoc,
      }),
    ).toBe(false);
  });

  test("수락 담당자는 참여자가 아니어도 접근 가능", () => {
    expect(
      canAccessPracticeTransferChat({
        currentUserId: labStaffId,
        currentUserRole: "requestor",
        currentUserBusinessAnchorId: labAnchorId,
        transferDoc,
      }),
    ).toBe(true);
  });

  test("하청 assignee 기공소 구성원은 lab peer", () => {
    expect(
      canJoinPracticeTransferAsLabPeer({
        currentUserId: otherLabStaffId,
        currentUserRole: "requestor",
        currentUserBusinessAnchorId: "64a000000000000000000099",
        transferDoc: {
          ...transferDoc,
          assigneeLabAnchorId: "64a000000000000000000099",
        },
      }),
    ).toBe(true);
  });

  test("internalLab 원청 팀원은 lab peer", () => {
    expect(
      canJoinPracticeTransferAsLabPeer({
        currentUserId: labStaffId,
        currentUserRole: "internalLab",
        currentUserBusinessAnchorId: labAnchorId,
        transferDoc,
      }),
    ).toBe(true);
  });
});
