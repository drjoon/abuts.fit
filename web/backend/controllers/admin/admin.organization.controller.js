import Business from "../../models/business.model.js";

export async function adminOverrideOrganizationVerification(req, res) {
  try {
    const orgId = req.params.id;
    const verified = Boolean(req.body?.verified);
    const message = String(req.body?.message || "").trim();

    const org = await Business.findById(orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "조직을 찾을 수 없습니다.",
      });
    }

    org.verification = {
      verified,
      provider: "admin-override",
      message,
      checkedAt: new Date(),
    };
    await org.save();

    return res.json({
      success: true,
      data: {
        businessId: org._id,
        verification: org.verification,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "검증 상태를 업데이트하지 못했습니다.",
      error: error.message,
    });
  }
}
