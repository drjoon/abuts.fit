import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import BonusGrant from "../../models/bonusGrant.model.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import { emitReferralMembershipChanged } from "../../services/requestSnapshotTriggers.service.js";

/**
 * 관리자: BusinessAnchor에 연결된 사용자 목록 조회
 * - 삭제 전 확인용
 */
export async function getBusinessAnchorLinkedUsers(req, res) {
  try {
    const { id } = req.params;

    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 BusinessAnchor ID입니다.",
      });
    }

    const businessAnchor = await BusinessAnchor.findById(id);
    if (!businessAnchor) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const businessAnchorId = businessAnchor._id;

    // 연결된 사용자 목록 조회
    const users = await User.find({
      businessAnchorId: businessAnchorId,
    })
      .select({
        _id: 1,
        name: 1,
        email: 1,
        role: 1,
        subRole: 1,
        createdAt: 1,
      })
      .lean();

    // 관련 의뢰 수 확인
    const linkedRequestCount = await Request.countDocuments({
      businessAnchorId: businessAnchorId,
    });

    // 하위 소개 사업자(자식 anchor) 확인
    const childAnchorCount = await BusinessAnchor.countDocuments({
      referredByAnchorId: businessAnchorId,
    });

    return res.status(200).json({
      success: true,
      data: {
        businessAnchor: {
          _id: String(businessAnchor._id),
          name: businessAnchor.name,
          companyName:
            businessAnchor.metadata?.companyName || businessAnchor.name,
          businessNumber: businessAnchor.metadata?.businessNumber || "",
          businessType: businessAnchor.businessType,
        },
        users: users.map((u) => ({
          _id: String(u._id),
          name: u.name,
          email: u.email,
          role: u.role,
          subRole: u.subRole,
          isOwner: u.subRole === "owner",
          isStaff: u.subRole === "staff",
        })),
        stats: {
          userCount: users.length,
          requestCount: linkedRequestCount,
          childAnchorCount,
        },
      },
    });
  } catch (error) {
    console.error("[adminBusiness] getBusinessAnchorLinkedUsers error:", error);
    return res.status(500).json({
      success: false,
      message: "연결된 사용자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 관리자: BusinessAnchor 삭제 (연결된 사용자 함께 삭제)
 * - 하위 소개 사업자가 없을 경우에만 삭제 가능
 * - BusinessAnchor 문서 삭제
 * - 연결된 모든 User 문서 삭제
 * - 관련 의뢰의 businessAnchorId는 null로 설정 (의뢰 자체는 보존)
 */
export async function deleteBusinessAnchor(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;

    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 BusinessAnchor ID입니다.",
      });
    }

    const businessAnchor = await BusinessAnchor.findById(id);
    if (!businessAnchor) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const businessAnchorId = businessAnchor._id;
    const referredByAnchorId = businessAnchor.referredByAnchorId;

    // 1. 연결된 사용자 목록 조회
    const linkedUsers = await User.find({
      businessAnchorId: businessAnchorId,
    })
      .select({ _id: 1, name: 1, email: 1 })
      .lean();

    const linkedUserIds = linkedUsers.map((u) => u._id);

    // 2. 관련 의뢰 수 확인
    const linkedRequestCount = await Request.countDocuments({
      businessAnchorId: businessAnchorId,
    });

    // 3. 하위 소개 사업자(자식 anchor) 확인
    const childAnchorCount = await BusinessAnchor.countDocuments({
      referredByAnchorId: businessAnchorId,
    });

    if (childAnchorCount > 0) {
      return res.status(400).json({
        success: false,
        message: `이 사업자를 소개한 하위 사업자가 ${childAnchorCount}개 존재하여 삭제할 수 없습니다. 하위 사업자를 먼저 처리하세요.`,
      });
    }

    // 4. 연결된 사용자들 삭제 (하드 삭제)
    let deletedUsers = 0;
    if (linkedUserIds.length > 0) {
      const deleteUsersResult = await User.deleteMany({
        _id: { $in: linkedUserIds },
      });
      deletedUsers = deleteUsersResult.deletedCount || 0;
    }

    // 5. 의뢰의 businessAnchorId 참조 제거 (의뢰 자체는 보존)
    if (linkedRequestCount > 0) {
      await Request.updateMany(
        { businessAnchorId: businessAnchorId },
        {
          $set: {
            businessAnchorId: null,
            businessId: null, // 레거시 필드도 정리
          },
        },
      );
    }

    // 6. BusinessAnchor 삭제
    await BusinessAnchor.deleteOne({ _id: businessAnchorId });

    // 7. 소개 관계 변경 이벤트 emit (상위 소개자가 있다면)
    if (
      referredByAnchorId &&
      Types.ObjectId.isValid(String(referredByAnchorId))
    ) {
      emitReferralMembershipChanged(
        String(referredByAnchorId),
        "admin-delete-business-anchor",
      );
    }

    return res.status(200).json({
      success: true,
      message: "사업자와 연결된 사용자가 성공적으로 삭제되었습니다.",
      data: {
        deletedBusinessAnchorId: String(businessAnchorId),
        deletedUserCount: deletedUsers,
        deletedUsers: linkedUsers.map((u) => ({
          _id: String(u._id),
          name: u.name,
          email: u.email,
        })),
        unlinkedRequests: linkedRequestCount,
        deletedBy: adminId,
      },
    });
  } catch (error) {
    console.error("[adminBusiness] deleteBusinessAnchor error:", error);
    return res.status(500).json({
      success: false,
      message: "사업자 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
