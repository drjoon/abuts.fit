// related files:
// - web/backend/services/adminNewMembers.core.js
// - web/backend/controllers/admin/admin.newMembers.controller.js
import User from "../models/user.model.js";
import {
  NEW_MEMBER_LIST_LIMIT,
  NEW_MEMBER_VISIBLE_DAYS,
  buildNewMemberFilter,
  newMemberSince,
  toNewMemberRow,
} from "./adminNewMembers.core.js";

export async function listNewMembers(now = new Date()) {
  const since = newMemberSince(now);
  const users = await User.find(buildNewMemberFilter(now))
    .select({
      name: 1,
      email: 1,
      role: 1,
      requestorKind: 1,
      business: 1,
      phoneNumber: 1,
      practiceProfile: 1,
      onboardingWizardCompleted: 1,
      active: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .limit(NEW_MEMBER_LIST_LIMIT)
    .lean();

  const members = (users || []).map(toNewMemberRow).filter((row) => row.id);
  return {
    days: NEW_MEMBER_VISIBLE_DAYS,
    since: since.toISOString(),
    count: members.length,
    members,
  };
}
