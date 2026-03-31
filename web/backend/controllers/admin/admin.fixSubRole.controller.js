import User from "../../models/user.model.js";

export async function fixSubRole(req, res) {
  try {
    // businessAnchorId가 있지만 subRole이 null인 사용자 찾기
    const usersWithoutSubRole = await User.find({
      businessAnchorId: { $ne: null },
      subRole: null,
    }).select({ _id: 1, email: 1, role: 1, businessAnchorId: 1, subRole: 1 });

    console.log(`[fixSubRole] subRole이 null인 사용자: ${usersWithoutSubRole.length}명`);

    if (usersWithoutSubRole.length > 0) {
      console.log("[fixSubRole] 수정할 사용자 목록:");
      usersWithoutSubRole.forEach((user) => {
        console.log(`- ${user.email} (${user.role})`);
      });

      // subRole을 'owner'로 업데이트
      const result = await User.updateMany(
        {
          businessAnchorId: { $ne: null },
          subRole: null,
        },
        {
          $set: { subRole: "owner" },
        }
      );

      console.log(
        `[fixSubRole] ✅ ${result.modifiedCount}명의 사용자 subRole을 'owner'로 업데이트했습니다.`
      );

      return res.json({
        success: true,
        message: `${result.modifiedCount}명의 사용자 subRole을 'owner'로 업데이트했습니다.`,
        data: {
          modifiedCount: result.modifiedCount,
          users: usersWithoutSubRole.map((u) => ({
            email: u.email,
            role: u.role,
          })),
        },
      });
    } else {
      console.log("[fixSubRole] 모든 사용자의 subRole이 정상적으로 설정되어 있습니다.");
      return res.json({
        success: true,
        message: "모든 사용자의 subRole이 정상적으로 설정되어 있습니다.",
        data: {
          modifiedCount: 0,
          users: [],
        },
      });
    }
  } catch (error) {
    console.error("[fixSubRole] 오류 발생:", error);
    return res.status(500).json({
      success: false,
      message: "subRole 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
