import { BusinessTab as SharedBusinessTab } from "@/pages/requestor/settings/components/BusinessTab";

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
      organizationTypeOverride="manufacturer"
    />
  );
};
