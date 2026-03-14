import { BusinessTab as SharedBusinessTab } from "@/shared/components/business/settings/BusinessTab";

interface BusinessTabProps {
  userData: {
    companyName?: string;
    role?: string;
    email?: string;
    name?: string;
  } | null;
}

export const BusinessTab = ({ userData }: BusinessTabProps) => {
  return (
    <SharedBusinessTab
      userData={userData}
      businessTypeOverride="manufacturer"
    />
  );
};
