import { useOutletContext } from "react-router-dom";
import { WorksheetCncMachineSection } from "@/pages/manufacturer/cnc/components/WorksheetCncMachineSection";

export const MachiningPage = () => {
  const { worksheetSearch } = useOutletContext<{
    worksheetSearch: string;
  }>();

  return <WorksheetCncMachineSection searchQuery={worksheetSearch} />;
};
