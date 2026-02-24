export type SharedOnboardingStepId = "account" | "organization";

export type MembershipRole = "owner" | "member";

export interface SharedAccountDraft {
  name: string;
  email: string;
}

export interface SharedOrganizationDraft {
  membershipRole: MembershipRole;
  organizationName: string;
  businessNumber: string;
  representativeName: string;
  phoneNumber: string;
  email: string;
  address: string;
  selectedOrganizationId: string;
  searchKeyword: string;
}

export interface SharedOnboardingProgress {
  finishedAt?: string | null;
  steps?: Array<{
    stepId: string;
    status: string;
    doneAt?: string | null;
  }>;
}
