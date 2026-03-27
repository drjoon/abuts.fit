export type SharedOnboardingStepId = "account" | "business";

export type MembershipRole = "owner" | "member";

export interface SharedAccountDraft {
  name: string;
  email: string;
}

export interface SharedBusinessDraft {
  membershipRole: MembershipRole;
  businessName: string;
  businessNumber: string;
  representativeName: string;
  phoneNumber: string;
  email: string;
  address: string;
  selectedBusinessId: string;
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
